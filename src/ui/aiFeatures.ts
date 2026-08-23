// AI機能のプラン別アクセス判定はここに集約する。
// マルチテナント化＋Stripe連携が完了したら、実際の課金プランを見て判定するよう中身を差し替える。
export const AI_FEATURES = {
  voiceStructuring: true,
  recordSearchChat: true,
  pestControlAdvice: true,
  pestDiagnosis: true,
  // 作付けごとの相談（api/advise.ts）。記録の検索ではなく知識の補填なので別枠
  nextActionAdvice: true,
} as const;

export function canUseAiFeature(feature: keyof typeof AI_FEATURES): boolean {
  return AI_FEATURES[feature];
}
