import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, TextInput } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C } from "./ui/tokens";
import { StoreProvider, useStore } from "./lib/store";
import LoginScreen from "./screens/LoginScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import type { OnboardingStep } from "./screens/OnboardingScreen";
import HomeScreen from "./screens/HomeScreen";
import ReportScreen from "./screens/ReportScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import GanttScreen from "./screens/GanttScreen";
import AdviceScreen from "./screens/AdviceScreen";
import ManageScreen from "./screens/ManageScreen";
import QuickReportSheet from "./screens/QuickReportSheet";
import NotificationsSheet from "./screens/NotificationsSheet";
import ReportDetailSheet from "./screens/ReportDetailSheet";
import ScheduleDetailSheet from "./screens/ScheduleDetailSheet";
import BottomSheet from "./ui/BottomSheet";
import Btn from "./ui/Btn";
import { addPushListeners, getInitialPushPayload, type PushPayload } from "./lib/push";
import type { Report, Schedule } from "./lib/types";

// ─── ルート（src/App.tsx のヘッダー・サブタブ・ボトムナビ・FAB の移植）────
type Tab = "home" | "report" | "advice" | "analytics" | "manage";
type AnalyticsSubTab = "report" | "backlog";
type ManageSubTab = "crops" | "fields" | "pesticides";

const NAV_ITEMS: { key: Tab; icon: "home" | "edit-3" | "message-circle" | "bar-chart-2" | "settings"; label: string }[] = [
  { key: "home", icon: "home", label: "ホーム" },
  { key: "report", icon: "edit-3", label: "記録" },
  // 相談をナビに置く。差別化の中核（docs/spec-crop-advice-agent.md）が
  // ホームのカード1枚に埋もれていたため。Web は 2026-09-09 に同じ判断をしている
  { key: "advice", icon: "message-circle", label: "相談" },
  { key: "analytics", icon: "bar-chart-2", label: "分析" },
  { key: "manage", icon: "settings", label: "管理" },
];

const TITLES: Record<Tab, string> = {
  home: "農作業レポート",
  report: "作業記録",
  advice: "相談",
  analytics: "分析",
  manage: "管理",
};

