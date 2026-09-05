#!/usr/bin/env bash
# RLS の適用結果を検証する。docs/rls-rollout.md の手順4を自動化したもの。
#
# 使い方:
#   export SUPABASE_URL="https://xxxx.supabase.co"
#   export SUPABASE_ANON_KEY="eyJ..."
#   # 任意（越境テストまでやる場合）
#   export JWT_ORG2="eyJ..."        # 2組織目のユーザーの access_token
#   export ORG1_REPORT_ID="123"     # 1組織目に実在する reports.id
#   bash scripts/verify-rls.sh
#
# access_token の取り方: Web版にログイン → DevTools > Application > Local Storage の
# `sb-<project>-auth-token` の中の access_token をコピーする。
#
# 判定の意味:
#   PASS = 塞がっている / FAIL = 漏れている（要対応） / SKIP = 環境変数が無く未実施
#
# 注意: このスクリプトは読み取りしか行わない。データは変更しない。

set -uo pipefail

: "${SUPABASE_URL:?SUPABASE_URL を設定してください}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY を設定してください}"

JWT_ORG2="${JWT_ORG2:-}"
ORG1_REPORT_ID="${ORG1_REPORT_ID:-}"

pass=0; fail=0; skip=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
ng()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail+1)); }
skp()  { printf '  \033[33mSKIP\033[0m %s\n' "$1"; skip=$((skip+1)); }
head2(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# REST に GET して本文を返す
rest() { # $1=path+query  $2=bearer(省略時はanon)
  local token="${2:-$SUPABASE_ANON_KEY}"
  curl -s --max-time 20 "${SUPABASE_URL}/rest/v1/$1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${token}"
}

# 「空配列が返る」= 塞がっている、と判定する。
# PostgREST は RLS で弾かれた select をエラーではなく空配列で返すため。
expect_empty() { # $1=ラベル  $2=レスポンス本文
  local label="$1" body="$2"
  if [ -z "$body" ]; then ng "$label（応答が空。URL/キーを確認）"; return; fi
  # エラーオブジェクト（権限エラー等）も「読めていない」ので PASS 扱いにする
  if printf '%s' "$body" | grep -q '"code"'; then ok "$label（エラー応答＝読めない）"; return; fi
  if [ "$(printf '%s' "$body" | tr -d ' \n')" = "[]" ]; then ok "$label"; return; fi
  ng "$label → $(printf '%s' "$body" | head -c 160)"
}

echo "対象: ${SUPABASE_URL}"

head2 "1. 匿名（anonキーのみ）で業務データが読めないこと"
for t in reports schedules comments crops fields pesticides projects tickets \
         ai_outputs daily_weather settings organizations \
         crop_advice_messages crop_advice_actions device_tokens; do
  expect_empty "anon → ${t}" "$(rest "${t}?select=*&limit=1")"
done

head2 "2. users の匿名参照が login_id / email に限られること"
# ログイン画面の login_id → email 解決に必要なので、この2列だけは読める設計。
# それ以外の列を要求したら失敗するのが正しい（列権限で拒否される）。
body="$(rest "users?select=name,role&limit=1")"
if printf '%s' "$body" | grep -q '"code"\|permission'; then
  ok "anon → users の name/role は拒否される"
else
  if [ "$(printf '%s' "$body" | tr -d ' \n')" = "[]" ]; then
    ok "anon → users の name/role は空（行が見えない）"
  else
    ng "anon → users の name/role が読める → $(printf '%s' "$body" | head -c 160)"
  fi
fi
body="$(rest "users?select=login_id&limit=1")"
if printf '%s' "$body" | grep -q '"code"'; then
  echo "  INFO login_id も読めない（ログイン画面が動くか要確認）"
else
  echo "  INFO login_id は読める（設計どおり。ユーザー列挙は可能な点に留意）"
fi

head2 "3. Storage のオブジェクト一覧が匿名で取れないこと"
# storage.objects の select ポリシーを落としてあれば、一覧は空か拒否になる。
sbody="$(curl -s --max-time 20 -X POST "${SUPABASE_URL}/storage/v1/object/list/report-images" \
  -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":5}')"
if [ -z "$sbody" ]; then
  ng "STORAGE anon 一覧（応答が空）"
elif [ "$(printf '%s' "$sbody" | tr -d ' \n')" = "[]" ] || printf '%s' "$sbody" | grep -qi 'not_found\|Unauthorized\|violates\|denied\|"error"'; then
  ok "STORAGE anon はオブジェクトを列挙できない"
else
  ng "STORAGE anon が列挙できる → $(printf '%s' "$sbody" | head -c 200)"
fi

head2 "4. 越境アクセス（2組織目のJWTで1組織目のデータ）"
if [ -z "$JWT_ORG2" ]; then
  skp "JWT_ORG2 が未設定のため未実施（2組織目を作ってから再実行する）"
else
  expect_empty "org2 → reports 全件" "$(rest "reports?select=id&limit=5" "$JWT_ORG2")"
  expect_empty "org2 → crop_advice_messages 全件" "$(rest "crop_advice_messages?select=id&limit=5" "$JWT_ORG2")"
  if [ -n "$ORG1_REPORT_ID" ]; then
    expect_empty "org2 → org1 の reports.id=${ORG1_REPORT_ID} を直接指定" \
      "$(rest "reports?id=eq.${ORG1_REPORT_ID}&select=*" "$JWT_ORG2")"
  else
    skp "ORG1_REPORT_ID が未設定のため ID 直指定テストは未実施"
  fi
  # JWT に organization_id クレームが入っているかの確認（手順1・2の実施漏れ検出）
  payload="$(printf '%s' "$JWT_ORG2" | cut -d. -f2)"
  case $(( ${#payload} % 4 )) in 2) payload="${payload}==";; 3) payload="${payload}=";; esac
  if printf '%s' "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null | grep -q 'organization_id'; then
    ok "JWT_ORG2 に organization_id クレームがある"
  else
    ng "JWT_ORG2 に organization_id が無い（Auth Hook 未設定か、ログインし直していない）"
  fi
fi

head2 "結果"
printf '  PASS %d / FAIL %d / SKIP %d\n' "$pass" "$fail" "$skip"
if [ "$fail" -gt 0 ]; then
  echo "  FAIL がある間は公開しないこと。docs/rls-rollout.md の切り戻し表を参照。"
  exit 1
fi
echo "  問題なし。"
