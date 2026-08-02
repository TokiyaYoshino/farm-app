import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C } from "./ui/tokens";
import HomeScreen from "./screens/HomeScreen";
import ReportScreen from "./screens/ReportScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import GanttScreen from "./screens/GanttScreen";
import ManageScreen from "./screens/ManageScreen";
import QuickReportSheet from "./screens/QuickReportSheet";

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
  const [tab, setTab] = useState<Tab>("home");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTab>("report");
  const [manageSubTab, setManageSubTab] = useState<ManageSubTab>("crops");
  const [showQuickReport, setShowQuickReport] = useState(false);

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
            <Pressable style={{ width: 36, height: 36, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
              <Feather name="bell" size={17} color={C.textSub} />
              <View style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 999, backgroundColor: C.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 12 }}>2</Text>
              </View>
            </Pressable>
            <Pressable style={{ width: 36, height: 36, backgroundColor: C.well, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
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
      {tab === "home" && <HomeScreen />}
      {tab === "report" && <ReportScreen />}
      {tab === "analytics" && (analyticsSubTab === "report" ? <AnalyticsScreen /> : <GanttScreen />)}
      {tab === "manage" && <ManageScreen subTab={manageSubTab} />}

      {/* FAB（記録） */}
      <Pressable
        onPress={() => setShowQuickReport(true)}
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

      <QuickReportSheet open={showQuickReport} onClose={() => setShowQuickReport(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
