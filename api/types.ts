// @vercel/node を依存追加せず、このプロジェクトが実際に使うプロパティだけ最小定義する

export interface ApiRequest {
  method?: string;
  body?: Record<string, unknown>;
}

export interface ApiResponseValue {
  json(body: unknown): void;
  end(): void;
}

export interface ApiResponse {
  status(code: number): ApiResponseValue;
}
