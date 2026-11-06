import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SpacesService } from './spaces.service.js';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import {
  AvailabilityQueryDto,
  BlockDto,
  ScheduleDto,
  SpaceDto,
  SpaceQueryDto,
} from '../common/request.dto.js';
@ApiTags('Spaces')
@Controller('spaces')
export class SpacesController {
  constructor(@Inject(SpacesService) private spaces: SpacesService) {}
  @Get() list(@Query() query: SpaceQueryDto) {
    return this.spaces.list(query.search, query.category);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.spaces.get(id);
  }
  @Get(':id/availability') availability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.spaces.availability(id, query.date);
  }
}
@ApiTags('Owner spaces')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('owner/spaces')
export class OwnerSpacesController {
  constructor(@Inject(SpacesService) private spaces: SpacesService) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.spaces.ownerList(req.user);
  }
  @Post() create(@Req() req: AuthRequest, @Body() input: SpaceDto) {
    return this.spaces.save(req.user, input);
  }
  @Get(':id') get(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.spaces.requireOwner(req.user);
    return this.spaces.get(id, req.user);
  }
  @Put(':id') update(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SpaceDto,
  ) {
    return this.spaces.save(req.user, input, id);
  }
  @Get(':id/schedule') schedule(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.spaces.schedule(req.user, id);
  }
  @Put(':id/schedule') setSchedule(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ScheduleDto,
  ) {
    return this.spaces.setSchedule(req.user, id, input);
  }
  @Get(':id/blocks') blocks(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.spaces.blocks(req.user, id);
  }
  @Post(':id/blocks') block(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: BlockDto,
  ) {
    return this.spaces.addBlock(req.user, id, input);
  }
  @Delete(':id/blocks/:blockId') removeBlock(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ) {
    return this.spaces.removeBlock(req.user, id, blockId);
  }
}
