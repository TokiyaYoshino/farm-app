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

/**
 * 外部 API（OpenAI・気象庁・Supabase Auth）のレスポンス JSON。
 *
 * `res.json()` は `unknown` を返すが、ここで受けた値は必ず呼び出し側で
 * 存在チェック・型チェックをしてから使う（信用しない前提のコードになっている）。
 * その narrowing を毎回書き下すより、境界であることを型名で示すほうが読みやすい。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExternalJson = any;
