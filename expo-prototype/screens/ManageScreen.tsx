import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, Platform, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { C, SHADOW, RADIUS, cropColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import RowMenu from "../ui/RowMenu";
import { useStore } from "../lib/store";
import type { PesticideMaster } from "../lib/types";

// ─── 管理（src/App.tsx tab==="manage" ブロックの移植・実データ）──────────
// 作物: 追加+展開式統計 / 圃場: 追加+GPS位置設定+作付け履歴 / 農薬: 追加+リスト。
interface Props {
  subTab: "crops" | "fields" | "pesticides";
}

const secStyle = {
  fontSize: 12, fontWeight: "600" as const, color: C.textMuted,
  marginBottom: 8, marginTop: 20, letterSpacing: 0.4,
};
const cardStyle = {
  backgroundColor: C.card, borderRadius: RADIUS.card,
  paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, ...SHADOW.card,
};
const lblStyle = { fontSize: 12, fontWeight: "600" as const, color: C.textSub, marginBottom: 5 };
const underlineInput = {
  paddingVertical: 11, borderBottomWidth: 1.5, borderBottomColor: C.border,
  fontSize: 15, color: C.text, marginBottom: 16,
};

export default function ManageScreen({ subTab }: Props) {
  const {
    isAdmin, crops, fields, pesticides, reports, cropName,
    addCrop, deleteCrop, addField, deleteField, setFieldLocation,
    addPesticide, deletePesticide, searchPesticideMaster,
  } = useStore();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [showCropAddForm, setShowCropAddForm] = useState(false);
  const [cForm, setCForm] = useState({ name: "", start_date: todayStr, target_yield: "" });
  const [fForm, setFForm] = useState({ name: "" });
  const [pForm, setPForm] = useState({ name: "", type: "", dilution_rate: "" });
  // 農薬マスタ検索（Web版と同一: 300msデバウンス→ilike検索→候補選択で自動入力）
  const [masterSearch, setMasterSearch] = useState("");
  const [masterResults, setMasterResults] = useState<PesticideMaster[]>([]);
  const [masterSearching, setMasterSearching] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState<PesticideMaster | null>(null);
  const [pManualMode, setPManualMode] = useState(false);
  const masterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedCrops, setExpandedCrops] = useState<Set<number>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locatingId, setLocatingId] = useState<number | null>(null);

  // 作物ごとの統計（Web版 cropStats 相当: kg換算できる収穫のみ合算）
  const cropStats = crops.map(c => {
    const rs = reports.filter(r => r.crop_id === c.id);
    const tot = rs.reduce((s, r) => s + ((r.quantity_unit ?? "") === "" || r.quantity_unit === "kg" ? Number(r.quantity) || 0 : 0), 0);
    const growDays = c.start_date ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(c.start_date)) / 86400000)) : null;
    return { id: c.id, count: rs.length, tot: Math.round(tot), growDays };
  });

  // 圃場ごとの作付け履歴（Web版 getFieldCropHistory と同一）
  const getFieldCropHistory = (fieldName: string) => {
    const grouped = reports
      .filter(r => r.field === fieldName)
      .reduce((acc, r) => {
        if (!acc[r.crop_id]) acc[r.crop_id] = { crop_id: r.crop_id, dates: [] as string[], count: 0 };
        acc[r.crop_id].dates.push(r.date);
        acc[r.crop_id].count += 1;
        return acc;
      }, {} as Record<number, { crop_id: number; dates: string[]; count: number }>);
    return Object.values(grouped).map(g => ({
      crop_id: g.crop_id,
      cropName: cropName(g.crop_id),
      lastDate: [...g.dates].sort().slice(-1)[0],
      count: g.count,
    })).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  };

  const handleAddCrop = async () => {
    if (!cForm.name.trim() || submitting) return;
    setSubmitting(true);
    const err = await addCrop(cForm.name, cForm.start_date, cForm.target_yield);
    setSubmitting(false);
    if (err) { Alert.alert("追加に失敗しました", err); return; }
    setCForm({ name: "", start_date: todayStr, target_yield: "" });
    setShowCropAddForm(false);
  };

  const handleAddField = async () => {
    if (!fForm.name.trim() || submitting) return;
    setSubmitting(true);
    const err = await addField(fForm.name);
    setSubmitting(false);
    if (err) { Alert.alert("追加に失敗しました", err); return; }
    setFForm({ name: "" });
  };

  const handleMasterSearchChange = (q: string) => {
    setMasterSearch(q);
    setSelectedMaster(null);
    if (masterTimerRef.current) clearTimeout(masterTimerRef.current);
    if (!q.trim()) { setMasterResults([]); setMasterSearching(false); return; }
    setMasterSearching(true);
    masterTimerRef.current = setTimeout(async () => {
      const results = await searchPesticideMaster(q);
      setMasterResults(results);
      setMasterSearching(false);
    }, 300);
  };

  const selectMaster = (m: PesticideMaster) => {
    setSelectedMaster(m);
    setPForm({ name: m.name, type: m.type || "その他", dilution_rate: m.dilution_rate || "" });
    setMasterSearch(m.name);
    setMasterResults([]);
  };

  const handleAddPesticide = async () => {
    if (!pForm.name.trim() || submitting) return;
    setSubmitting(true);
    const err = await addPesticide(pForm.name, pForm.type, pForm.dilution_rate, selectedMaster);
    setSubmitting(false);
    if (err) { Alert.alert("追加に失敗しました", err); return; }
    setPForm({ name: "", type: "", dilution_rate: "" });
    setMasterSearch("");
    setMasterResults([]);
    setSelectedMaster(null);
  };

  // GPS現在地を圃場位置に設定（Web版 setFieldLocation の RN 版: expo-location）
  const handleSetLocation = async (fieldId: number) => {
    setLocatingId(fieldId);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert("位置情報の使用が許可されていません"); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const err = await setFieldLocation(fieldId, pos.coords.latitude, pos.coords.longitude);
      if (err) Alert.alert("設定に失敗しました", err);
    } catch {
      Alert.alert("GPS位置を取得できませんでした");
    } finally {
      setLocatingId(null);
    }
  };

  const confirmDelete = (message: string, onConfirm: () => void) => {
    Alert.alert("確認", message, [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: onConfirm },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 150 }}
      onScrollBeginDrag={() => openMenuId && setOpenMenuId(null)}
    >
      {/* ── 作物 ── */}
      {subTab === "crops" && (
        <>
          {isAdmin && (
            <>
              <Pressable
                onPress={() => setShowCropAddForm(p => !p)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="plus-circle" size={14} color={C.textMuted} />
                  <Text style={secStyle}>作物を追加</Text>
                </View>
                <Text style={{ fontSize: 16, color: C.primary, fontWeight: "700" }}>{showCropAddForm ? "−" : "+"}</Text>
              </Pressable>
              {showCropAddForm && (
                <View style={cardStyle}>
                  <Text style={lblStyle}>作物名 *</Text>
                  <TextInput style={underlineInput} placeholder="例: キャベツ" placeholderTextColor={C.textMuted}
                    value={cForm.name} onChangeText={v => setCForm(f => ({ ...f, name: v }))} />
                  <Text style={lblStyle}>作付け日</Text>
                  <Pressable onPress={() => setShowDatePicker(true)} style={[underlineInput, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                    <Text style={{ fontSize: 15, color: C.text }}>{cForm.start_date}</Text>
                    <Feather name="calendar" size={14} color={C.textMuted} />
                  </Pressable>
                  <Text style={lblStyle}>目標収穫量（kg/年・任意）</Text>
                  <TextInput style={underlineInput} placeholder="例: 500" placeholderTextColor={C.textMuted} keyboardType="numeric"
                    value={cForm.target_yield} onChangeText={v => setCForm(f => ({ ...f, target_yield: v }))} />
                  <Btn variant="primary" size="lg" onPress={handleAddCrop} icon={<Feather name="plus-circle" size={16} color="#fff" />}>
                    {submitting ? "追加中..." : "作物を追加"}
                  </Btn>
                </View>
              )}
            </>
          )}
          <Text style={secStyle}>登録作物</Text>
          {crops.length === 0 ? (
            <View style={cardStyle}>
              <Text style={{ fontSize: 13, color: C.textMuted }}>作物が登録されていません</Text>
            </View>
          ) : crops.map(c => {
            const stat = cropStats.find(cs => cs.id === c.id);
            const expanded = expandedCrops.has(c.id);
            return (
              <View key={c.id} style={cardStyle}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: cropColor(c.id) }} />
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text style={{ fontWeight: "700", fontSize: 15, color: C.text }}>{c.name}</Text>
                      <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                        {c.start_date}{stat?.growDays != null ? ` · ${stat.growDays}日目` : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Pressable
                      onPress={() => setExpandedCrops(prev => {
                        const s = new Set(prev);
                        if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                        return s;
                      })}
                      style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}
                    >
                      <Feather name={expanded ? "chevron-down" : "chevron-right"} size={16} color={C.textSub} />
                    </Pressable>
                    {isAdmin && (
                      <RowMenu menuKey={`mc${c.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                        items={[{ label: "削除", icon: <Feather name="trash-2" size={13} color={C.danger} />, danger: true, onClick: () => confirmDelete("この作物を削除しますか？", async () => {
                          const err = await deleteCrop(c.id);
                          if (err) Alert.alert("削除に失敗しました", err);
                        }) }]} />
                    )}
                  </View>
                </View>
                {expanded && stat && (
                  <>
                    <View style={{ height: 1, backgroundColor: C.border, marginTop: 8, marginBottom: 12 }} />
                    <View style={{ flexDirection: "row", backgroundColor: C.hairline, borderRadius: 10, overflow: "hidden", gap: 1 }}>
                      {[
                        { v: stat.growDays != null ? String(stat.growDays) : "—", l: "生育日数" },
                        { v: String(stat.count), l: "作業回数" },
                        { v: stat.tot > 0 ? String(stat.tot) : "—", l: stat.tot > 0 ? "kg収穫" : "収穫なし" },
                      ].map((s, i) => (
                        <View key={i} style={{ flex: 1, backgroundColor: C.well, paddingVertical: 10, alignItems: "center" }}>
                          <Text style={{ fontSize: s.v.length > 3 ? 16 : 22, fontWeight: "700", color: C.text }}>{s.v}</Text>
                          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{s.l}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </>
      )}

      {/* ── 圃場 ── */}
      {subTab === "fields" && (
        <>
          {isAdmin && (
            <>
              <Text style={secStyle}>圃場を追加</Text>
              <View style={cardStyle}>
                <Text style={lblStyle}>圃場名 *</Text>
                <TextInput style={underlineInput} placeholder="例: A圃場" placeholderTextColor={C.textMuted}
                  value={fForm.name} onChangeText={v => setFForm({ name: v })} />
                <Btn variant="primary" size="lg" onPress={handleAddField} icon={<Feather name="plus-circle" size={16} color="#fff" />}>
                  {submitting ? "追加中..." : "圃場を追加"}
                </Btn>
              </View>
            </>
          )}
          <Text style={secStyle}>登録圃場</Text>
          {fields.length === 0 ? (
            <View style={cardStyle}>
              <Text style={{ fontSize: 13, color: C.textMuted }}>圃場が登録されていません</Text>
            </View>
          ) : fields.map(f => {
            const history = getFieldCropHistory(f.name);
            return (
              <View key={f.id} style={cardStyle}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 14, color: C.text }}>{f.name}</Text>
                    <Text style={{ fontSize: 12, color: f.lat ? C.textSub : C.textMuted, marginTop: 4 }}>
                      {f.lat ? `${f.lat.toFixed(4)}, ${f.lng?.toFixed(4)}` : "位置未設定"}
                    </Text>
                  </View>
                  {isAdmin && (
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <Btn variant="soft" size="sm" onPress={() => handleSetLocation(f.id)}
                        icon={<Feather name="navigation" size={12} color={C.ink} />}>
                        {locatingId === f.id ? "取得中..." : "現在地"}
                      </Btn>
                      <RowMenu menuKey={`mf${f.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                        items={[{ label: "削除", icon: <Feather name="trash-2" size={13} color={C.danger} />, danger: true, onClick: () => confirmDelete("この圃場を削除しますか？", async () => {
                          const err = await deleteField(f.id);
                          if (err) Alert.alert("削除に失敗しました", err);
                        }) }]} />
                    </View>
                  )}
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 10, paddingTop: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSub, marginBottom: 6 }}>作付け履歴</Text>
                  {history.length === 0 ? (
                    <Text style={{ fontSize: 11, color: C.textMuted }}>記録なし</Text>
                  ) : (
                    <View>
                      <View style={{ flexDirection: "row", paddingBottom: 4 }}>
                        <Text style={{ flex: 2, fontSize: 11, color: C.textMuted, fontWeight: "600" }}>作物</Text>
                        <Text style={{ flex: 2, fontSize: 11, color: C.textMuted, fontWeight: "600" }}>最終作業</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: C.textMuted, fontWeight: "600", textAlign: "right" }}>作業回数</Text>
                      </View>
                      {history.map(h => (
                        <View key={h.crop_id} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 4 }}>
                          <Text style={{ flex: 2, fontSize: 11, color: C.text, fontWeight: "600" }}>{h.cropName}</Text>
                          <Text style={{ flex: 2, fontSize: 11, color: C.textSub }}>{h.lastDate}</Text>
                          <Text style={{ flex: 1, fontSize: 11, color: C.primary, fontWeight: "700", textAlign: "right" }}>{h.count}回</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* ── 農薬 ── */}
      {subTab === "pesticides" && (
        <>
          {isAdmin && (
            <>
              <Text style={secStyle}>農薬を追加</Text>
              <View style={cardStyle}>
                {!pManualMode ? (
                  <>
                    {/* マスタ検索（Web版と同一: 農薬登録情報から名前で検索して選ぶ） */}
                    <Text style={lblStyle}>農薬名で検索</Text>
                    <View style={{ position: "relative", marginBottom: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.well, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                        <Feather name="search" size={15} color={C.textMuted} />
                        <TextInput
                          value={masterSearch}
                          onChangeText={handleMasterSearchChange}
                          placeholder="例: マシン油、ボルドー"
                          placeholderTextColor={C.textMuted}
                          style={{ flex: 1, fontSize: 15, color: C.text, padding: 0 }}
                        />
                        {masterSearching && <ActivityIndicator size="small" color={C.textMuted} />}
                        {!!masterSearch && !masterSearching && (
                          <Pressable onPress={() => { setMasterSearch(""); setMasterResults([]); setSelectedMaster(null); setPForm({ name: "", type: "", dilution_rate: "" }); }}>
                            <Feather name="x" size={14} color={C.textMuted} />
                          </Pressable>
                        )}
                      </View>
                      {masterResults.length > 0 && (
                        <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.hairline, marginTop: 4, overflow: "hidden" }}>
                          {masterResults.map((m, i) => (
                            <Pressable
                              key={m.id}
                              onPress={() => selectMaster(m)}
                              style={{ paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}
                            >
                              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>{m.name}</Text>
                              <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                                {[m.type, m.company, m.dilution_rate].filter(Boolean).join(" · ")}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                      {!!masterSearch.trim() && !masterSearching && masterResults.length === 0 && !selectedMaster && (
                        <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                          見つかりません。下の「手入力に切り替え」から直接登録できます
                        </Text>
                      )}
                    </View>
                    {selectedMaster && (
                      <View style={{ backgroundColor: C.inkSoft, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Feather name="check-circle" size={14} color={C.ink} />
                          <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>{selectedMaster.name}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
                          {[selectedMaster.type, selectedMaster.dilution_rate && `希釈 ${selectedMaster.dilution_rate}`, selectedMaster.reg_no && `登録 ${selectedMaster.reg_no}`].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    )}
                    <Pressable onPress={() => setPManualMode(true)} style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 12, color: C.info, fontWeight: "600" }}>手入力に切り替え</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={lblStyle}>農薬名 *</Text>
                    <TextInput style={underlineInput} placeholder="例: マシン油乳剤" placeholderTextColor={C.textMuted}
                      value={pForm.name} onChangeText={v => setPForm(f => ({ ...f, name: v }))} />
                    <Text style={lblStyle}>種別（任意）</Text>
                    <TextInput style={underlineInput} placeholder="例: 殺虫剤" placeholderTextColor={C.textMuted}
                      value={pForm.type} onChangeText={v => setPForm(f => ({ ...f, type: v }))} />
                    <Text style={lblStyle}>希釈倍数（任意）</Text>
                    <TextInput style={underlineInput} placeholder="例: 1000倍" placeholderTextColor={C.textMuted}
                      value={pForm.dilution_rate} onChangeText={v => setPForm(f => ({ ...f, dilution_rate: v }))} />
                    <Pressable onPress={() => setPManualMode(false)} style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 12, color: C.info, fontWeight: "600" }}>マスタ検索に戻る</Text>
                    </Pressable>
                  </>
                )}
                {(selectedMaster || (pManualMode && pForm.name.trim())) && (
                  <Btn variant="primary" size="lg" onPress={handleAddPesticide} icon={<Feather name="plus-circle" size={16} color="#fff" />}>
                    {submitting ? "追加中..." : "農薬を追加"}
                  </Btn>
                )}
              </View>
            </>
          )}
          <Text style={secStyle}>登録農薬</Text>
          {pesticides.length === 0 ? (
            <View style={cardStyle}>
              <Text style={{ fontSize: 13, color: C.textMuted }}>農薬が登録されていません</Text>
            </View>
          ) : (
            <View style={[cardStyle, { paddingVertical: 0 }]}>
              {pesticides.map((p, i) => (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hairline }}>
                  <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.pesticideBg, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="droplet" size={14} color={C.pesticide} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: "700", fontSize: 14, color: C.text }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {[p.type, p.dilution_rate].filter(Boolean).join(" · ") || "詳細未設定"}
                    </Text>
                  </View>
                  {isAdmin && (
                    <RowMenu menuKey={`mp${p.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                      items={[{ label: "削除", icon: <Feather name="trash-2" size={13} color={C.danger} />, danger: true, onClick: () => confirmDelete("この農薬を削除しますか？", async () => {
                        const err = await deletePesticide(p.id);
                        if (err) Alert.alert("削除に失敗しました", err);
                      }) }]} />
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={new Date(cForm.start_date + "T00:00:00")}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            setShowDatePicker(false);
            if (event.type === "dismissed" || !selected) return;
            setCForm(f => ({ ...f, start_date: selected.toISOString().slice(0, 10) }));
          }}
        />
      )}
    </ScrollView>
  );
}
