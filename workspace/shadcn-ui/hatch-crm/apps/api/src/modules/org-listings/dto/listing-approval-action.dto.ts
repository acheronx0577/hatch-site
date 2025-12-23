import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListingApprovalActionDto {
  @ApiProperty({ required: false, description: 'Optional note to log in listing activity.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

