import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service.js';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { BookingDto } from '../common/request.dto.js';
@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private bookings: BookingsService) {}
  @Post() create(@Req() req: AuthRequest, @Body() input: BookingDto) {
    return this.bookings.create(req.user, input);
  }
  @Get('me') list(@Req() req: AuthRequest) {
    return this.bookings.list(req.user);
  }
  @Post(':id/cancel') cancel(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.transition(req.user, id, 'cancel');
  }
}
@ApiTags('Owner bookings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('owner/bookings')
export class OwnerBookingsController {
  constructor(@Inject(BookingsService) private bookings: BookingsService) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.bookings.list(req.user, true);
  }
  @Post(':id/approve') approve(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.transition(req.user, id, 'approve', true);
  }
  @Post(':id/reject') reject(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.transition(req.user, id, 'reject', true);
  }
  @Post(':id/cancel') cancel(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.transition(req.user, id, 'cancel', true);
  }
}
