import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PaginatedResponseDto } from '../../common';

export class ClearCooperationRiskDto {
  @ApiProperty()
  status!: string;

  @ApiProperty()
  hoursElapsed!: number;

  @ApiProperty()
  hoursRemaining!: number;
}

export class ClearCooperationTimerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiPropertyOptional()
  listingId?: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startedAt!: string;

  @ApiPropertyOptional()
  deadlineAt?: string | null;

  @ApiPropertyOptional()
  lastEventAt?: string | null;
}

export class RecordClearCooperationResponseDto {
  @ApiProperty({ type: ClearCooperationTimerDto })
  timer!: ClearCooperationTimerDto;

  @ApiProperty({ type: ClearCooperationRiskDto })
  risk!: ClearCooperationRiskDto;
}

export class MlsProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  disclaimerText?: string | null;

  @ApiPropertyOptional()
  compensationDisplayRule?: string | null;

  @ApiProperty()
  clearCooperationRequired!: boolean;

  @ApiPropertyOptional()
  slaHours?: number | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class MlsProfileListResponseDto extends PaginatedResponseDto<MlsProfileDto> {
  @ApiProperty({ type: () => MlsProfileDto, isArray: true })
  declare items: MlsProfileDto[];
}

export class ClearCooperationDashboardEntryDto {
  @ApiProperty()
  timerId!: string;

  @ApiProperty({ description: 'Timer status', example: 'GREEN' })
  status!: string;

  @ApiProperty()
  startedAt!: string;

  @ApiPropertyOptional()
  deadlineAt?: string | null;

  @ApiPropertyOptional({
    description: 'Associated listing snapshot',
    type: Object,
    nullable: true
  })
  listing?: Record<string, unknown> | null;
}

export class ClearCooperationDashboardResponseDto extends PaginatedResponseDto<ClearCooperationDashboardEntryDto> {
  @ApiProperty({ type: () => ClearCooperationDashboardEntryDto, isArray: true })
  declare items: ClearCooperationDashboardEntryDto[];
}
