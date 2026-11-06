import { EntitySchema } from 'typeorm';

export type Role = 'customer' | 'owner';
export type Category = 'sports_court' | 'party_hall' | 'office';
export type BookingStatus =
  'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';
export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}
export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}
export interface Space {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: Category;
  address: string;
  capacity: number;
  imageUrl: string | null;
  slotMinutes: number;
  active: boolean;
}
export interface WeeklySchedule {
  id: string;
  spaceId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}
export interface AvailabilityBlock {
  id: string;
  spaceId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}
export interface Booking {
  id: string;
  spaceId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  createdAt: Date;
}
const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const };
export const UserEntity = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  columns: {
    id,
    name: { type: String },
    email: { type: String, unique: true },
    passwordHash: { type: String },
    role: { type: String },
  },
});
export const SessionEntity = new EntitySchema<Session>({
  name: 'Session',
  tableName: 'sessions',
  columns: {
    id,
    userId: { type: 'uuid' },
    tokenHash: { type: String, unique: true },
    expiresAt: { type: 'timestamptz' },
  },
});
export const SpaceEntity = new EntitySchema<Space>({
  name: 'Space',
  tableName: 'spaces',
  columns: {
    id,
    ownerId: { type: 'uuid' },
    name: { type: String },
    description: { type: String },
    category: { type: String },
    address: { type: String },
    capacity: { type: Number },
    imageUrl: { type: String, nullable: true },
    slotMinutes: { type: Number },
    active: { type: Boolean, default: true },
  },
});
export const WeeklyScheduleEntity = new EntitySchema<WeeklySchedule>({
  name: 'WeeklySchedule',
  tableName: 'weekly_schedules',
  columns: {
    id,
    spaceId: { type: 'uuid' },
    weekday: { type: Number },
    startTime: { type: String },
    endTime: { type: String },
  },
});
export const AvailabilityBlockEntity = new EntitySchema<AvailabilityBlock>({
  name: 'AvailabilityBlock',
  tableName: 'availability_blocks',
  columns: {
    id,
    spaceId: { type: 'uuid' },
    startsAt: { type: 'timestamptz' },
    endsAt: { type: 'timestamptz' },
    reason: { type: String },
  },
});
export const BookingEntity = new EntitySchema<Booking>({
  name: 'Booking',
  tableName: 'bookings',
  columns: {
    id,
    spaceId: { type: 'uuid' },
    userId: { type: 'uuid' },
    startsAt: { type: 'timestamptz' },
    endsAt: { type: 'timestamptz' },
    status: { type: String },
    createdAt: { type: 'timestamptz', createDate: true },
  },
});
export const entities = [
  UserEntity,
  SessionEntity,
  SpaceEntity,
  WeeklyScheduleEntity,
  AvailabilityBlockEntity,
  BookingEntity,
];
