import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module.js';
import { SpacesService } from './spaces.service.js';
import {
  SpacesController,
  OwnerSpacesController,
} from './spaces.controller.js';
@Module({
  imports: [AvailabilityModule],
  providers: [SpacesService],
  controllers: [SpacesController, OwnerSpacesController],
  exports: [SpacesService],
})
export class SpacesModule {}
