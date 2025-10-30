import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { LeadTaskStatus } from '@hatch/db';

export class CreateLeadTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? value.toUpperCase() : value))
  @IsEnum(LeadTaskStatus)
  status?: LeadTaskStatus;
}
