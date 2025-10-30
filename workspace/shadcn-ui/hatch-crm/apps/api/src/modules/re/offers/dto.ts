import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { TransactionResponseDto } from '../transactions/dto';

export class CreateOfferDto {
  @ApiProperty({ description: 'Listing identifier the offer is attached to' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ description: 'Buyer contact identifier' })
  @IsUUID()
  buyerContactId!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ description: 'Offer amount', minimum: 0, type: Number })
  amount!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({
    description: 'List of contingencies included in the offer',
    type: [String]
  })
  contingencies?: string[];
}

export class ListOffersQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Filter by listing identifier' })
  listingId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED'])
  @ApiPropertyOptional({ description: 'Filter by status', enum: ['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED'] })
  status?: 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED';
}

export class DecideOfferDto {
  @IsString()
  @IsIn(['ACCEPTED', 'REJECTED'])
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'] })
  status!: 'ACCEPTED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Optional note capturing decision rationale' })
  decisionNote?: string;
}

export class OfferListingSummaryDto {
  @ApiProperty({ description: 'Listing identifier' })
  id!: string;

  @ApiPropertyOptional()
  status?: string | null;

  @ApiPropertyOptional()
  opportunityId?: string | null;
}

export class OfferResponseDto {
  @ApiProperty({ description: 'Offer identifier' })
  id!: string;

  @ApiProperty({ description: 'Current status', enum: ['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED'] })
  status!: string;

  @ApiProperty({ description: 'Listing identifier the offer belongs to' })
  listingId!: string;

  @ApiProperty({ description: 'Buyer/person identifier tied to the offer' })
  personId!: string;

  @ApiPropertyOptional({ type: Number })
  amount?: number | null;

  @ApiPropertyOptional({ type: [String] })
  contingencies?: string[];

  @ApiPropertyOptional({ description: 'Decision note when the offer is acted upon' })
  decisionNote?: string | null;

  @ApiPropertyOptional({ description: 'Deal identifier when the offer is converted' })
  dealId?: string | null;

  @ApiPropertyOptional({ type: () => OfferListingSummaryDto })
  listing?: OfferListingSummaryDto | null;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class OfferListResponseDto extends PaginatedResponseDto<OfferResponseDto> {
  @ApiProperty({ type: () => OfferResponseDto, isArray: true })
  declare items: OfferResponseDto[];
}

export class OfferDecisionResponseDto {
  @ApiProperty({ type: () => OfferResponseDto })
  offer!: OfferResponseDto;

  @ApiPropertyOptional({ type: () => TransactionResponseDto, description: 'Transaction generated from the accepted offer' })
  transaction?: TransactionResponseDto | null;
}
