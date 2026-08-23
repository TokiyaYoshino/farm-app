// @vercel/node を依存追加せず、このプロジェクトが実際に使うプロパティだけ最小定義する

export interface ApiRequest {
  method?: string;
  body?: Record<string, unknown>;
  /** 認証（api/_auth.ts）で Authorization を読むために必要。Node のヘッダは小文字化されて入る */
  headers?: Record<string, string | string[] | undefined>;
}

export interface ApiResponseValue {
  json(body: unknown): void;
  end(): void;
}

export interface ApiResponse {
  status(code: number): ApiResponseValue;
}
