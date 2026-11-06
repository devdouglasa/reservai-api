import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Logger,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  BookingEntity,
  type BookingStatus,
  type User,
} from '../database/schema.js';
import { SpacesService } from '../spaces/spaces.service.js';
import { fail } from '../common/errors.js';
import type { BookingDto } from '../common/request.dto.js';
import { parseDay, TIME_ZONE } from '../availability/slots.js';

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private logger = new Logger('BookingsService');
  constructor(@Inject(SpacesService) private spaces: SpacesService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.expireDue().catch((error) => this.logger.error(error));
    }, 15000);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async expireDue() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.spaces.db
        .getRepository(BookingEntity)
        .createQueryBuilder('booking')
        .where('booking.status = :status AND booking.startsAt <= :now', {
          status: 'pending',
          now: new Date(),
        })
        .getMany();
      for (const spaceId of new Set(due.map((booking) => booking.spaceId))) {
        const ownerId = await this.spaces.db.transaction(async (manager) => {
          const space = await this.spaces.lock(manager, spaceId);
          await this.spaces.expire(manager, spaceId);
          return space.ownerId;
        });
        this.spaces.events.changed(spaceId, [
          ownerId,
          ...due
            .filter((booking) => booking.spaceId === spaceId)
            .map((booking) => booking.userId),
        ]);
      }
    } finally {
      this.running = false;
    }
  }
  async create(user: User, input: BookingDto) {
    const start = DateTime.fromISO(input.startsAt, { setZone: true });
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(input.startsAt))
      fail(400, 'INVALID_DATE', 'Informe o fuso horário.');
    const date = start.setZone(TIME_ZONE).toISODate() ?? '';
    parseDay(date);
    const result = await this.spaces.db.transaction(async (manager) => {
      const space = await this.spaces.lock(manager, input.spaceId);
      if (!space.active)
        fail(
          409,
          'SPACE_INACTIVE',
          'Este espaço não está disponível para reservas.',
        );
      const expiredUserIds = await this.spaces.expire(manager, space.id);
      const slots = await this.spaces.slots(manager, space, date);
      const slot = slots.find(
        (item) => new Date(item.startsAt).getTime() === start.toMillis(),
      );
      if (!slot?.available)
        fail(
          409,
          'SLOT_UNAVAILABLE',
          'Este horário não está mais disponível. Escolha outro.',
        );
      const booking = await manager.getRepository(BookingEntity).save({
        spaceId: space.id,
        userId: user.id,
        startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt),
        status: 'pending',
      });
      return { booking, ownerId: space.ownerId, expiredUserIds };
    });
    this.spaces.events.changed(input.spaceId, [
      user.id,
      result.ownerId,
      ...result.expiredUserIds,
    ]);
    return result.booking;
  }
  async list(user: User, owner = false) {
    if (owner) this.spaces.requireOwner(user);
    await this.expireDue();
    const query = this.spaces.db
      .getRepository(BookingEntity)
      .createQueryBuilder('booking')
      .innerJoin('Space', 'space', 'space.id = booking.spaceId')
      .innerJoin('User', 'customer', 'customer.id = booking.userId')
      .select([
        'booking.id AS "id"',
        'booking.spaceId AS "spaceId"',
        'booking.startsAt AS "startsAt"',
        'booking.endsAt AS "endsAt"',
        'booking.status AS "status"',
        'space.name AS "spaceName"',
        'customer.name AS "customerName"',
      ])
      .where(owner ? 'space.ownerId = :id' : 'booking.userId = :id', {
        id: user.id,
      })
      .orderBy('booking.startsAt', 'DESC');
    return query.getRawMany();
  }
  async transition(
    user: User,
    id: string,
    action: 'approve' | 'reject' | 'cancel',
    owner = false,
  ) {
    if (owner) this.spaces.requireOwner(user);
    const found = await this.spaces.db
      .getRepository(BookingEntity)
      .findOneBy({ id });
    if (!found) fail(404, 'BOOKING_NOT_FOUND', 'Reserva não encontrada.');
    const result = await this.spaces.db.transaction(async (manager) => {
      const space = await this.spaces.lock(
        manager,
        found.spaceId,
        owner ? user : undefined,
      );
      await this.spaces.expire(manager, found.spaceId);
      const booking = await manager
        .getRepository(BookingEntity)
        .findOneByOrFail({ id });
      if (!owner && booking.userId !== user.id)
        fail(404, 'BOOKING_NOT_FOUND', 'Reserva não encontrada.');
      if (
        booking.startsAt <= new Date() ||
        !['pending', 'confirmed'].includes(booking.status)
      )
        fail(
          409,
          'INVALID_TRANSITION',
          'Esta reserva não pode mais ser alterada.',
        );
      if (action !== 'cancel' && (!owner || booking.status !== 'pending'))
        fail(
          409,
          'INVALID_TRANSITION',
          'Somente solicitações pendentes podem ser aprovadas ou recusadas.',
        );
      booking.status = (
        {
          approve: 'confirmed',
          reject: 'rejected',
          cancel: 'cancelled',
        } as Record<string, BookingStatus>
      )[action]!;
      await manager.getRepository(BookingEntity).save(booking);
      return { booking, ownerId: space.ownerId };
    });
    this.spaces.events.changed(found.spaceId, [result.ownerId, found.userId]);
    return result.booking;
  }
}
