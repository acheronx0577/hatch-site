import { LeadTouchpointType, MessageChannel } from '@hatch/db';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';

const TouchpointTypeValues = Object.values(LeadTouchpointType ?? {}) as string[];
const MessageChannelValues = Object.values(MessageChannel ?? {}) as string[];

export class CreateLeadTouchpointDto {
  @IsEnum(TouchpointTypeValues)
  type!: LeadTouchpointType;

  @IsOptional()
  @IsEnum(MessageChannelValues)
  channel?: MessageChannel;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
