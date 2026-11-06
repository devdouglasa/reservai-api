import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module.js';
import { BookingsService } from './bookings.service.js';
import {
  BookingsController,
  OwnerBookingsController,
} from './bookings.controller.js';
@Module({
  imports: [SpacesModule],
  providers: [BookingsService],
  controllers: [BookingsController, OwnerBookingsController],
})
export class BookingsModule {}
