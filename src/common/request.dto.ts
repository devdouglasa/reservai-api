import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Category } from '../database/schema.js';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) email!: string;
  @IsString()
  @Length(8, 128, { message: 'A senha deve ter entre 8 e 128 caracteres.' })
  password!: string;
}
export class RegisterDto extends LoginDto {
  @IsString()
  @Length(2, 100, { message: 'O nome deve ter entre 2 e 100 caracteres.' })
  name!: string;
}
export class RefreshDto {
  @IsOptional() @IsString() @Length(20, 256) refreshToken?: string;
}
export class SpaceDto {
  @IsString() @Length(2, 100) @Matches(/\S/) name!: string;
  @IsString() @Length(5, 2000) @Matches(/\S/) description!: string;
  @IsIn(['sports_court', 'party_hall', 'office']) category!: Category;
  @IsString() @Length(5, 300) @Matches(/\S/) address!: string;
  @IsInt() @Min(1) @Max(100000) capacity!: number;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl?: string | null;
  @IsInt() @Min(15) @Max(720) slotMinutes!: number;
  @IsBoolean() active!: boolean;
}
export class ScheduleEntryDto {
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
}
export class ScheduleDto {
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  intervals!: ScheduleEntryDto[];
}
export class BlockDto {
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsISO8601({ strict: true }) @Matches(/(Z|[+-]\d{2}:\d{2})$/) endsAt!: string;
  @IsString() @Length(2, 200) reason!: string;
}
export class BookingDto {
  @IsUUID() spaceId!: string;
  @IsISO8601({ strict: true }) startsAt!: string;
}
export class SpaceQueryDto {
  @IsOptional() @IsString() @Length(0, 100) search?: string;
  @IsOptional()
  @IsIn(['', 'sports_court', 'party_hall', 'office'])
  category?: string;
}
export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
}
