export interface ApiClient {
  readonly baseUrl: string;
}

export function createApiClient(baseUrl = "/api"): ApiClient {
  return { baseUrl };
}
