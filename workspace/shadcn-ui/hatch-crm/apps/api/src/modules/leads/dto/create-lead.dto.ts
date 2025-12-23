import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

const LEAD_TYPE_VALUES = ['BUYER', 'SELLER', 'UNKNOWN'] as const;

export function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

export class LeadFitInput {
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  preapproved?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  timeframeDays?: number;

  @IsOptional()
  @IsString()
  geo?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  inventoryMatch?: number;
}

export class CreateLeadDto {
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
  @IsObject()
  fit?: LeadFitInput;
}
