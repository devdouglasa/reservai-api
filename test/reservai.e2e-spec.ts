import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Test the TypeScript-compiled application, including emitted decorator metadata.
const compiled = (path: string) => pathToFileURL(resolve('dist', path)).href;
const modulePath = compiled('app.module.js');
const setupPath = compiled('setup.js');
const passwordPath = compiled('auth/password.js');
let app: INestApplication;
let db: DataSource;
let ownerToken: string;
let otherOwnerToken: string;
let customerToken: string;
let otherCustomerToken: string;
let ownerId: string;
let spaceId: string;
let customerId: string;
let publicSocket: Socket;
let privateSocket: Socket;
const password = randomBytes(18).toString('hex');
const tomorrow = DateTime.now()
  .setZone('America/Sao_Paulo')
  .plus({ days: 1 })
  .toISODate()!;
const startAt = (hour: number) =>
  `${tomorrow}T${String(hour).padStart(2, '0')}:00:00-03:00`;
const send = (
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  token?: string,
) => {
  const req = request(app.getHttpServer())
    [method](`/api/v1${path}`)
    .set('X-Client-Platform', 'native');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const spaceInput = {
  name: 'Quadra de teste',
  description: 'Espaço para testar reservas concorrentes',
  address: 'Rua de teste, 123',
  category: 'sports_court',
  capacity: 10,
  slotMinutes: 60,
  active: true,
};
beforeAll(async () => {
  if (
    !process.env.DATABASE_URL ||
    !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')
  )
    throw new Error('Integration tests require DATABASE_URL ending in _test.');
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  delete process.env.OBSERVE_APP_KEY;
  delete process.env.OBSERVE_APP_SECRET;
  const { AppModule } = await import(modulePath);
  const { setupApp } = await import(setupPath);
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  db = app.get(DataSource);
  await db.runMigrations();
  await db.query(
    'TRUNCATE bookings, availability_blocks, weekly_schedules, spaces, sessions, users CASCADE',
  );
  await app.listen(0, '127.0.0.1');
  const { hashPassword } = await import(passwordPath);
  for (const email of ['owner@test.local', 'other-owner@test.local'])
    await db.getRepository('User').save({
      name: 'Proprietário',
      email,
      passwordHash: await hashPassword(password),
      role: 'owner',
    });
  const owner = await send('post', '/auth/login')
    .send({ email: 'owner@test.local', password })
    .expect(201);
  ownerToken = owner.body.accessToken;
  ownerId = owner.body.user.id;
  otherOwnerToken = (
    await send('post', '/auth/login')
      .send({ email: 'other-owner@test.local', password })
      .expect(201)
  ).body.accessToken;
  const customer = await send('post', '/auth/register')
    .send({ name: 'Cliente', email: 'customer@test.local', password })
    .expect(201);
  customerToken = customer.body.accessToken;
  customerId = customer.body.user.id;
  otherCustomerToken = (
    await send('post', '/auth/register')
      .send({ name: 'Outro cliente', email: 'other@test.local', password })
      .expect(201)
  ).body.accessToken;
  spaceId = (
    await send('post', '/owner/spaces', ownerToken).send(spaceInput).expect(201)
  ).body.id;
  await send('put', `/owner/spaces/${spaceId}/schedule`, ownerToken)
    .send({
      intervals: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: '08:00',
        endTime: '20:00',
      })),
    })
    .expect(200);
  const url = await app.getUrl();
  publicSocket = io(url, { transports: ['websocket'] });
  privateSocket = io(url, {
    transports: ['websocket'],
    auth: { token: ownerToken },
  });
  await Promise.all(
    [publicSocket, privateSocket].map(
      (socket) =>
        new Promise<void>((resolve, reject) => {
          socket.on('connect', resolve);
          socket.on('connect_error', reject);
        }),
    ),
  );
  // Wait for the asynchronous authenticated room join, not just the transport handshake.
  await vi.waitFor(async () => {
    const gateway = app.get(
      (await import(compiled('availability/realtime.gateway.js')))
        .RealtimeGateway,
    );
    expect(
      gateway.server.sockets.adapter.rooms.get(`user:${ownerId}`)?.size,
    ).toBe(1);
  });
}, 30000);
afterAll(async () => {
  publicSocket?.disconnect();
  privateSocket?.disconnect();
  await app?.close();
});

