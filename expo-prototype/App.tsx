import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C } from "./ui/tokens";
import { StoreProvider, useStore } from "./lib/store";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import ReportScreen from "./screens/ReportScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import GanttScreen from "./screens/GanttScreen";
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
type Tab = "home" | "report" | "analytics" | "manage";
type AnalyticsSubTab = "report" | "backlog";
type ManageSubTab = "crops" | "fields" | "pesticides";

const NAV_ITEMS: { key: Tab; icon: "home" | "edit-3" | "bar-chart-2" | "settings"; label: string }[] = [
  { key: "home", icon: "home", label: "ホーム" },
  { key: "report", icon: "edit-3", label: "記録" },
  { key: "analytics", icon: "bar-chart-2", label: "分析" },
  { key: "manage", icon: "settings", label: "管理" },
];

const TITLES: Record<Tab, string> = {
  home: "農作業レポート",
  report: "作業記録",
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
    currentUser, logout, deleteAccount, unreadNotifCount, markNotifsSeen,
    quickReportOpen, openQuickReport, closeQuickReport, reports, schedules,
  } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTab>("report");
  const [manageSubTab, setManageSubTab] = useState<ManageSubTab>("crops");
  const [showUserSheet, setShowUserSheet] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  // 通知タップからの直接遷移用
  const [notifReport, setNotifReport] = useState<Report | null>(null);
  const [notifSchedule, setNotifSchedule] = useState<Schedule | null>(null);

  // アカウント削除。取り返しがつかないので2段階（意図の確認 → 実行）で確かめる
  const confirmDeleteAccount = useCallback(() => {
    if (deletingAccount) return;
    Alert.alert(
      "アカウントを削除しますか？",
      "ログインできなくなり、元に戻せません。\nこれまでの作業記録は農場の記録として残ります。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            const err = await deleteAccount();
            setDeletingAccount(false);
            if (err) { Alert.alert("削除できませんでした", err); return; }
            setShowUserSheet(false);
          },
        },
      ],
    );
  }, [deleteAccount, deletingAccount]);

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
  if (!authSession) return <LoginScreen />;
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

      {/* ユーザーシート（ログアウト・アカウント削除） */}
      <BottomSheet open={showUserSheet} onClose={() => setShowUserSheet(false)} heightRatio={0.5}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ fontWeight: "700", fontSize: 17, color: C.text, marginBottom: 4 }}>{currentUser?.name ?? ""}</Text>
          <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
            {currentUser?.role === "admin" ? "管理者" : currentUser?.role === "viewer" ? "閲覧者" : "作業者"}
          </Text>
          <Btn variant="secondary" size="lg" onPress={async () => { setShowUserSheet(false); await logout(); }}
            icon={<Feather name="log-out" size={16} color={C.text} />}>
            ログアウト
          </Btn>

          {/* アカウント削除。App Store Guideline 5.1.1(v) がアプリ内の導線を求めるため必須。
              作業記録は組織の記録として残ることを、消す前に必ず伝える */}
          <View style={{ height: 1, backgroundColor: C.hairline, marginVertical: 20 }} />
          <Btn variant="dangerOutline" size="md" onPress={confirmDeleteAccount}
            icon={<Feather name="trash-2" size={15} color={C.danger} />}>
            アカウントを削除
          </Btn>
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 10, lineHeight: 17 }}>
            ログインできなくなります。これまでの作業記録は農場の記録として残ります。
          </Text>
        </View>
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
