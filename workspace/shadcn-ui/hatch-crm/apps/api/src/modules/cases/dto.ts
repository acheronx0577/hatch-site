import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const STATUS_VALUES = ['New', 'Working', 'Escalated', 'Resolved', 'Closed'] as const;
const PRIORITY_VALUES = ['Low', 'Medium', 'High', 'Urgent'] as const;
const ORIGIN_VALUES = ['Email', 'Phone', 'Web', 'Other'] as const;

export class CreateCaseDto {
  @ApiProperty({ description: 'Short subject summarising the case' })
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsOptional()
  @IsIn(STATUS_VALUES)
  @ApiPropertyOptional({ enum: STATUS_VALUES, description: 'Current status for the case' })
  status?: (typeof STATUS_VALUES)[number];

  @IsOptional()
  @IsIn(PRIORITY_VALUES)
  @ApiPropertyOptional({ enum: PRIORITY_VALUES, description: 'Priority indicator' })
  priority?: (typeof PRIORITY_VALUES)[number];

  @IsOptional()
  @IsIn(ORIGIN_VALUES)
  @ApiPropertyOptional({ enum: ORIGIN_VALUES, description: 'Origin channel' })
  origin?: (typeof ORIGIN_VALUES)[number];

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Free-form description of the case' })
  description?: string;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Related account identifier' })
  accountId?: string;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Related contact identifier' })
  contactId?: string;
}

export class UpdateCaseDto extends PartialType(CreateCaseDto) {}

export class CaseAccountSummaryDto {
  @ApiProperty({ description: 'Account identifier' })
  id!: string;

  @ApiPropertyOptional()
  name?: string | null;
}

export class CaseContactSummaryDto {
  @ApiProperty({ description: 'Contact identifier' })
  id!: string;

  @ApiPropertyOptional({ description: 'Full name for the contact' })
  name?: string | null;

  @ApiPropertyOptional({ description: 'Primary email address' })
  email?: string | null;
}

export class CaseResponseDto {
  @ApiProperty({ description: 'Case identifier' })
  id!: string;

  @ApiPropertyOptional()
  subject?: string;

  @ApiPropertyOptional({ enum: STATUS_VALUES })
  status?: string | null;

  @ApiPropertyOptional({ enum: PRIORITY_VALUES })
  priority?: string | null;

  @ApiPropertyOptional({ enum: ORIGIN_VALUES })
  origin?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  accountId?: string | null;

  @ApiPropertyOptional()
  contactId?: string | null;

  @ApiPropertyOptional()
  ownerId?: string | null;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;

  @ApiPropertyOptional({ type: () => CaseAccountSummaryDto })
  account?: CaseAccountSummaryDto | null;

  @ApiPropertyOptional({ type: () => CaseContactSummaryDto })
  contact?: CaseContactSummaryDto | null;
}

export class CaseListResponseDto {
  @ApiProperty({ type: () => CaseResponseDto, isArray: true })
  items!: CaseResponseDto[];

  @ApiPropertyOptional({
    nullable: true,
    description: 'Cursor to request the next page of results'
  })
  nextCursor?: string | null;
}
