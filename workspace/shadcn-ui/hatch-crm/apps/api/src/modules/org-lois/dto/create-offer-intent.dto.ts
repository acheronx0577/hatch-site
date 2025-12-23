import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateOfferIntentDto {
  @IsString()
  listingId!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  buyerName?: string;

  @IsOptional()
  @IsString()
  sellerName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offeredPrice?: number;

  @IsOptional()
  @IsString()
  financingType?: string;

  @IsOptional()
  @IsString()
  closingTimeline?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  contingencies?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}
