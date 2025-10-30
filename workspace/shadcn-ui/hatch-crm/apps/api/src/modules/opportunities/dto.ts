import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty({ description: 'Opportunity name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Current stage identifier' })
  @IsString()
  stage!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Related account identifier' })
  accountId?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ type: Number, description: 'Opportunity amount' })
  amount?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'ISO currency code' })
  currency?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Expected close date (ISO-8601)' })
  closeDate?: string;
}

export class UpdateOpportunityDto extends CreateOpportunityDto {}

export class OpportunityAccountSummaryDto {
  @ApiProperty({ description: 'Account identifier' })
  id!: string;

  @ApiPropertyOptional({ description: 'Account display name' })
  name?: string | null;
}

export class OpportunityTransactionSummaryDto {
  @ApiProperty({ description: 'Transaction identifier' })
  id!: string;

  @ApiPropertyOptional({ description: 'Current transaction stage' })
  stage?: string | null;
}

export class OpportunityResponseDto {
  @ApiProperty({ description: 'Opportunity identifier' })
  id!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  stage?: string;

  @ApiPropertyOptional()
  accountId?: string | null;

  @ApiPropertyOptional({ type: Number })
  amount?: number | null;

  @ApiPropertyOptional()
  currency?: string | null;

  @ApiPropertyOptional()
  closeDate?: string | null;

  @ApiPropertyOptional()
  ownerId?: string;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;

  @ApiPropertyOptional({ type: () => OpportunityAccountSummaryDto })
  account?: OpportunityAccountSummaryDto | null;

  @ApiPropertyOptional({ type: () => OpportunityTransactionSummaryDto })
  transaction?: OpportunityTransactionSummaryDto | null;
}
