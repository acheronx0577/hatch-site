import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class InviteAgentDto {
  @ApiProperty({ description: 'Agent email to invite' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Agent full name to display in invite' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  licenseState?: string;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional()
  @IsISO8601()
  licenseExpiresAt?: string;
}
