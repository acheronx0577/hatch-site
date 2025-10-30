import { IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { LeadScoreTier } from '@hatch/db';

import {
  CursorPaginationQueryDto,
  SearchQueryDto,
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalStringArray
} from '../../common';

const VALID_ACTIVITY_WINDOWS = new Set([7, 14, 30]);

class LeadsQueryBaseDto extends IntersectionType(CursorPaginationQueryDto, SearchQueryDto) {}

export class ListLeadsQueryDto extends LeadsQueryBaseDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsString({ each: true })
  stageId?: string[] | undefined;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsEnum(LeadScoreTier, { each: true })
  scoreTier?: LeadScoreTier[];

  @IsOptional()
  @Transform(({ value }) => {
    const parsed = toOptionalNumber(value);
    if (!parsed) return undefined;
    return VALID_ACTIVITY_WINDOWS.has(parsed) ? parsed : undefined;
  })
  lastActivityDays?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  preapproved?: boolean;

  @IsOptional()
  @IsString()
  pipelineId?: string;
}
