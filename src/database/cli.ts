import dataSource from './data-source.js';
import { UserEntity, SpaceEntity, WeeklyScheduleEntity } from './schema.js';
import { hashPassword } from '../auth/password.js';
const command = process.argv[2];
await dataSource.initialize();
try {
  if (command === 'migrate') {
    await dataSource.runMigrations();
    console.log('Migrations applied.');
  } else if (command === 'owner') {
    const [email, name] = process.argv.slice(3);
    const password = process.env.OWNER_PASSWORD;
    if (
      !email?.includes('@') ||
      !name ||
      !password ||
      password.length < 8 ||
      password.length > 128
    )
      throw new Error(
        'Set OWNER_PASSWORD (8–128 characters), then run npm run owner:create -- email name',
      );
    const repo = dataSource.getRepository(UserEntity);
    if (await repo.existsBy({ email: email.toLowerCase() }))
      throw new Error('Email already exists; no account was changed.');
    await repo.save({
      name,
      email: email.toLowerCase(),
      role: 'owner',
      passwordHash: await hashPassword(password),
    });
    console.log('Owner created.');
  } else if (command === 'seed') {
    const email = process.argv[3];
    const owner = await dataSource
      .getRepository(UserEntity)
      .findOneBy({ email, role: 'owner' });
    if (!owner)
      throw new Error('Create an owner first and pass their email to seed.');
    await dataSource.transaction(async (manager) => {
      for (const [name, category, slotMinutes, capacity] of [
        ['Quadra Jardim', 'sports_court', 60, 12],
        ['Salão Horizonte', 'party_hall', 240, 80],
        ['Consultório Aurora', 'office', 30, 4],
      ] as const) {
        if (
          await manager
            .getRepository(SpaceEntity)
            .existsBy({ ownerId: owner.id, name })
        )
          continue;
        const space = await manager.getRepository(SpaceEntity).save({
          ownerId: owner.id,
          name,
          category,
          slotMinutes,
          capacity,
          address: 'Rua das Flores, 100 — São Paulo, SP',
          description:
            'Um espaço acolhedor e bem equipado para o seu próximo encontro.',
          active: true,
        });
        await manager.getRepository(WeeklyScheduleEntity).save(
          Array.from({ length: 7 }, (_, weekday) => ({
            spaceId: space.id,
            weekday,
            startTime: '08:00',
            endTime: '20:00',
          })),
        );
      }
    });
    console.log('Demo spaces created.');
  } else throw new Error('Unknown command. Use migrate, owner or seed.');
} finally {
  await dataSource.destroy();
}
