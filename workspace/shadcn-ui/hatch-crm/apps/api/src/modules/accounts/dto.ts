import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsUrl } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ description: 'Display name for the account' })
  @IsString()
  name!: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'website must be a valid URL' })
  @ApiPropertyOptional({
    description: 'Company website URL',
    example: 'https://acme.example'
  })
  website?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Industry classification for the account' })
  industry?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({
    description: 'Estimated annual revenue in account currency',
    type: Number,
    example: 1200000
  })
  annualRevenue?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Main phone number for the account' })
  phone?: string;

  @IsOptional()
  @ApiPropertyOptional({
    description: 'Structured billing address payload',
    type: Object,
    example: { street: '123 Main', city: 'Springfield', country: 'US' }
  })
  billingAddress?: Record<string, unknown>;

  @IsOptional()
  @ApiPropertyOptional({
    description: 'Structured shipping address payload',
    type: Object
  })
  shippingAddress?: Record<string, unknown>;
}

export class UpdateAccountDto extends CreateAccountDto {}

export class AccountResponseDto {
  @ApiProperty({ description: 'Account identifier' })
  id!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  website?: string | null;

  @ApiPropertyOptional()
  industry?: string | null;

  @ApiPropertyOptional({ type: Number })
  annualRevenue?: number | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional({ type: Object })
  billingAddress?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Object })
  shippingAddress?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  ownerId?: string;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}
