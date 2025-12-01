import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

import { ContractInstanceStatus } from '@hatch/db';

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsString()
  side?: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  active?: string;
}

export class SearchTemplatesQueryDto extends ListTemplatesQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  includeUrl?: string;
}

export class ListInstancesQueryDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsEnum(ContractInstanceStatus)
  status?: ContractInstanceStatus;
}

export class CreateContractInstanceDto {
  @IsString()
  templateId!: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  recommendationReason?: string;

  @IsOptional()
  @IsObject()
  overrideFieldValues?: Record<string, unknown>;
}

export class UpdateContractInstanceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  fieldValues?: Record<string, unknown>;
}

export class EnvelopeSignerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class SendForSignatureDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnvelopeSignerDto)
  signers?: EnvelopeSignerDto[];

  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class BulkDeleteInstancesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
