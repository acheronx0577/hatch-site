import { IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

import { CursorPaginationQueryDto, SearchQueryDto } from '../../common';

class RoutingQueryBaseDto extends IntersectionType(CursorPaginationQueryDto, SearchQueryDto) {}

export class RoutingRulesQueryDto extends RoutingQueryBaseDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  mode?: string;
}

export class RoutingEventsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;
}
