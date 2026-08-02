import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Image, Platform, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { C, RADIUS, workTypeColor } from "../ui/tokens";
import Btn from "../ui/Btn";
import BottomSheet from "../ui/BottomSheet";
import Picker from "../ui/Picker";
import { useStore } from "../lib/store";
import { fetchWeatherForPeriod, type PeriodWeather } from "../lib/weather";
import { canUseAiFeature, structureVoiceApi, saveAiOutput } from "../lib/ai";
import { WORK_TEMPLATES, isPesticideWorkType, calcWorkMinutes } from "../lib/types";

// ─── クイック作業記録（src/App.tsx showQuickReport + addReport の移植・実データ）─
// 灰well+白rowのグループ入力。作物/圃場/作業種別は BottomSheet ピッカー、
// 日付/時刻はネイティブ DateTimePicker。写真は expo-image-picker →
// Supabase Storage。開始終了が揃うと Open-Meteo で時間帯天気を自動取得。
// ドラフト（コピーして作成・タイマー終了）は store の quickReportDraft から受け取る。
interface Props {
  open: boolean;
  onClose: () => void;
}

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
const toTimeStr = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default function QuickReportSheet({ open, onClose }: Props) {
  const {
    currentUser, users, crops, fields, pesticides, workCategories,
    wxAuto, wxLoading, weatherCoords, addReport, quickReportDraft,
  } = useStore();

  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [cropId, setCropId] = useState(0);
  const [fieldName, setFieldName] = useState("");
  const [workCategoryId, setWorkCategoryId] = useState(0);
  const [workType, setWorkType] = useState(WORK_TEMPLATES[0]);
  const [quantityUnit, setQuantityUnit] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [userId, setUserId] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [workEnd, setWorkEnd] = useState("");
  const [note, setNote] = useState("");
  const [soilPh, setSoilPh] = useState("");
  const [selectedPesticides, setSelectedPesticides] = useState<string[]>([]);
  const [pesticideAmounts, setPesticideAmounts] = useState<Record<string, string>>({});
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [periodWeather, setPeriodWeather] = useState<PeriodWeather | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiStructuring, setAiStructuring] = useState(false);
  const [pickerFor, setPickerFor] = useState<"crop" | "field" | "work" | "user" | null>(null);
  const [dtPicker, setDtPicker] = useState<"date" | "start" | "end" | null>(null);

  // 初期値: 自分・先頭の作物/圃場（データ到着後に一度だけ）
  useEffect(() => {
    if (currentUser && !userId) setUserId(currentUser.id);
    if (crops.length > 0 && !cropId) setCropId(crops[0].id);
    if (fields.length > 0 && !fieldName) setFieldName(fields[0].name);
  }, [currentUser, crops, fields]);

  // ドラフト反映（Web版 handleCopyReport / stopWork の rForm 反映と同一の趣旨）
  useEffect(() => {
    if (!open || !quickReportDraft) return;
    const d = quickReportDraft;
    if (d.crop_id != null) setCropId(d.crop_id);
    if (d.field != null) setFieldName(d.field);
    if (d.work_type != null) setWorkType(d.work_type);
    if (d.work_category_id != null) setWorkCategoryId(d.work_category_id);
    if (d.quantity_unit != null) setQuantityUnit(d.quantity_unit ?? "");
    if (d.note != null) setNote(d.note);
    if (d.user_id != null) setUserId(d.user_id);
    if (d.work_start != null || d.work_end != null) {
      setWorkStart(d.work_start ?? "");
      setWorkEnd(d.work_end ?? "");
      setExpanded(true); // 時刻が入っているので詳細を開いて見せる
    }
    setDate(toDateStr(new Date())); // コピー時は日付を今日に（Web版と同一）
  }, [open, quickReportDraft]);

  // 開始・終了時刻が揃ったら圃場（なければ設定座標）の気象を自動取得（Web版と同一）
  useEffect(() => {
    if (!workStart || !workEnd || !date) { setPeriodWeather(null); return; }
    const selectedField = fields.find(f => f.name === fieldName);
    const lat = selectedField?.lat ?? weatherCoords?.lat;
    const lng = selectedField?.lng ?? weatherCoords?.lng;
    if (!lat || !lng) return;
    let cancelled = false;
    fetchWeatherForPeriod(lat, lng, date, workStart, workEnd)
      .then(w => { if (!cancelled) setPeriodWeather(w); })
      .catch(() => { if (!cancelled) setPeriodWeather(null); });
    return () => { cancelled = true; };
  }, [workStart, workEnd, date, fieldName]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("写真ライブラリへのアクセスが許可されていません"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.7, allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const resetForm = () => {
    setQuantity(""); setWorkStart(""); setWorkEnd(""); setNote(""); setSoilPh("");
    setSelectedPesticides([]); setPesticideAmounts({}); setImageUri(null);
    setPeriodWeather(null); setExpanded(false);
    setDate(toDateStr(new Date()));
  };

  // ── メモをAIでフォームに振り分け（Web版 structure-voice 呼び出しと同一） ──
  // 文字起こしはキーボードのマイクボタン（iOS標準音声入力）で行い、
  // 書き溜めたメモの構造化だけAPIに投げる。
  const structureNote = async () => {
    if (!note.trim() || aiStructuring) return;
    setAiStructuring(true);
    try {
      const res = await structureVoiceApi(
        note,
        fields.map(f => f.name),
        workCategories.length > 0 ? workCategories.map(c => c.name) : WORK_TEMPLATES,
        pesticides.map(p => p.name),
      );
      if (!res.ok) { Alert.alert("AI整理に失敗しました", res.error); return; }
      const s = res.data;
      if (s.note) setNote(s.note);
      if (s.field && fields.some(fd => fd.name === s.field)) setFieldName(s.field);
      if (s.work_category) {
        const cat = workCategories.find(c => c.name === s.work_category);
        if (cat) {
          setWorkCategoryId(cat.id);
          setWorkType(cat.name);
          setQuantityUnit(cat.unit ?? "");
        } else if (WORK_TEMPLATES.includes(s.work_category)) {
          setWorkType(s.work_category);
        }
      }
      if (s.pesticide_names.length > 0) {
        const ids = pesticides.filter(p => s.pesticide_names.includes(p.name)).map(p => p.id);
        if (ids.length > 0) setSelectedPesticides(ids);
      }
      if (s.quantity_value != null) setQuantity(String(s.quantity_value));
      if (s.quantity_unit) setQuantityUnit(s.quantity_unit);
      if (s.soil_ph != null) setSoilPh(String(s.soil_ph));
      void saveAiOutput(currentUser?.organization_id ?? null, currentUser?.id ?? null, "voice_structure", {
        targetDate: date, field: s.field ?? fieldName ?? null,
        inputSummary: note, outputJson: s,
      });
    } catch {
      Alert.alert("AI整理に失敗しました");
    } finally {
      setAiStructuring(false);
    }
  };

  // ── 登録（Web版 addReport のペイロード構築と同一） ──
  const submit = async () => {
    if (!date || !workType || submitting) return;
    setSubmitting(true);
    const pw = periodWeather;
    const w = pw ? null : wxAuto;
    const err = await addReport({
      user_id: userId || currentUser?.id,
      crop_id: cropId,
      field: fieldName,
      date,
      work_type: workType,
      work_category_id: workCategoryId || null,
      quantity: quantity,
      quantity_value: quantity ? parseFloat(quantity) : null,
      quantity_unit: quantityUnit || null,
      work_time: "",
      note,
      weather: pw?.weather ?? w?.label ?? "",
      temp: pw?.temp ?? (w?.temp !== undefined ? String(w.temp) : ""),
      humidity: pw?.humidity ?? (w?.humidity !== undefined ? String(w.humidity) : ""),
      rain: pw?.rain ?? (w?.rain !== undefined ? String(w.rain) : ""),
      pesticide_id: selectedPesticides[0] || undefined,
      pesticide_amount: selectedPesticides[0] ? (pesticideAmounts[selectedPesticides[0]] || undefined) : undefined,
      pesticides_used: selectedPesticides.length > 0
        ? selectedPesticides.map(id => ({ id, amount: pesticideAmounts[id] || null }))
        : undefined,
      soil_ph: soilPh ? parseFloat(soilPh) : null,
      work_start: workStart || null,
      work_end: workEnd || null,
      work_minutes: calcWorkMinutes(workStart, workEnd),
    }, imageUri);
    setSubmitting(false);
    if (err) { Alert.alert("登録に失敗しました", err); return; }
    resetForm();
    onClose();
  };

  // ── Soft Widget スタイル ──
  const wrow = {
    backgroundColor: C.card, borderRadius: RADIUS.row,
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: "row" as const, alignItems: "center" as const, gap: 12,
    shadowColor: "#101114", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  };
  const lbl2 = { fontSize: 11, fontWeight: "500" as const, color: C.textMuted, marginBottom: 2 };
  const fieldValue = { fontSize: 16, fontWeight: "600" as const, color: C.text };
  const lbl = { fontSize: 12, fontWeight: "600" as const, color: C.textSub, marginBottom: 5 };
  const underlineInput = {
    paddingVertical: 11, borderBottomWidth: 1.5, borderBottomColor: C.border,
    fontSize: 15, color: C.text, marginBottom: 16,
  };

  const workers = users.filter(u => u.role !== "viewer");
  const selectedCat = workCategories.find(c => c.id === workCategoryId);
  const showQuantity = workCategories.length === 0 || !!quantityUnit || !!selectedCat?.unit;

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* ヘッダー */}
      <View style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "700", fontSize: 17, color: C.text }}>作業を記録</Text>
        <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: C.well, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x" size={16} color={C.textSub} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {/* 天気（白row・自動取得） */}
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, marginBottom: 12 }}>
          <View style={wrow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <Feather name="map-pin" size={11} color={C.textMuted} />
                <Text style={lbl2}>{weatherCoords?.name ?? "..."} · 天気（自動）</Text>
              </View>
              {wxLoading ? (
                <Text style={{ fontSize: 13, color: C.textMuted }}>取得中...</Text>
              ) : wxAuto ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{wxAuto.label}</Text>
                  <Text style={{ color: C.border }}>|</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Feather name="thermometer" size={14} color={C.temp} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>{wxAuto.temp}°C</Text>
                  </View>
                  {wxAuto.humidity !== undefined && (
                    <>
                      <Text style={{ color: C.border }}>|</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Feather name="droplet" size={14} color={C.info} />
                        <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSub }}>{wxAuto.humidity}%</Text>
                      </View>
                    </>
                  )}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: C.textMuted }}>天気を取得できませんでした</Text>
              )}
            </View>
          </View>
        </View>

        {/* 日付・作物/圃場・作業種別（グループ入力） */}
        <View style={{ backgroundColor: C.well, borderRadius: RADIUS.well, padding: 6, marginBottom: 12 }}>
          <Pressable style={wrow} onPress={() => setDtPicker("date")}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>日付</Text>
              <Text style={fieldValue}>{date}</Text>
            </View>
            <Feather name="calendar" size={16} color={C.textMuted} />
          </Pressable>
          <View style={[wrow, { marginTop: 6 }]}>
            <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => setPickerFor("crop")}>
              <Text style={lbl2}>作物</Text>
              <Text style={fieldValue}>{crops.find(c => c.id === cropId)?.name ?? "選択"}</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: C.hairline, paddingLeft: 16 }}
              onPress={() => setPickerFor("field")}
            >
              <Text style={lbl2}>圃場</Text>
              <Text style={fieldValue}>{fieldName || "選択"}</Text>
            </Pressable>
          </View>
          <Pressable style={[wrow, { marginTop: 6 }]} onPress={() => setPickerFor("work")}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={lbl2}>作業の種類</Text>
              <Text style={fieldValue}>{workType}</Text>
            </View>
            <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: workTypeColor(workType).fg }} />
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        </View>

        {/* 詳細アコーディオン */}
        <Btn
          variant="secondary"
          size="md"
          style={{ alignSelf: "stretch", marginBottom: 12, marginTop: 2 }}
          onPress={() => setExpanded(p => !p)}
          icon={<Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={C.textSub} />}
        >
          {expanded ? "詳細を閉じる" : "詳細を入力"}
        </Btn>

        {/* 写真 */}
        <Text style={lbl}>写真</Text>
        {imageUri ? (
          <View style={{ position: "relative", marginBottom: 12 }}>
            <Image source={{ uri: imageUri }} style={{ width: "100%", height: 200, borderRadius: 8 }} resizeMode="cover" />
            <Pressable
              onPress={() => setImageUri(null)}
              style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Feather name="x" size={12} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>削除</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickImage} style={{ alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 2, borderStyle: "dashed", borderColor: C.border, borderRadius: 8, paddingVertical: 20, marginBottom: 12, backgroundColor: C.bg }}>
            <Feather name="camera" size={24} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 13 }}>タップして写真を選択</Text>
          </Pressable>
        )}

        {expanded && (
          <>
            {/* 作業者 */}
            <Text style={lbl}>作業者</Text>
            <Pressable onPress={() => setPickerFor("user")} style={[underlineInput, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
              <Text style={{ fontSize: 15, color: C.text }}>{users.find(u => u.id === userId)?.name ?? "選択"}</Text>
              <Feather name="chevron-down" size={14} color={C.textMuted} />
            </Pressable>

            {/* 実績数量 */}
            {showQuantity && (
              <>
                <Text style={lbl}>実績数量{quantityUnit ? `（${quantityUnit}）` : ""}</Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="例: 20"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    style={[underlineInput, { flex: 1, marginBottom: 0 }]}
                  />
                  <TextInput
                    value={quantityUnit}
                    onChangeText={setQuantityUnit}
                    placeholder="単位"
                    placeholderTextColor={C.textMuted}
                    style={[underlineInput, { width: 70, marginBottom: 0, fontSize: 13 }]}
                  />
                </View>
              </>
            )}

            {/* 作業時刻 */}
            <Text style={lbl}>作業時刻</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <Pressable onPress={() => setDtPicker("start")} style={[underlineInput, { flex: 1, marginBottom: 0 }]}>
                <Text style={{ fontSize: 15, color: workStart ? C.text : C.textMuted }}>{workStart || "開始"}</Text>
              </Pressable>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>〜</Text>
              <Pressable onPress={() => setDtPicker("end")} style={[underlineInput, { flex: 1, marginBottom: 0 }]}>
                <Text style={{ fontSize: 15, color: workEnd ? C.text : C.textMuted }}>{workEnd || "終了"}</Text>
              </Pressable>
            </View>
            {periodWeather && (
              <View style={{ backgroundColor: C.well, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.text }}>{periodWeather.weather}</Text>
                {!!periodWeather.temp && <Text style={{ fontSize: 12, color: C.textSub }}>{periodWeather.temp}°C</Text>}
                {!!periodWeather.humidity && <Text style={{ fontSize: 12, color: C.textSub }}>湿度{periodWeather.humidity}%</Text>}
                {parseFloat(periodWeather.rain) > 0 && <Text style={{ fontSize: 12, color: C.textSub }}>雨量{periodWeather.rain}mm</Text>}
                <Text style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>自動取得</Text>
              </View>
            )}

            {/* 農薬複数選択（防除のときのみ・Web版と同一の出し分け） */}
            {isPesticideWorkType(workType) && (
              <>
                <Text style={lbl}>使用農薬（任意）</Text>
                {pesticides.length === 0 ? (
                  <View style={{ backgroundColor: C.bg, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: C.textMuted }}>登録済みの農薬がありません</Text>
                  </View>
                ) : (
                  <View style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 12, backgroundColor: "#fff" }}>
                    {pesticides.map(p => {
                      const checked = selectedPesticides.includes(p.id);
                      return (
                        <View key={p.id}>
                          <Pressable
                            onPress={() => setSelectedPesticides(prev => checked ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}
                          >
                            <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: checked ? C.ink : C.border, backgroundColor: checked ? C.ink : "#fff", alignItems: "center", justifyContent: "center" }}>
                              {checked && <Feather name="check" size={12} color="#fff" />}
                            </View>
                            <Text style={{ fontSize: 14, color: C.text, flex: 1 }}>{p.name}</Text>
                            {!!p.type && <Text style={{ fontSize: 11, color: C.textMuted }}>{p.type}</Text>}
                          </Pressable>
                          {checked && (
                            <TextInput
                              value={pesticideAmounts[p.id] ?? ""}
                              onChangeText={v => setPesticideAmounts(prev => ({ ...prev, [p.id]: v }))}
                              placeholder="散布量（例: 100L）"
                              placeholderTextColor={C.textMuted}
                              style={{ marginLeft: 26, marginBottom: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.well, borderRadius: 8, fontSize: 13, color: C.text }}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* 土壌pH（施肥のときのみ・Web版と同一の出し分け） */}
            {workType === "施肥" && (
              <>
                <Text style={lbl}>土壌pH（任意）</Text>
                <TextInput
                  value={soilPh}
                  onChangeText={setSoilPh}
                  placeholder="例: 6.5"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  style={underlineInput}
                />
              </>
            )}

            {/* メモ（キーボードのマイクで音声入力 → AIでフォームに振り分け） */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <Text style={[lbl, { marginBottom: 0 }]}>メモ</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="mic" size={11} color={C.textMuted} />
                <Text style={{ fontSize: 11, color: C.textMuted }}>キーボードのマイクで音声入力できます</Text>
              </View>
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="作業の内容・気づいたこと"
              placeholderTextColor={C.textMuted}
              multiline
              style={[underlineInput, { minHeight: 60, textAlignVertical: "top", marginBottom: 8 }]}
            />
            {canUseAiFeature("voiceStructuring") && !!note.trim() && (
              <Btn
                variant="soft" size="sm"
                style={{ alignSelf: "stretch", marginBottom: 12 }}
                onPress={structureNote}
                icon={<Feather name="star" size={13} color={C.ink} />}
              >
                {aiStructuring ? "整理中..." : "メモをAIでフォームに反映"}
              </Btn>
            )}
          </>
        )}

        {/* 保存 */}
        <Btn variant="primary" size="lg" onPress={submit} icon={<Feather name="check" size={16} color="#fff" />}>
          {submitting ? "登録中..." : "記録する"}
        </Btn>
      </View>

      {/* 選択ピッカー */}
      <Picker
        open={pickerFor === "crop"}
        title="作物"
        options={crops.map(c => ({ key: String(c.id), label: c.name }))}
        value={String(cropId)}
        onSelect={v => setCropId(Number(v))}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "field"}
        title="圃場"
        options={fields.map(f => ({ key: f.name, label: f.name }))}
        value={fieldName}
        onSelect={setFieldName}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "work"}
        title="作業の種類"
        options={workCategories.length > 0
          ? workCategories.map(c => ({ key: `cat-${c.id}`, label: c.name + (c.unit ? `（${c.unit}）` : "") }))
          : WORK_TEMPLATES.map(t => ({ key: t, label: t }))}
        value={workCategoryId ? `cat-${workCategoryId}` : workType}
        onSelect={v => {
          if (v.startsWith("cat-")) {
            const cat = workCategories.find(c => c.id === Number(v.slice(4)));
            if (cat) {
              setWorkCategoryId(cat.id);
              setWorkType(cat.name);
              setQuantityUnit(cat.unit ?? "");
            }
          } else {
            setWorkCategoryId(0);
            setWorkType(v);
          }
          if (!isPesticideWorkType(v.startsWith("cat-") ? (workCategories.find(c => c.id === Number(v.slice(4)))?.name ?? "") : v)) {
            setSelectedPesticides([]);
            setPesticideAmounts({});
          }
        }}
        onClose={() => setPickerFor(null)}
      />
      <Picker
        open={pickerFor === "user"}
        title="作業者"
        options={workers.map(u => ({ key: String(u.id), label: u.name }))}
        value={String(userId)}
        onSelect={v => setUserId(Number(v))}
        onClose={() => setPickerFor(null)}
      />

      {/* 日付・時刻ピッカー */}
      {dtPicker && (
        <DateTimePicker
          value={(() => {
            if (dtPicker === "date") return new Date(date + "T00:00:00");
            const t = dtPicker === "start" ? workStart : workEnd;
            const d = new Date();
            if (t) { const [h, m] = t.split(":").map(Number); d.setHours(h, m); }
            return d;
          })()}
          mode={dtPicker === "date" ? "date" : "time"}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selected) => {
            setDtPicker(null);
            if (event.type === "dismissed" || !selected) return;
            if (dtPicker === "date") setDate(toDateStr(selected));
            else if (dtPicker === "start") setWorkStart(toTimeStr(selected));
            else setWorkEnd(toTimeStr(selected));
          }}
        />
      )}
    </BottomSheet>
  );
}
