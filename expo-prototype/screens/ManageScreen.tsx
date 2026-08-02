import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, cropColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import RowMenu from "../ui/RowMenu";
import {
  reports, crops as mockCrops, fields as mockFields, pesticides as mockPesticides,
  TODAY, cropName, type Crop, type Field, type Pesticide,
} from "../mock";

// ─── 管理（src/App.tsx tab==="manage" ブロックの移植）──────────────────
// 作物: 追加アコーディオン+カード(展開で3分割統計well) / 圃場: 追加+作付け履歴テーブル /
// 農薬: 追加+リスト。追加・削除はローカルstateのみ(モック動作)。
interface Props {
  subTab: "crops" | "fields" | "pesticides";
}

const IS_ADMIN = true;

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
  const [crops, setCrops] = useState<Crop[]>(mockCrops);
  const [fields, setFields] = useState<Field[]>(mockFields);
  const [pesticides, setPesticides] = useState<Pesticide[]>(mockPesticides);

  const [showCropAddForm, setShowCropAddForm] = useState(false);
  const [cForm, setCForm] = useState({ name: "", start_date: TODAY, target_yield: "" });
  const [fForm, setFForm] = useState({ name: "" });
  const [pForm, setPForm] = useState({ name: "", type: "", dilution_rate: "" });
  const [expandedCrops, setExpandedCrops] = useState<Set<number>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // 作物ごとの統計(Web版 cropStats 相当)
  const cropStats = crops.map(c => {
    const rs = reports.filter(r => r.crop_id === c.id);
    const tot = rs.reduce((s, r) => s + ((r.quantity_unit ?? "") === "" || r.quantity_unit === "kg" ? Number(r.quantity) || 0 : 0), 0);
    const growDays = Math.max(0, Math.round((Date.parse(TODAY) - Date.parse(c.start_date)) / 86400000));
    return { id: c.id, count: rs.length, tot: Math.round(tot), growDays };
  });

  // 圃場ごとの作付け履歴(Web版 getFieldCropHistory 相当)
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

  const addCrop = () => {
    if (!cForm.name.trim()) return;
    setCrops(prev => [...prev, {
      id: Math.max(...prev.map(c => c.id)) + 1,
      name: cForm.name.trim(), start_date: cForm.start_date,
      target_yield: cForm.target_yield ? Number(cForm.target_yield) : undefined,
    }]);
    setCForm({ name: "", start_date: TODAY, target_yield: "" });
    setShowCropAddForm(false);
  };

  const addField = () => {
    if (!fForm.name.trim()) return;
    setFields(prev => [...prev, { id: Math.max(...prev.map(f => f.id)) + 1, name: fForm.name.trim(), lat: null, lng: null }]);
    setFForm({ name: "" });
  };

  const addPesticide = () => {
    if (!pForm.name.trim()) return;
    setPesticides(prev => [...prev, {
      id: `local-p${prev.length}`, name: pForm.name.trim(),
      type: pForm.type.trim() || null, dilution_rate: pForm.dilution_rate.trim() || null,
    }]);
    setPForm({ name: "", type: "", dilution_rate: "" });
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
          {IS_ADMIN && (
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
                  <TextInput style={underlineInput} value={cForm.start_date} onChangeText={v => setCForm(f => ({ ...f, start_date: v }))} />
                  <Text style={lblStyle}>目標収穫量（kg/年・任意）</Text>
                  <TextInput style={underlineInput} placeholder="例: 500" placeholderTextColor={C.textMuted} keyboardType="numeric"
                    value={cForm.target_yield} onChangeText={v => setCForm(f => ({ ...f, target_yield: v }))} />
                  <Btn variant="primary" size="lg" onPress={addCrop} icon={<Feather name="plus-circle" size={16} color="#fff" />}>作物を追加</Btn>
                </View>
              )}
            </>
          )}
          <Text style={secStyle}>登録作物</Text>
          {crops.map(c => {
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
                    {IS_ADMIN && (
                      <RowMenu menuKey={`mc${c.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                        items={[{ label: "削除", icon: <Feather name="trash-2" size={13} color={C.danger} />, danger: true, onClick: () => setCrops(prev => prev.filter(x => x.id !== c.id)) }]} />
                    )}
                  </View>
                </View>
                {expanded && stat && (
                  <>
                    <View style={{ height: 1, backgroundColor: C.border, marginTop: 8, marginBottom: 12 }} />
                    <View style={{ flexDirection: "row", backgroundColor: C.hairline, borderRadius: 10, overflow: "hidden", marginBottom: 12, gap: 1 }}>
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
                    <Text style={{ color: C.ink, fontSize: 13, fontWeight: "600" }}>分析で見る →</Text>
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
          {IS_ADMIN && (
            <>
              <Text style={secStyle}>圃場を追加</Text>
              <View style={cardStyle}>
                <Text style={lblStyle}>圃場名 *</Text>
                <TextInput style={underlineInput} placeholder="例: A圃場" placeholderTextColor={C.textMuted}
                  value={fForm.name} onChangeText={v => setFForm({ name: v })} />
                <Btn variant="primary" size="lg" onPress={addField} icon={<Feather name="plus-circle" size={16} color="#fff" />}>圃場を追加</Btn>
              </View>
            </>
          )}
          <Text style={secStyle}>登録圃場</Text>
          {fields.map(f => {
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
                  {IS_ADMIN && (
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <Btn variant="soft" size="sm" icon={<Feather name="navigation" size={12} color={C.ink} />}>現在地</Btn>
                      <RowMenu menuKey={`mf${f.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                        items={[{ label: "削除", icon: <Feather name="trash-2" size={13} color={C.danger} />, danger: true, onClick: () => setFields(prev => prev.filter(x => x.id !== f.id)) }]} />
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
          {IS_ADMIN && (
            <>
              <Text style={secStyle}>農薬を追加</Text>
              <View style={cardStyle}>
                <Text style={lblStyle}>農薬名 *</Text>
                <TextInput style={underlineInput} placeholder="例: マシン油乳剤" placeholderTextColor={C.textMuted}
                  value={pForm.name} onChangeText={v => setPForm(f => ({ ...f, name: v }))} />
                <Text style={lblStyle}>種別（任意）</Text>
                <TextInput style={underlineInput} placeholder="例: 殺虫剤" placeholderTextColor={C.textMuted}
                  value={pForm.type} onChangeText={v => setPForm(f => ({ ...f, type: v }))} />
                <Text style={lblStyle}>希釈倍数（任意）</Text>
                <TextInput style={underlineInput} placeholder="例: 1000倍" placeholderTextColor={C.textMuted}
                  value={pForm.dilution_rate} onChangeText={v => setPForm(f => ({ ...f, dilution_rate: v }))} />
                <Btn variant="primary" size="lg" onPress={addPesticide} icon={<Feather name="plus-circle" size={16} color="#fff" />}>農薬を追加</Btn>
              </View>
            </>
          )}
          <Text style={secStyle}>登録農薬</Text>
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
                {IS_ADMIN && (
                  <RowMenu menuKey={`mp${p.id}`} openId={openMenuId} setOpenId={setOpenMenuId}
                    items={[{ label: "削除", icon: <Feather name="trash-2" size={13} color={C.danger} />, danger: true, onClick: () => setPesticides(prev => prev.filter(x => x.id !== p.id)) }]} />
                )}
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
