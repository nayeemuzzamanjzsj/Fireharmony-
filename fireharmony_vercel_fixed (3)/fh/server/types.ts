export interface ApiContext {
  method: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: any;
}

export interface ApiResponse {
  status: number;
  json: any;
  headers?: Record<string, string>;
}

export type ApiHandler = (ctx: ApiContext) => Promise<ApiResponse>;
