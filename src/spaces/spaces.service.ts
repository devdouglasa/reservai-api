import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  SpaceEntity,
  WeeklyScheduleEntity,
  AvailabilityBlockEntity,
  BookingEntity,
  type User,
  type Space,
} from '../database/schema.js';
import { fail } from '../common/errors.js';
import type { BlockDto, ScheduleDto, SpaceDto } from '../common/request.dto.js';
import {
  generateSlots,
  overlaps,
  parseDay,
  validateSchedule,
} from '../availability/slots.js';
import { RealtimeGateway } from '../availability/realtime.gateway.js';

@Injectable()
export class SpacesService {
  constructor(
    @Inject(DataSource) public db: DataSource,
    @Inject(RealtimeGateway) public events: RealtimeGateway,
  ) {}
  requireOwner(user: User) {
    if (user.role !== 'owner')
      fail(403, 'FORBIDDEN', 'Acesso exclusivo para proprietários.');
  }
  async list(search?: string, category?: string) {
    const query = this.db
      .getRepository(SpaceEntity)
      .createQueryBuilder('space')
      .where('space.active = true');
    if (search)
      query.andWhere('space.name ILIKE :search', {
        search: `%${search.slice(0, 100)}%`,
      });
    if (category) query.andWhere('space.category = :category', { category });
    return query.orderBy('space.name').getMany();
  }
  async get(id: string, owner?: User) {
    const space = await this.db.getRepository(SpaceEntity).findOneBy({ id });
    if (!space || (owner ? space.ownerId !== owner.id : !space.active))
      fail(404, 'SPACE_NOT_FOUND', 'Espaço não encontrado.');
    return space;
  }
  async lock(manager: EntityManager, id: string, owner?: User) {
    const space = await manager
      .getRepository(SpaceEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!space || (owner && space.ownerId !== owner.id))
      fail(404, 'SPACE_NOT_FOUND', 'Espaço não encontrado.');
    return space;
  }
  async expire(manager: EntityManager, spaceId: string) {
    const result = await manager
      .getRepository(BookingEntity)
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where(
        '"spaceId" = :spaceId AND status = :status AND "startsAt" <= :now',
        { spaceId, status: 'pending', now: new Date() },
      )
      .returning(['userId'])
      .execute();
    return (result.raw as { userId: string }[]).map((item) => item.userId);
  }
  async availability(id: string, date: string) {
    parseDay(date);
    const result = await this.db.transaction(async (manager) => {
      const space = await this.lock(manager, id);
      if (!space.active) fail(404, 'SPACE_NOT_FOUND', 'Espaço não encontrado.');
      const expiredUserIds = await this.expire(manager, id);
      return {
        slots: await this.slots(manager, space, date),
        expiredUserIds,
        ownerId: space.ownerId,
      };
    });
    if (result.expiredUserIds.length)
      this.events.changed(id, [result.ownerId, ...result.expiredUserIds]);
    return result.slots;
  }
  async slots(manager: EntityManager, space: Space, date: string) {
    const intervals = await manager
      .getRepository(WeeklyScheduleEntity)
      .findBy({ spaceId: space.id });
    const bookings = await manager.getRepository(BookingEntity).findBy([
      { spaceId: space.id, status: 'pending' },
      { spaceId: space.id, status: 'confirmed' },
    ]);
    const blocks = await manager
      .getRepository(AvailabilityBlockEntity)
      .findBy({ spaceId: space.id });
    return generateSlots(date, space.slotMinutes, intervals).map((slot) => {
      const interval = {
        startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt),
      };
      return {
        ...slot,
        available:
          interval.startsAt > new Date() &&
          ![...bookings, ...blocks].some((item) => overlaps(interval, item)),
      };
    });
  }
  async ownerList(user: User) {
    this.requireOwner(user);
    return this.db
      .getRepository(SpaceEntity)
      .find({ where: { ownerId: user.id }, order: { name: 'ASC' } });
  }
  async save(user: User, input: SpaceDto, id?: string) {
    this.requireOwner(user);
    const result = await this.db.transaction(async (manager) => {
      const existing = id ? await this.lock(manager, id, user) : {};
      return manager.getRepository(SpaceEntity).save({
        ...existing,
        name: input.name,
        description: input.description,
        address: input.address,
        category: input.category,
        capacity: input.capacity,
        slotMinutes: input.slotMinutes,
        active: input.active,
        imageUrl: input.imageUrl || null,
        ownerId: user.id,
      });
    });
    this.events.changed(result.id, [user.id]);
    return result;
  }
  async schedule(user: User, id: string) {
    this.requireOwner(user);
    await this.get(id, user);
    return this.db.getRepository(WeeklyScheduleEntity).find({
      where: { spaceId: id },
      order: { weekday: 'ASC', startTime: 'ASC' },
    });
  }
  async setSchedule(user: User, id: string, input: ScheduleDto) {
    this.requireOwner(user);
    validateSchedule(input.intervals);
    await this.db.transaction(async (manager) => {
      await this.lock(manager, id, user);
      await manager.getRepository(WeeklyScheduleEntity).delete({ spaceId: id });
      if (input.intervals.length)
        await manager.getRepository(WeeklyScheduleEntity).save(
          input.intervals.map((interval) => ({
            weekday: interval.weekday,
            startTime: interval.startTime,
            endTime: interval.endTime,
            spaceId: id,
          })),
        );
    });
    this.events.changed(id, [user.id]);
    return this.schedule(user, id);
  }
  async blocks(user: User, id: string) {
    this.requireOwner(user);
    await this.get(id, user);
    return this.db
      .getRepository(AvailabilityBlockEntity)
      .find({ where: { spaceId: id }, order: { startsAt: 'ASC' } });
  }
  async addBlock(user: User, id: string, input: BlockDto) {
    this.requireOwner(user);
    const interval = {
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    };
    if (interval.endsAt <= interval.startsAt || interval.endsAt <= new Date())
      fail(
        400,
        'INVALID_INTERVAL',
        'Informe um intervalo futuro com término após o início.',
      );
    const result = await this.db.transaction(async (manager) => {
      await this.lock(manager, id, user);
      const expiredUserIds = await this.expire(manager, id);
      const bookings = await manager.getRepository(BookingEntity).findBy([
        { spaceId: id, status: 'pending' },
        { spaceId: id, status: 'confirmed' },
      ]);
      if (bookings.some((item) => overlaps(interval, item)))
        fail(
          409,
          'BOOKING_CONFLICT',
          'Cancele as reservas deste intervalo antes de criar o bloqueio.',
        );
      const block = await manager
        .getRepository(AvailabilityBlockEntity)
        .save({ ...interval, spaceId: id, reason: input.reason });
      return { block, expiredUserIds };
    });
    this.events.changed(id, [user.id, ...result.expiredUserIds]);
    return result.block;
  }
  async removeBlock(user: User, id: string, blockId: string) {
    this.requireOwner(user);
    await this.db.transaction(async (manager) => {
      await this.lock(manager, id, user);
      await manager
        .getRepository(AvailabilityBlockEntity)
        .delete({ id: blockId, spaceId: id });
    });
    this.events.changed(id, [user.id]);
    return { message: 'Bloqueio removido.' };
  }
}
