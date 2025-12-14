import { apiFetch } from './hatch';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface RegisterConsumerRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Login with email and password using the backend API
 * This uses AWS Cognito authentication on the backend
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

/**
 * Register a new consumer account
 */
export async function registerConsumer(data: RegisterConsumerRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('auth/register-consumer', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
