// ─── 公開ページへのリンク（App Store 審査で参照される導線）──────────────
// App Store Connect のメタデータ側だけでなく、アプリ内からもプライバシー
// ポリシーとアカウント削除の手順に到達できるようにする。
//
// - ガイドライン 5.1.1(v): アカウントを持つアプリには削除の導線が要る。
//   farm-app はアカウントを管理者が発行する方式でアプリ内に新規登録が無いため、
//   アプリ内での実削除ではなく「手順の提示」で足りる設計にしている
//   （docs/decisions/20260920-account-links-in-app.md）
// - 課金を入れた時点で、アプリ内の規約・ポリシーへのリンクは Apple の must になる
//   （docs/research/dr-2026-09/DR-06-payment-setup-lead-time.md §1.3）

/** 本番の公開ドメイン。独自ドメイン（kishufarm.com）へ寄せる場合はここだけ変える */
export const SITE_ORIGIN = "https://kishu-farm.vercel.app";

/** プライバシーポリシー。/privacy は vercel.json の rewrite で public/privacy.html に解決される */
export const PRIVACY_POLICY_URL: string = `${SITE_ORIGIN}/privacy`;

/** アカウント削除の手順（プライバシーポリシー内の該当セクション） */
export const ACCOUNT_DELETION_URL: string = `${SITE_ORIGIN}/privacy#account-deletion`;
