import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from './schema.js';
import { Initial1793966400000 } from './migrations/1793966400000-Initial.js';

export const databaseOptions = {
  type: 'postgres' as const,
  url: process.env.DATABASE_URL,
  entities,
  migrations: [Initial1793966400000],
  synchronize: false,
};
export default new DataSource(databaseOptions);
