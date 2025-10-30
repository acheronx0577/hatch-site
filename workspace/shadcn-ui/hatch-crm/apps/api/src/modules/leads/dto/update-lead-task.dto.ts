import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { LeadTaskStatus } from '@hatch/db';

export class UpdateLeadTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value ? value.toUpperCase() : value))
  @IsEnum(LeadTaskStatus)
  status?: LeadTaskStatus;
}

