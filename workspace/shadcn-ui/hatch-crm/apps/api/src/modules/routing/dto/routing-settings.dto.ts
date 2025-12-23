import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum LeadRoutingOrgMode {
  AUTOMATIC = 'AUTOMATIC',
  APPROVAL_POOL = 'APPROVAL_POOL'
}

export class RoutingSettingsDto {
  @ApiProperty({ enum: LeadRoutingOrgMode })
  mode!: LeadRoutingOrgMode;

  @ApiPropertyOptional({ nullable: true })
  approvalTeamId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  approvalTeamName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  updatedAt?: string | null;
}

export class UpdateRoutingSettingsDto {
  @ApiProperty({ enum: LeadRoutingOrgMode })
  @IsEnum(LeadRoutingOrgMode)
  mode!: LeadRoutingOrgMode;

  @ApiPropertyOptional({ nullable: true, description: 'Optional team id to use as the approval pool.' })
  @IsOptional()
  @IsString()
  approvalTeamId?: string | null;
}

