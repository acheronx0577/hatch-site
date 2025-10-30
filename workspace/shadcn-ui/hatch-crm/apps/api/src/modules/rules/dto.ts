import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  CursorPaginationQueryDto,
  PaginatedResponseDto,
  SearchQueryDto
} from '../common';

const SUPPORTED_OBJECTS = ['accounts', 'opportunities', 'cases', 're_offers', 're_transactions'] as const;

type RuleObject = (typeof SUPPORTED_OBJECTS)[number];

const parseJson = (value: unknown) => {
  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      return {};
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error('dsl must be valid JSON');
    }
  }
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  return {};
};

class RuleQueryBaseDto extends IntersectionType(CursorPaginationQueryDto, SearchQueryDto) {}

export class RuleQueryDto extends RuleQueryBaseDto {
  @ApiPropertyOptional({ enum: SUPPORTED_OBJECTS })
  @IsOptional()
  @IsIn(SUPPORTED_OBJECTS)
  object?: RuleObject;
}

export class ValidationRulePayloadDto {
  @ApiProperty({ enum: SUPPORTED_OBJECTS })
  @IsNotEmpty()
  @IsIn(SUPPORTED_OBJECTS)
  object!: RuleObject;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Display name for the rule' })
  name!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether the rule is active' })
  active?: boolean;

  @Transform(({ value }) => parseJson(value))
  @IsObject()
  @IsNotEmptyObject()
  @ApiProperty({
    description: 'JSON definition for the rule',
    type: 'object',
    example: { if: "status == 'Closed'", then_required: ['description'] }
  })
  dsl!: Record<string, unknown>;
}

export class UpdateValidationRuleDto extends PartialType(ValidationRulePayloadDto) {}

export class AssignmentRulePayloadDto {
  @ApiProperty({ enum: SUPPORTED_OBJECTS })
  @IsNotEmpty()
  @IsIn(SUPPORTED_OBJECTS)
  object!: RuleObject;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Display name for the rule' })
  name!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether the rule is active' })
  active?: boolean;

  @Transform(({ value }) => parseJson(value))
  @IsObject()
  @IsNotEmptyObject()
  @ApiProperty({
    description: 'JSON definition for assignment',
    type: 'object',
    example: {
      when: "amount >= 50000",
      assign: { type: 'static_owner', ownerId: 'user-123' }
    }
  })
  dsl!: Record<string, unknown>;
}

export class UpdateAssignmentRuleDto extends PartialType(AssignmentRulePayloadDto) {}

export class RuleRecordDto {
  @ApiProperty({ description: 'Rule identifier' })
  id!: string;

  @ApiProperty({ description: 'Owning organisation identifier' })
  orgId!: string;

  @ApiProperty({ enum: SUPPORTED_OBJECTS })
  object!: RuleObject;

  @ApiProperty({ description: 'Admin-provided display name' })
  name!: string;

  @ApiProperty({ description: 'Whether the rule is active' })
  active!: boolean;

  @ApiProperty({ description: 'JSON rule payload' })
  dsl!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RuleListResponseDto extends PaginatedResponseDto<RuleRecordDto> {
  @ApiProperty({ type: () => RuleRecordDto, isArray: true })
  declare items: RuleRecordDto[];
}
