import { HttpClient, AccountsApi, OpportunitiesApi, CasesApi } from '../../../packages/sdk-lite/src';

const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api';

const sdkHttpClient = new HttpClient({
  baseUrl,
  getToken: async () => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem('access_token') ?? '';
  }
});

export const accountsApi = new AccountsApi(sdkHttpClient);
export const opportunitiesApi = new OpportunitiesApi(sdkHttpClient);
export const casesApi = new CasesApi(sdkHttpClient);

export { sdkHttpClient as sdkClient };
