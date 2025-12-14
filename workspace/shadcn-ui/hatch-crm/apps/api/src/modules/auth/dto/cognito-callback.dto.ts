import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CognitoCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string; // Authorization code from Cognito

  @IsString()
  @IsOptional()
  state?: string; // Contains invite token

  @IsString()
  @IsOptional()
  idToken?: string; // ID token (if using implicit flow)

  @IsString()
  @IsOptional()
  email?: string; // User email from Cognito

  @IsString()
  @IsOptional()
  cognitoSub?: string; // Cognito user ID
}
