import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import { EntryModeSwitch, WorkTiles, entryHeading, type EntryMode } from "../ui/WorkTiles";

// ─── ホームの「＋記録」と予定カードから開く「作業を選ぶ」シート ─────────────
// 記録タブの先頭と同じ部品（記録｜予定の切替＋作業タイル）。選んだら閉じて、
// 記録なら入力シート、予定なら予定シートへ渡す（親が開く）。
interface Props {
  open: boolean;
  initialMode: EntryMode;
  onClose: () => void;
  onPick: (mode: EntryMode, workType: string) => void;
}

export default function EntrySheet({ open, initialMode, onClose, onPick }: Props) {
  const [mode, setMode] = useState<EntryMode>(initialMode);
  useEffect(() => { if (open) setMode(initialMode); }, [open, initialMode]);
  const h = entryHeading(mode);

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.6}>
      <View style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <EntryModeSwitch mode={mode} onChange={setMode} />
        </View>
        <Pressable onPress={onClose} accessibilityLabel="閉じる" style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x" size={16} color={C.textSub} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 11, fontWeight: "500", color: h.color, marginBottom: 8, paddingHorizontal: 4 }}>{h.text}</Text>
        <WorkTiles mode={mode} onPick={t => onPick(mode, t)} />
      </View>
    </BottomSheet>
  );
}