it('validates registration, prevents role injection, and rejects invalid credentials', async () => {
  await send('post', '/auth/register')
    .send({
      name: 'Intruso',
      email: 'inject@test.local',
      password,
      role: 'owner',
    })
    .expect(400);
  await send('post', '/auth/register')
    .send({ name: 'Cliente', email: 'CUSTOMER@test.local', password })
    .expect(409);
  await send('post', '/auth/login')
    .send({ email: 'customer@test.local', password: 'incorrect-password' })
    .expect(401);
  await send('post', '/owner/spaces', customerToken)
    .send(spaceInput)
    .expect(403);
});
it('rotates native refresh tokens and revokes access on logout', async () => {
  const login = await send('post', '/auth/login')
    .send({ email: 'customer@test.local', password })
    .expect(201);
  const refreshed = await send('post', '/auth/refresh')
    .send({ refreshToken: login.body.refreshToken })
    .expect(201);
  await send('post', '/auth/refresh')
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
  await send('post', '/auth/logout')
    .send({ refreshToken: refreshed.body.refreshToken })
    .expect(201);
  await send('get', '/auth/me', refreshed.body.accessToken).expect(401);
});
it('uses HttpOnly cookies on web and rejects untrusted origins', async () => {
  const web = request.agent(app.getHttpServer());
  const login = await web
    .post('/api/v1/auth/login')
    .send({ email: 'customer@test.local', password })
    .expect(201);
  expect(login.body.refreshToken).toBeUndefined();
  expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
  await web.post('/api/v1/auth/refresh').send({}).expect(201);
  await web
    .post('/api/v1/auth/logout')
    .set('Origin', 'https://untrusted.example')
    .send({})
    .expect(403);
  await web.post('/api/v1/auth/logout').send({}).expect(201);
  await web.post('/api/v1/auth/refresh').send({}).expect(401);
});
it('accepts only one simultaneous request and broadcasts privacy-safe events', async () => {
  const availability = new Promise<Record<string, unknown>>((resolve) =>
    publicSocket.once('availability.changed', resolve),
  );
  const privateEvent = new Promise<Record<string, unknown>>((resolve) =>
    privateSocket.once('bookings.changed', resolve),
  );
  const results = await Promise.all(
    [customerToken, otherCustomerToken].map((token) =>
      send('post', '/bookings', token).send({ spaceId, startsAt: startAt(9) }),
    ),
  );
  expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([
    201, 409,
  ]);
  expect(await availability).toEqual({ spaceId });
  expect(await privateEvent).toEqual({ spaceId });
  const winner = results.find((result) => result.status === 201)!.body;
  await send(
    'post',
    `/owner/bookings/${winner.id}/approve`,
    otherOwnerToken,
  ).expect(404);
  const otherToken =
    winner.userId === customerId ? otherCustomerToken : customerToken;
  await send('post', `/bookings/${winner.id}/cancel`, otherToken).expect(404);
  await send('post', `/owner/bookings/${winner.id}/approve`, ownerToken).expect(
    201,
  );
  await send('post', `/owner/bookings/${winner.id}/reject`, ownerToken).expect(
    409,
  );
  await send('post', `/owner/spaces/${spaceId}/blocks`, ownerToken)
    .send({ startsAt: startAt(9), endsAt: startAt(10), reason: 'Manutenção' })
    .expect(409);
  await send('post', `/owner/bookings/${winner.id}/cancel`, ownerToken).expect(
    201,
  );
  const slots = await send(
    'get',
    `/spaces/${spaceId}/availability?date=${tomorrow}`,
  ).expect(200);
  expect(
    slots.body.find(
      (slot: { startsAt: string }) =>
        Date.parse(slot.startsAt) === Date.parse(startAt(9)),
    ).available,
  ).toBe(true);
});
it('serializes a block and booking racing for the same interval', async () => {
  const results = await Promise.all([
    send('post', '/bookings', customerToken).send({
      spaceId,
      startsAt: startAt(11),
    }),
    send('post', `/owner/spaces/${spaceId}/blocks`, ownerToken).send({
      startsAt: startAt(11),
      endsAt: startAt(12),
      reason: 'Manutenção',
    }),
  ]);
  expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([
    201, 409,
  ]);
});
it('isolates owner data and preserves reservations when the schedule changes', async () => {
  await send(
    'get',
    `/owner/spaces/${spaceId}/schedule`,
    otherOwnerToken,
  ).expect(404);
  await send('put', `/owner/spaces/${spaceId}`, otherOwnerToken)
    .send(spaceInput)
    .expect(404);
  const booking = await send('post', '/bookings', customerToken)
    .send({ spaceId, startsAt: startAt(14) })
    .expect(201);
  await send('put', `/owner/spaces/${spaceId}/schedule`, ownerToken)
    .send({
      intervals: [
        {
          weekday: DateTime.fromISO(tomorrow).weekday % 7,
          startTime: '14:30',
          endTime: '18:30',
        },
      ],
    })
    .expect(200);
  await send('post', '/bookings', otherCustomerToken)
    .send({ spaceId, startsAt: `${tomorrow}T14:30:00-03:00` })
    .expect(409);
  await send(
    'post',
    `/owner/bookings/${booking.body.id}/reject`,
    ownerToken,
  ).expect(201);
  await send('post', '/bookings', otherCustomerToken)
    .send({ spaceId, startsAt: `${tomorrow}T14:30:00-03:00` })
    .expect(201);
  expect(
    (await send('get', '/owner/bookings', otherOwnerToken).expect(200)).body,
  ).toHaveLength(0);
});
it('expires unanswered requests and prevents late approval', async () => {
  const pending = await db.getRepository('Booking').save({
    spaceId,
    userId: customerId,
    startsAt: new Date(Date.now() - 60000),
    endsAt: new Date(Date.now() + 60000),
    status: 'pending',
  });
  const list = await send('get', '/bookings/me', customerToken).expect(200);
  expect(
    list.body.find((booking: { id: string }) => booking.id === pending.id)
      .status,
  ).toBe('expired');
  await send(
    'post',
    `/owner/bookings/${pending.id}/approve`,
    ownerToken,
  ).expect(409);
});
it('notifies the owner when availability queries expire an unanswered request', async () => {
  const pending = await db.getRepository('Booking').save({
    spaceId,
    userId: customerId,
    startsAt: new Date(Date.now() - 60000),
    endsAt: new Date(Date.now() + 60000),
    status: 'pending',
  });
  const event = new Promise<Record<string, unknown>>((resolve) =>
    privateSocket.once('bookings.changed', resolve),
  );
  await send('get', `/spaces/${spaceId}/availability?date=${tomorrow}`).expect(
    200,
  );
  expect(await event).toEqual({ spaceId });
  expect(
    (await db.getRepository('Booking').findOneByOrFail({ id: pending.id }))
      .status,
  ).toBe('expired');
});
it('supports customer cancellation and owner-only removal of blocks', async () => {
  const booking = await send('post', '/bookings', customerToken)
    .send({ spaceId, startsAt: `${tomorrow}T16:30:00-03:00` })
    .expect(201);
  await send(
    'post',
    `/bookings/${booking.body.id}/cancel`,
    customerToken,
  ).expect(201);
  const block = await send(
    'post',
    `/owner/spaces/${spaceId}/blocks`,
    ownerToken,
  )
    .send({
      startsAt: `${tomorrow}T16:30:00-03:00`,
      endsAt: `${tomorrow}T17:30:00-03:00`,
      reason: 'Manutenção',
    })
    .expect(201);
  await send(
    'delete',
    `/owner/spaces/${spaceId}/blocks/${block.body.id}`,
    otherOwnerToken,
  ).expect(404);
  await send(
    'delete',
    `/owner/spaces/${spaceId}/blocks/${block.body.id}`,
    ownerToken,
  ).expect(200);
  await send('post', '/bookings', customerToken)
    .send({ spaceId, startsAt: `${tomorrow}T16:30:00-03:00` })
    .expect(201);
});
it('rejects malformed queries and overlapping schedules', async () => {
  await send('get', '/spaces?search[name]=quadra').expect(400);
  await send('get', `/spaces/${spaceId}/availability`).expect(400);
  await send('put', `/owner/spaces/${spaceId}/schedule`, ownerToken)
    .send({
      intervals: [
        { weekday: 1, startTime: '08:00', endTime: '10:00' },
        { weekday: 1, startTime: '09:00', endTime: '11:00' },
      ],
    })
    .expect(400);
  await send('post', `/owner/spaces/${spaceId}/blocks`, ownerToken)
    .send({ startsAt: tomorrow, endsAt: tomorrow, reason: 'Inválido' })
    .expect(400);
});
it('receives booking transitions after reconnecting the authenticated socket', async () => {
  privateSocket.disconnect();
  const connected = new Promise<void>((resolve, reject) => {
    privateSocket.once('connect', resolve);
    privateSocket.once('connect_error', reject);
  });
  privateSocket.connect();
  await connected;
  await vi.waitFor(async () => {
    const gateway = app.get(
      (await import(compiled('availability/realtime.gateway.js')))
        .RealtimeGateway,
    );
    expect(
      gateway.server.sockets.adapter.rooms.get(`user:${ownerId}`)?.size,
    ).toBe(1);
  });
  const expectChange = async (operation: () => PromiseLike<unknown>) => {
    const event = new Promise<Record<string, unknown>>((resolve) =>
      privateSocket.once('bookings.changed', resolve),
    );
    await operation();
    expect(await event).toEqual({ spaceId });
  };
  let bookingId = '';
  await expectChange(async () => {
    const result = await send('post', '/bookings', customerToken)
      .send({ spaceId, startsAt: `${tomorrow}T15:30:00-03:00` })
      .expect(201);
    bookingId = result.body.id;
  });
  await expectChange(() =>
    send('post', `/owner/bookings/${bookingId}/approve`, ownerToken).expect(
      201,
    ),
  );
  await expectChange(() =>
    send('post', `/bookings/${bookingId}/cancel`, customerToken).expect(201),
  );
  await expectChange(async () => {
    const result = await send('post', '/bookings', customerToken)
      .send({ spaceId, startsAt: `${tomorrow}T15:30:00-03:00` })
      .expect(201);
    bookingId = result.body.id;
  });
  await expectChange(() =>
    send('post', `/owner/bookings/${bookingId}/reject`, ownerToken).expect(201),
  );
});
it('rejects invalid dates and inactive spaces', async () => {
  await send('get', `/spaces/${spaceId}/availability?date=2026-02-30`).expect(
    400,
  );
  await send('post', '/bookings', customerToken)
    .send({ spaceId, startsAt: DateTime.now().plus({ days: 92 }).toISO() })
    .expect(400);
  await send('put', `/owner/spaces/${spaceId}`, ownerToken)
    .send({ ...spaceInput, active: false })
    .expect(200);
  await send('post', '/bookings', customerToken)
    .send({ spaceId, startsAt: startAt(18) })
    .expect(409);
});
