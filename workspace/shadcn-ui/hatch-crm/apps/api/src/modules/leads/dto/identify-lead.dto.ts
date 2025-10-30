import { IsObject, IsOptional, IsString } from 'class-validator';

export class IdentifyLeadDto {
  @IsString()
  anonymous_id!: string;

  @IsOptional()
  @IsObject()
  traits?: Record<string, unknown>;
}

