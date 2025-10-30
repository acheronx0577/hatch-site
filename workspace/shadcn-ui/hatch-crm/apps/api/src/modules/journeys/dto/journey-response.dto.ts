import { ApiProperty } from '@nestjs/swagger';
import type { SimulationResult } from '@hatch/shared';

import { PaginatedResponseDto } from '../../common';

export class JourneySimulationResponseDto {
  @ApiProperty({ description: 'Journey simulation result payload', type: Object })
  outcome!: SimulationResult;
}

export class JourneyListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  trigger!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

}

export class JourneyListResponseDto extends PaginatedResponseDto<JourneyListItemDto> {
  @ApiProperty({ type: () => JourneyListItemDto, isArray: true })
  declare items: JourneyListItemDto[];
}
