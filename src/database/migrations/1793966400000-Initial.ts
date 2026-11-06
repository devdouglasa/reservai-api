import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1793966400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar NOT NULL, email varchar NOT NULL UNIQUE, "passwordHash" varchar NOT NULL, role varchar NOT NULL CHECK (role IN ('customer','owner')));
      CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, "tokenHash" varchar NOT NULL UNIQUE, "expiresAt" timestamptz NOT NULL);
      CREATE TABLE spaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL REFERENCES users(id), name varchar NOT NULL, description varchar NOT NULL, category varchar NOT NULL CHECK (category IN ('sports_court','party_hall','office')), address varchar NOT NULL, capacity integer NOT NULL CHECK (capacity > 0), "imageUrl" varchar, "slotMinutes" integer NOT NULL CHECK ("slotMinutes" BETWEEN 15 AND 720), active boolean NOT NULL DEFAULT true);
      CREATE TABLE weekly_schedules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "spaceId" uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6), "startTime" varchar NOT NULL, "endTime" varchar NOT NULL, CHECK ("startTime" < "endTime"));
      CREATE TABLE availability_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "spaceId" uuid NOT NULL REFERENCES spaces(id), "startsAt" timestamptz NOT NULL, "endsAt" timestamptz NOT NULL, reason varchar NOT NULL, CHECK ("endsAt" > "startsAt"));
      CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "spaceId" uuid NOT NULL REFERENCES spaces(id), "userId" uuid NOT NULL REFERENCES users(id), "startsAt" timestamptz NOT NULL, "endsAt" timestamptz NOT NULL, status varchar NOT NULL CHECK (status IN ('pending','confirmed','rejected','cancelled','expired')), "createdAt" timestamptz NOT NULL DEFAULT now(), CHECK ("endsAt" > "startsAt"));
      CREATE INDEX booking_availability ON bookings ("spaceId", "startsAt", "endsAt") WHERE status IN ('pending','confirmed');
      CREATE INDEX booking_user ON bookings ("userId");
      CREATE INDEX space_owner ON spaces ("ownerId");
      CREATE INDEX schedule_space ON weekly_schedules ("spaceId");
      CREATE INDEX block_space ON availability_blocks ("spaceId", "startsAt");
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE bookings, availability_blocks, weekly_schedules, spaces, sessions, users',
    );
  }
}