function SubTabBar<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 4 }}>
      {tabs.map(t => {
        const active = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2.5, borderBottomColor: active ? C.primary : "transparent" }}
          >
            <Text style={{ fontSize: 13, fontWeight: active ? "700" : "600", color: active ? C.primary : C.textMuted }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const {
    authSession, authLoading, loading, loadError, retryLoad, refresh,
    currentUser, users, isAdmin, logout, deleteAccount, unreadNotifCount, markNotifsSeen,
    quickReportOpen, openQuickReport, closeQuickReport, reports, schedules,
  } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTab>("report");
  const [manageSubTab, setManageSubTab] = useState<ManageSubTab>("crops");
  const [showUserSheet, setShowUserSheet] = useState(false);
  // ログイン前にどの画面を出すか。ストアから来た人はログイン画面では詰む
  // （docs/decisions/20260922-onboarding-and-signup.md）
  const [authView, setAuthView] = useState<OnboardingStep | "login">("welcome");
  // アカウント削除（App Store 5.1.1(v)）
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);
  // 通知タップからの直接遷移用
  const [notifReport, setNotifReport] = useState<Report | null>(null);
  const [notifSchedule, setNotifSchedule] = useState<Schedule | null>(null);

  // ── 対象（記録・予定）の詳細シートを開く。開けたら true ──
  // targetType は comments.target_type と同じ緩い string（"report" 以外は予定扱い）
  const openTarget = useCallback((targetType: string, targetId: string) => {
    if (targetType === "report") {
      const r = reports.find(x => String(x.id) === targetId);
      if (r) { setNotifReport(r); return true; }
    } else {
      const sc = schedules.find(x => x.id === targetId);
      if (sc) { setNotifSchedule(sc); return true; }
    }
    return false;
  }, [reports, schedules]);

  // ── プッシュ通知（受信でデータ再取得・タップで対象を開く） ──
  // コールドスタート時はデータ取得前にペイロードが来るため、いったん保留して
  // reports/schedules が揃ってから開く。
  const [pendingPush, setPendingPush] = useState<PushPayload | null>(null);
  const initialPushChecked = useRef(false);
  // refresh は refreshing の変化で再生成されるため、購読を張り直さないようrefで持つ
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!authSession) return;
    const remove = addPushListeners({
      onOpen: payload => setPendingPush(payload),
      onReceive: () => { void refreshRef.current(); },
    });
    // 通知タップでアプリが起動した場合の初回ペイロード（1回だけ）
    if (!initialPushChecked.current) {
      initialPushChecked.current = true;
      getInitialPushPayload().then(p => { if (p?.target_id) setPendingPush(p); });
    }
    return remove;
  }, [authSession]);

  // 通知1件をタップしただけなので既読化はしない（他の未読をベルに残す）
  useEffect(() => {
    if (!pendingPush?.target_id || !pendingPush.target_type || loading) return;
    const { target_type, target_id } = pendingPush;
    setPendingPush(null);
    if (!openTarget(target_type, target_id)) setTab("report");
  }, [pendingPush, loading, openTarget]);

  // ── Auth ゲート（Web版と同一の3段階） ──
  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 14, color: C.textMuted }}>認証確認中...</Text>
      </View>
    );
  }
  if (!authSession && authView !== "login") {
    return <OnboardingScreen step={authView} onStep={setAuthView} onLogin={() => setAuthView("login")} />;
  }
  if (!authSession) return <LoginScreen onBack={() => setAuthView("welcome")} />;
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator color={C.ink} />
        <Text style={{ fontSize: 14, color: C.textMuted }}>読み込み中...</Text>
      </View>
    );
  }
  // 初期ロード失敗（機内モード・圏外等）。無言の空画面にしない
  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
        <Feather name="wifi-off" size={32} color={C.textMuted} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>データを取得できませんでした</Text>
        <Text style={{ fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 20 }}>
          電波の届く場所で再試行してください
        </Text>
        <Btn variant="primary" size="md" onPress={retryLoad} icon={<Feather name="refresh-cw" size={14} color="#fff" />}>
          再試行
        </Btn>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      {/* ヘッダー */}
      <View style={{ backgroundColor: "#fff", paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, letterSpacing: -0.3, flex: 1 }} numberOfLines={1}>
            {TITLES[tab]}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* 通知ベル（Web版 openNotifs と同一: 開いた時点で既読化） */}
            <Pressable
              onPress={() => { setShowNotifs(true); markNotifsSeen(); }}
              style={{ width: 36, height: 36, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="bell" size={17} color={C.textSub} />
              {unreadNotifCount > 0 && (
                <View style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 999, backgroundColor: C.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 12 }}>
                    {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => setShowUserSheet(true)} style={{ width: 36, height: 36, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
              <Feather name="user" size={18} color={C.textSub} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* サブタブバー（分析・管理のみ） */}
      {tab === "analytics" && (
        <SubTabBar
          tabs={[{ key: "report" as const, label: "レポート" }, { key: "backlog" as const, label: "計画" }]}
          value={analyticsSubTab}
          onChange={setAnalyticsSubTab}
        />
      )}
      {tab === "manage" && (
        <SubTabBar
          tabs={[
            { key: "crops" as const, label: "作物" },
            { key: "fields" as const, label: "圃場" },
            { key: "pesticides" as const, label: "農薬" },
          ]}
          value={manageSubTab}
          onChange={setManageSubTab}
        />
      )}

      {/* コンテンツ */}
      {tab === "home" && <HomeScreen onGoReport={() => setTab("report")} onQuickReport={() => openQuickReport()} />}
      {tab === "report" && <ReportScreen />}
      {tab === "advice" && <AdviceScreen />}
      {tab === "analytics" && (analyticsSubTab === "report" ? <AnalyticsScreen /> : <GanttScreen />)}
      {tab === "manage" && <ManageScreen subTab={manageSubTab} onGoCrops={() => setManageSubTab("crops")} />}

      {/* FAB（記録） */}
      <Pressable
        onPress={() => openQuickReport()}
        style={{
          position: "absolute", right: 16, bottom: 86 + insets.bottom,
          flexDirection: "row", alignItems: "center", gap: 7,
          backgroundColor: C.ink, borderRadius: 999,
          paddingVertical: 14, paddingHorizontal: 22,
          shadowColor: "#2E7D32", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 9, elevation: 6,
        }}
      >
        <Feather name="plus" size={20} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>記録</Text>
      </Pressable>

      {/* ボトムナビ */}
      <View style={{ flexDirection: "row", backgroundColor: C.navBg, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: insets.bottom }}>
        {NAV_ITEMS.map(n => {
          const active = tab === n.key;
          return (
            <Pressable key={n.key} onPress={() => setTab(n.key)} style={{ flex: 1, paddingVertical: 13, alignItems: "center", gap: 5, minHeight: 62 }}>
              <Feather name={n.icon} size={24} color={active ? C.ink : C.textMuted} />
              <Text style={{ fontSize: 11, fontWeight: active ? "700" : "500", color: active ? C.ink : C.textMuted }}>{n.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <QuickReportSheet
        open={quickReportOpen}
        onClose={closeQuickReport}
        onGoManageCrops={() => { closeQuickReport(); setTab("manage"); setManageSubTab("crops"); }}
      />
      <NotificationsSheet
        open={showNotifs}
        onClose={() => setShowNotifs(false)}
        onOpenTarget={cm => {
          // 通知タップで対象の記録・予定の詳細シートを直接開く。
          // 対象が見つからない場合(削除済み等)は記録タブへ
          if (!openTarget(cm.target_type, cm.target_id)) setTab("report");
        }}
      />
      <ReportDetailSheet report={notifReport} onClose={() => setNotifReport(null)} />
      <ScheduleDetailSheet schedule={notifSchedule} onClose={() => setNotifSchedule(null)} />

      {/* ユーザーシート（ログアウト） */}
      <BottomSheet open={showUserSheet} onClose={() => setShowUserSheet(false)} heightRatio={0.4}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ fontWeight: "700", fontSize: 17, color: C.text, marginBottom: 4 }}>{currentUser?.name ?? ""}</Text>
          <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
            {currentUser?.role === "admin" ? "管理者" : currentUser?.role === "viewer" ? "閲覧者" : "作業者"}
          </Text>
          <Btn variant="secondary" size="lg" onPress={async () => { setShowUserSheet(false); await logout(); }}
            icon={<Feather name="log-out" size={16} color={C.text} />}>
            ログアウト
          </Btn>
          {/* App Store 5.1.1(v): アカウント作成を提供するなら削除もアプリ内から
              提供しなければならない。隠さずログアウトの隣に置く */}
          <Pressable
            onPress={() => { setShowUserSheet(false); setDeleteConfirmId(""); setDeleteError(""); setShowDeleteAccount(true); }}
            style={{ paddingVertical: 12, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.danger }}>アカウントを削除</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* アカウント削除の確認。破壊的操作なので必ずここを挟む */}
      <BottomSheet open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} heightRatio={0.72}>
        {(() => {
          // auth_id を持つ行が「まだ入れる利用者」。退会済みの行は数えない
          const sole = users.filter(u => u.auth_id).length <= 1;
          return (
            <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              <Text style={{ fontWeight: "700", fontSize: 17, color: C.text, marginBottom: 14 }}>
                {sole ? "農場ごと削除" : "アカウントの削除"}
              </Text>

              <View style={{ backgroundColor: C.well, borderRadius: 18, padding: 14, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: C.textSub, lineHeight: 23 }}>
                  {sole
                    ? "この農場を使っているのはあなただけです。削除すると、作業記録・作物・圃場・農薬・相談のすべてが消えます。元に戻すことはできません。"
                    : "あなたのログイン情報とお名前を消します。これまでの作業記録は農場に残ります（農薬の使用回数の集計が欠けないようにするためです）。"
                      + (isAdmin ? " あなたが最後の管理者のときは、いちばん古くから参加している方に管理者を引き継ぎます。" : "")}
                </Text>
              </View>

              {sole && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 8 }}>
                    確認のため、ご自分のユーザーIDを入力してください
                  </Text>
                  <TextInput
                    style={{ paddingVertical: 10, borderBottomWidth: 1.5, borderBottomColor: C.hairline, fontSize: 15, color: C.text }}
                    placeholder={currentUser?.login_id ?? "ユーザーID"}
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="none" autoCorrect={false}
                    value={deleteConfirmId}
                    onChangeText={v => { setDeleteConfirmId(v); setDeleteError(""); }}
                  />
                </View>
              )}

              {!!deleteError && (
                <Text style={{ color: C.danger, fontSize: 13, marginBottom: 14, lineHeight: 21 }}>{deleteError}</Text>
              )}

              <Btn
                variant="danger" size="lg"
                style={{ marginBottom: 10, opacity: deleteBusy ? 0.7 : 1 }}
                onPress={async () => {
                  if (deleteBusy) return;
                  setDeleteBusy(true);
                  setDeleteError("");
                  const msg = await deleteAccount(deleteConfirmId);
                  if (msg) setDeleteError(msg);
                  else { setShowDeleteAccount(false); setAuthView("welcome"); }
                  setDeleteBusy(false);
                }}
              >
                {deleteBusy ? "削除中..." : (sole ? "農場ごと削除する" : "アカウントを削除する")}
              </Btn>
              <Btn variant="tertiary" size="md" onPress={() => setShowDeleteAccount(false)}>やめる</Btn>
            </View>
          );
        })()}
      </BottomSheet>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
