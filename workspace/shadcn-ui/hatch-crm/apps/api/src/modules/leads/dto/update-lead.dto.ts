import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

import { LeadFitInput, toBoolean } from './create-lead.dto';

const LEAD_TYPE_VALUES = ['BUYER', 'SELLER', 'UNKNOWN'] as const;

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsIn(LEAD_TYPE_VALUES)
  leadType?: (typeof LEAD_TYPE_VALUES)[number];

  @IsOptional()
  @IsString()
  source?: string;

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
  gclid?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  consentEmail?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  consentSMS?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  doNotContact?: boolean;

  @IsOptional()
  fit?: LeadFitInput | null;

  @IsOptional()
  @IsString()
  notes?: string;
}
