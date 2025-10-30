import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

import { AuditAction } from '@hatch/db';

import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';

export class AuditListQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by actor (user) id' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter by audited object key (e.g., accounts)' })
  @IsOptional()
  @IsString()
  object?: string;

  @ApiPropertyOptional({ description: 'Filter by audited record id' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ enum: AuditAction, description: 'Filter by audit action' })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Filter events created at or after this ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter events created at or before this ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class AuditActorDto {
  @ApiProperty({ description: 'Actor user identifier' })
  id!: string;

  @ApiPropertyOptional({ description: 'Actor first name' })
  firstName?: string | null;

  @ApiPropertyOptional({ description: 'Actor last name' })
  lastName?: string | null;

  @ApiPropertyOptional({ description: 'Actor email address' })
  email?: string | null;
}

export class AuditEventDto {
  @ApiProperty({ description: 'Audit event identifier' })
  id!: string;

  @ApiProperty({ enum: AuditAction })
  action!: AuditAction;

  @ApiPropertyOptional({ description: 'Audited object key' })
  object?: string | null;

  @ApiPropertyOptional({ description: 'Audited record id' })
  objectId?: string | null;

  @ApiPropertyOptional({ description: 'Actor information if available', type: AuditActorDto })
  actor?: AuditActorDto | null;

  @ApiProperty({ description: 'Timestamp when the audit event was recorded' })
  createdAt!: string;

  @ApiPropertyOptional({ description: 'Diff payload recorded by the audit interceptor' })
  diff?: unknown | null;

  @ApiPropertyOptional({ description: 'IP address associated with the request, if captured' })
  ip?: string | null;

  @ApiPropertyOptional({ description: 'User agent string associated with the request, if captured' })
  userAgent?: string | null;
}

export class AuditListResponseDto {
  @ApiProperty({ type: [AuditEventDto] })
  items!: AuditEventDto[];

  @ApiPropertyOptional({ description: 'Cursor to fetch the next page, if any' })
  nextCursor?: string | null;
}
