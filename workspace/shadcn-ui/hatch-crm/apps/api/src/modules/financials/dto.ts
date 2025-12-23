import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { LedgerEntryType } from '@hatch/db';
import { CursorPaginationQueryDto, toOptionalNumber } from '@/modules/common';

export type FinancialsPeriod = 'month' | 'quarter' | 'year';
export type FinancialsSource = 'auto' | 'internal' | 'quickbooks';

export class FinancialsDashboardQueryDto {
  @IsOptional()
  @IsIn(['month', 'quarter', 'year'])
  period?: FinancialsPeriod;

  @IsOptional()
  @IsIn(['auto', 'internal', 'quickbooks'])
  source?: FinancialsSource;
}

export class ListLedgerEntriesQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  minAmount?: number;

  @IsOptional()
  @IsEnum(LedgerEntryType)
  type?: LedgerEntryType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateLedgerEntryDto {
  @IsEnum(LedgerEntryType)
  type!: LedgerEntryType;

  @IsString()
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}

export class UpdateLedgerEntryDto {
  @IsOptional()
  @IsEnum(LedgerEntryType)
  type?: LedgerEntryType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}
