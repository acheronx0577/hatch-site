import { Type } from 'class-transformer';
import { IsEmail, IsISO8601, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class DemoBookingAvailabilityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;

  @IsOptional()
  @IsString()
  timeZone?: string;
}

export class DemoBookingRequestDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 160)
  brokerageName!: string;

  @IsISO8601()
  start!: string;

  @IsOptional()
  @IsString()
  agentCount?: string;

  @IsOptional()
  @IsString()
  challenge?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1200)
  notes?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsString()
  utmTerm?: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  // Honeypot field for bots. Should be empty.
  @IsOptional()
  @IsString()
  website?: string;
}

