import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { C, SHADOW } from "../ui/tokens";
import BottomSheet from "../ui/BottomSheet";
import Btn from "../ui/Btn";
import { useStore } from "../lib/store";

// ─── 圃場マップ（src/App.tsx のマップモーダル(react-leaflet)の移植）───────
// RN では react-native-maps（iOS=Apple Maps、Expo Go 対応）。
// 位置設定済みの圃場に緑ピン、現在地ボタンで自位置へ移動。
interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FieldMapSheet({ open, onClose }: Props) {
  const { fields, weatherCoords, reports, cropName } = useStore();
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const located = fields.filter(f => f.lat != null && f.lng != null);

  // 初期表示: 圃場があればその重心、なければ設定座標
  const center = located.length > 0
    ? {
        latitude: located.reduce((s, f) => s + (f.lat ?? 0), 0) / located.length,
        longitude: located.reduce((s, f) => s + (f.lng ?? 0), 0) / located.length,
      }
    : { latitude: weatherCoords?.lat ?? 35.0167, longitude: weatherCoords?.lng ?? 135.5833 };

  // 圃場の直近作業（ピンのコールアウトに表示）
  const lastWork = (fieldName: string) => {
    const r = reports.filter(x => x.field === fieldName).sort((a, b) => b.date.localeCompare(a.date))[0];
    return r ? `${r.date} ${r.work_type}（${cropName(r.crop_id)}）` : "作業記録なし";
  };

  const locateMe = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } finally {
      setLocating(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.85}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="map-pin" size={16} color={C.primary} />
          <Text style={{ fontWeight: "700", fontSize: 15, color: C.text }}>圃場マップ</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Btn variant="soft" size="sm" onPress={locateMe} icon={<Feather name="navigation" size={12} color={C.ink} />}>
            {locating ? "取得中..." : "現在地"}
          </Btn>
          <Btn variant="secondary" size="sm" onPress={onClose}>閉じる</Btn>
        </View>
      </View>
      <View style={{ height: 480, marginHorizontal: 16, borderRadius: 16, overflow: "hidden", ...SHADOW.card }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={{ ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          region={userPos ? { latitude: userPos.lat, longitude: userPos.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
          showsUserLocation
        >
          {located.map(f => (
            <Marker
              key={f.id}
              coordinate={{ latitude: f.lat as number, longitude: f.lng as number }}
              title={f.name}
              description={lastWork(f.name)}
              pinColor={C.ink}
            />
          ))}
        </MapView>
      </View>
      {located.length === 0 && (
        <Text style={{ fontSize: 12, color: C.textMuted, paddingHorizontal: 16, marginTop: 10, lineHeight: 18 }}>
          位置が設定された圃場がありません。管理タブ → 圃場 →「現在地」で圃場にいる時に位置を記録できます。
        </Text>
      )}
    </BottomSheet>
  );
}
