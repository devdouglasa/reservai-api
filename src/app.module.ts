import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createObserveModule } from '@nestjs/observe';
import { databaseOptions } from './database/data-source.js';
import { AuthModule } from './auth/auth.module.js';
import { SpacesModule } from './spaces/spaces.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
const observe =
  process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
    ? createObserveModule()
    : undefined;
export const ObserveInstrument = observe?.ObserveInstrument;
@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions),
    AuthModule,
    SpacesModule,
    BookingsModule,
    ...(observe
      ? [
          observe.ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY!,
            appSecret: process.env.OBSERVE_APP_SECRET!,
            serviceId: 'reservai-api',
          }),
        ]
      : []),
  ],
})
export class AppModule {}
