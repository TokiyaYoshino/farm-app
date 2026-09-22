import { useState } from "react";
import type { CSSProperties } from "react";
import { ClipboardList, FlaskConical, MessageCircle, Eye, EyeOff } from "lucide-react";
import { C, SHADOW, RADIUS } from "../ui/tokens";
import { btn } from "../ui/styles";

// ─── 起動直後の案内と農場の新規登録 ───────────────────────────
//
// なぜ要るか: ストアからDLした人には「何のアプリか」も「アカウントの作り方」も
// 見えていなかった（ログイン画面がいきなり出るだけだった）。
// 経緯と範囲は docs/decisions/20260922-onboarding-and-signup.md
//
// **紹介は操作手順を教えない。** どこを押すかを書き始めると
// docs/decisions/20260824-no-manual-test.md が最後の手段に置いた「説明書」になる。
// ここでは「何ができるか」だけを見せる。

export type OnboardingStep = "welcome" | "tour" | "signup";

export interface SignupValues {
  farm_name: string;
  name: string;
  login_id: string;
  password: string;
}

interface Props {
  step: OnboardingStep;
  onStep: (s: OnboardingStep) => void;
  /** ログイン画面へ。既にアカウントを持っている人の経路 */
  onLogin: () => void;
  /** 認証なしで中身を見てもらう。審査でも中身を確認できるようにする意味がある */
  onDemo: () => void;
  /** 登録の実行。成功したら null、失敗したら画面に出す文言を返す */
  onSignup: (v: SignupValues) => Promise<string | null>;
}

const TOUR = [
  {
    Icon: ClipboardList,
    title: "その日の作業記録",
    body: "作業の内容・写真・使った農薬を、その場で残せます。あとから日付をさかのぼって直すこともできます。",
  },
  {
    Icon: FlaskConical,
    title: "農薬の使いすぎ防止",
    body: "農薬の登録情報と自分の記録を照らし合わせて、総使用回数を超えている疑いがあるときに知らせます。",
  },
  {
    Icon: MessageCircle,
    title: "畑のことの相談",
    body: "前回の散布からの日数や、今年の作業の回数をふまえた答えが返ります。天気と国の防除資料も見ています。",
  },
];

const page: CSSProperties = {
  minHeight: "100vh", background: C.bg,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
};
const col: CSSProperties = { width: "100%", maxWidth: 360 };
const lbl: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 8,
};
const underline = (bad: boolean): CSSProperties => ({
  width: "100%", padding: "10px 0", border: "none",
  borderBottom: `1.5px solid ${bad ? C.danger : C.hairline}`,
  fontSize: 16, background: "transparent", color: C.text,
  boxSizing: "border-box", outline: "none",
});

export default function Onboarding({ step, onStep, onLogin, onDemo, onSignup }: Props) {
  const [slide, setSlide] = useState(0);
  const [form, setForm] = useState<SignupValues>({ farm_name: "", name: "", login_id: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof SignupValues) => (v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setError("");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const msg = await onSignup({ ...form, login_id: form.login_id.trim().toLowerCase() });
    if (msg) setError(msg);
    setBusy(false);
  };

  // ── ようこそ ───────────────────────────────────────────────
  if (step === "welcome") return (
    <div style={page}>
      <div style={col}>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 10 }}>農作業レポート</div>
        <div style={{ fontSize: 15, color: C.textSub, lineHeight: 1.8, marginBottom: 40 }}>
          その日の作業を残す。<br />
          農薬の使いすぎを防ぐ。<br />
          畑のことを相談する。
        </div>

        <button onClick={() => { setSlide(0); onStep("tour"); }} style={{ ...btn("primary", "lg"), marginBottom: 12 }}>
          はじめる
        </button>
        <button onClick={onLogin} style={{ ...btn("secondary", "lg"), marginBottom: 12 }}>
          ログイン
        </button>
        <button onClick={onDemo} style={btn("tertiary", "md")}>
          デモを見る
        </button>
      </div>
    </div>
  );

  // ── 紹介（3枚）─────────────────────────────────────────────
  if (step === "tour") {
    const { Icon, title, body } = TOUR[slide];
    const last = slide === TOUR.length - 1;
    return (
      <div style={page}>
        <div style={col}>
          <div style={{
            background: C.card, borderRadius: RADIUS.card, boxShadow: SHADOW.card,
            padding: "36px 24px", marginBottom: 24, textAlign: "center",
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 999, background: C.inkSoft,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
            }}>
              <Icon size={28} strokeWidth={1.8} color={C.ink} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
            <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8 }}>{body}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
            {TOUR.map((_, i) => (
              <span key={i} style={{
                width: i === slide ? 18 : 6, height: 6, borderRadius: 999,
                background: i === slide ? C.ink : C.hairline, transition: "width .2s",
              }} />
            ))}
          </div>

          <button
            onClick={() => (last ? onStep("signup") : setSlide(s => s + 1))}
            style={{ ...btn("primary", "lg"), marginBottom: 12 }}
          >
            {last ? "農場を登録する" : "次へ"}
          </button>
          <button onClick={() => onStep("signup")} style={btn("tertiary", "md")}>
            とばす
          </button>
        </div>
      </div>
    );
  }

  // ── 農場の新規登録 ─────────────────────────────────────────
  return (
    <div style={page}>
      <div style={col}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6 }}>農場の登録</div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.7 }}>
            最初に登録した方が管理者になります。作業者はあとからメニューで追加できます。
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>農場の名前</label>
          <input
            style={underline(false)} placeholder="例: みどり農園" value={form.farm_name}
            onChange={e => set("farm_name")(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>お名前</label>
          <input
            style={underline(false)} placeholder="例: 山田 太郎" value={form.name}
            onChange={e => set("name")(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>ユーザーID</label>
          <input
            style={underline(false)} placeholder="英小文字・数字で3文字以上" value={form.login_id}
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={e => set("login_id")(e.target.value)}
          />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
            次回からこのIDでログインします
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={lbl}>パスワード</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              style={{ ...underline(false), padding: "10px 40px 10px 0" }}
              placeholder="8文字以上" value={form.password}
              onChange={e => set("password")(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
            />
            <button
              onClick={() => setShowPass(p => !p)}
              style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex" }}
            >
              {showPass ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>

        {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>{error}</div>}

        <button
          onClick={submit} disabled={busy}
          style={{ ...btn("primary", "lg"), opacity: busy ? 0.7 : 1, marginBottom: 12 }}
        >
          {busy ? "登録中..." : "登録する"}
        </button>
        <button onClick={onLogin} style={btn("tertiary", "md")}>
          アカウントをお持ちの方はこちら
        </button>
      </div>
    </div>
  );
}
