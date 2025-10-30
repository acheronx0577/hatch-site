import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { OfferResponseDto } from '../offers/dto';

export class UpdateListingStatusDto {
  @ApiProperty({ description: 'New status for the listing' })
  @IsString()
  status!: string;
}

export class ListingResponseDto {
  @ApiProperty({ description: 'Listing identifier' })
  id!: string;

  @ApiProperty({ description: 'Current listing status' })
  status!: string;

  @ApiPropertyOptional()
  opportunityId?: string | null;

  @ApiPropertyOptional()
  opportunityStage?: string | null;

  @ApiPropertyOptional({ type: () => OfferResponseDto, isArray: true })
  offers?: OfferResponseDto[];

  @ApiPropertyOptional()
  transactionId?: string | null;

  @ApiPropertyOptional()
  addressLine1?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  state?: string | null;

  @ApiPropertyOptional()
  postalCode?: string | null;

  @ApiPropertyOptional({ type: Number })
  price?: number | null;
}
