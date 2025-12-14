import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsHexColor,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength
} from 'class-validator';

const AVATAR_SHAPES = ['circle', 'square', 'rounded-square', 'hexagon', 'pill'] as const;
type AvatarShape = (typeof AVATAR_SHAPES)[number];

export class AiEmployeeTemplateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  systemPrompt!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  defaultSettings!: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'string' } })
  allowedTools!: string[];

  @ApiPropertyOptional({ description: 'Normalized persona key for UI mapping (e.g., hatch_assistant, agent_copilot)' })
  canonicalKey?: string;

  @ApiPropertyOptional({ description: 'Hex color used for avatar accents' })
  personaColor?: string;

  @ApiPropertyOptional({ description: 'Avatar shape', enum: AVATAR_SHAPES })
  avatarShape?: AvatarShape;

  @ApiPropertyOptional({ description: 'Avatar icon name' })
  avatarIcon?: string;

  @ApiPropertyOptional({ description: 'Avatar initials (1-2 chars)' })
  avatarInitial?: string;

  @ApiPropertyOptional({ description: 'Suggested tone label' })
  tone?: string;
}

export class AiEmployeeInstanceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  autoMode!: 'suggest-only' | 'requires-approval' | 'auto-run';

  @ApiProperty({ type: () => AiEmployeeTemplateDto })
  template!: AiEmployeeTemplateDto;

  @ApiProperty({ type: 'object', additionalProperties: true })
  settings!: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'string' } })
  allowedTools!: string[];

  @ApiProperty({ nullable: true })
  userId!: string | null;
}

export class AiEmployeeChatRequestDto {
  @ApiProperty({ description: 'User-facing message for the AI employee' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiProperty({ required: false, description: 'Channel or surface (web_chat, lead_detail, etc.)' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiProperty({ required: false, description: 'Context record type (lead, listing, etc.)' })
  @IsOptional()
  @IsString()
  contextType?: string;

  @ApiProperty({ required: false, description: 'Context record identifier' })
  @IsOptional()
  @IsString()
  contextId?: string;
}

export class AiEmployeeActionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeInstanceId!: string;

  @ApiProperty()
  actionType!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  requiresApproval!: boolean;

  @ApiProperty({ required: false, nullable: true })
  errorMessage?: string | null;

  @ApiProperty({ required: false, nullable: true })
  executedAt?: string | null;

  @ApiProperty({ required: false, nullable: true })
  sessionId?: string | null;

  @ApiProperty()
  dryRun!: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  result?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, description: 'Human-friendly result summary for executed tools' })
  replyText?: string | null;
}

export class AiEmployeeChatResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  employeeInstanceId!: string;

  @ApiProperty({ description: 'Assistant reply text' })
  reply!: string;

  @ApiProperty({ type: () => AiEmployeeActionDto, isArray: true })
  actions!: AiEmployeeActionDto[];
}

export class AiEmployeeActionReviewDto {
  @ApiProperty({ required: false, description: 'Optional reviewer note' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ required: false, description: 'Override mode when approving (defaults to action setting)', enum: ['auto', 'manual'] })
  @IsOptional()
  @IsIn(['auto', 'manual'])
  executionMode?: 'auto' | 'manual';
}

export class AdminAiEmployeeTemplateUpdateDto {
  @ApiPropertyOptional({ description: 'Persona display name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Marketing-friendly summary' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional({ description: 'LLM system prompt for this persona' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @ApiPropertyOptional({ type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allowedTools?: string[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  defaultSettings?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Hex color used for persona accents', example: '#2962FF' })
  @IsOptional()
  @IsHexColor()
  personaColor?: string;

  @ApiPropertyOptional({ description: 'Shape used for the persona avatar', enum: AVATAR_SHAPES })
  @IsOptional()
  @IsIn(AVATAR_SHAPES)
  avatarShape?: AvatarShape;

  @ApiPropertyOptional({ description: 'Icon name shown in persona avatar' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  avatarIcon?: string;

  @ApiPropertyOptional({ description: 'Initials rendered inside the avatar', maxLength: 2 })
  @IsOptional()
  @IsString()
  @Length(1, 2)
  avatarInitial?: string;

  @ApiPropertyOptional({ description: 'Default tone for persona communications' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tone?: string;
}

class AiEmployeeUsageToolStatDto {
  @ApiProperty()
  toolKey!: string;

  @ApiProperty()
  count!: number;
}

class AiEmployeeUsageWindowDto {
  @ApiProperty()
  from!: string;

  @ApiProperty()
  to!: string;
}

export class AiEmployeeUsageStatsDto {
  @ApiProperty()
  personaKey!: string;

  @ApiProperty()
  personaName!: string;

  @ApiProperty()
  totalActions!: number;

  @ApiProperty()
  successfulActions!: number;

  @ApiProperty()
  failedActions!: number;

  @ApiProperty({ type: AiEmployeeUsageToolStatDto, isArray: true })
  toolsUsed!: AiEmployeeUsageToolStatDto[];

  @ApiProperty({ type: AiEmployeeUsageWindowDto })
  timeWindow!: AiEmployeeUsageWindowDto;
}

export class AiEmployeeInstanceUpdateDto {
  @ApiProperty({ enum: ['suggest-only', 'requires-approval', 'auto-run'] })
  @IsIn(['suggest-only', 'requires-approval', 'auto-run'])
  autoMode!: 'suggest-only' | 'requires-approval' | 'auto-run';
}
