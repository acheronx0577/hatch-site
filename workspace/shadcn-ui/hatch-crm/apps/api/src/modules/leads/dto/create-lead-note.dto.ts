import { IsOptional, IsString } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

