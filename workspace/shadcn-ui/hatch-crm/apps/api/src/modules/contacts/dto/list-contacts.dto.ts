import { IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ConsentStatus, PersonStage } from '@hatch/db';

import {
  CursorPaginationQueryDto,
  SearchQueryDto,
  toOptionalBoolean,
  toOptionalStringArray
} from '../../common';

class ContactsQueryBaseDto extends IntersectionType(CursorPaginationQueryDto, SearchQueryDto) {}

export class ListContactsQueryDto extends ContactsQueryBaseDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsEnum(PersonStage, { each: true })
  stage?: PersonStage[];

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsString({ each: true })
  ownerId?: string[];

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsString({ each: true })
  teamId?: string[];

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsString({ each: true })
  source?: string[];

  @IsOptional()
  @IsString()
  createdFrom?: string;

  @IsOptional()
  @IsString()
  createdTo?: string;

  @IsOptional()
  @IsString()
  lastActivityFrom?: string;

  @IsOptional()
  @IsString()
  lastActivityTo?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsEnum(ConsentStatus, { each: true })
  emailConsent?: ConsentStatus[];

  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsEnum(ConsentStatus, { each: true })
  smsConsent?: ConsentStatus[];

  @IsOptional()
  @IsString()
  buyerRepStatus?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  hasOpenDeal?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  doNotContact?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  includeDeleted?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortDirection: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  savedViewId?: string;
}
