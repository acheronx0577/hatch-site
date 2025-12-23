import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class EnsureSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['GENERAL', 'LEAD', 'LISTING', 'TRANSACTION'])
  contextType?: 'GENERAL' | 'LEAD' | 'LISTING' | 'TRANSACTION';

  @IsOptional()
  @IsString()
  contextId?: string;

  @IsOptional()
  @IsObject()
  contextSnapshot?: Record<string, unknown>;
}

