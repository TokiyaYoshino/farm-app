import { useState, useEffect } from "react";

const WORK_TEMPLATES = ["収穫", "水やり", "消毒", "施肥", "剪定", "その他"];

const WEATHER_OPTIONS = [
  { label: "快晴", icon: "☀️" },
  { label: "晴れ", icon: "🌤️" },
  { label: "一部曇り", icon: "⛅" },
  { label: "曇り", icon: "☁️" },
  { label: "霧雨", icon: "🌦️" },
  { label: "雨", icon: "🌧️" },
  { label: "雪", icon: "❄️" },
  { label: "雷雨", icon: "⛈️" },
];

const WMO_MAP = {
  0:"快晴",1:"晴れ",2:"一部曇り",3:"曇り",
  45:"霧雨",48:"霧雨",51:"霧雨",53:"霧雨",55:"霧雨",
  61:"雨",63:"雨",65:"雨",
  71:"雪",73:"雪",75:"雪",
  80:"雨",81:"雨",82:"雷雨",95:"雷雨",99:"雷雨",
};

const roleLabel = { admin: "管理者", worker: "作業者", viewer: "閲覧者" };
const roleColor = { admin: "#e74c3c", worker: "#27ae60", viewer: "#3498db" };

const INIT_USERS = [
  { id: 1, name: "管理者 太郎", role: "admin" },
  { id: 2, name: "作業者 花子", role: "worker" },
  { id: 3, name: "作業者 次郎", role: "worker" },
];

const CROPS = [
  { id: 1, name: "ほうれん草", field: "A圃場", start_date: "2026-03-01" },
  { id: 2, name: "にんにく",   field: "B圃場", start_date: "2026-02-15" },
  { id: 3, name: "たまねぎ",   field: "C圃場", start_date: "2026-02-20" },
  { id: 4, name: "ぶどう",     field: "D圃場", start_date: "2026-03-10" },
];

const INIT_REPORTS = [
  { id: 1, user_id:2, crop_id:1, date:"2026-03-22", work_type:"収穫", quantity:15, work_time:2, note:"順調", weather:"晴れ", weather_icon:"🌤️", temp:14 },
  { id: 2, user_id:3, crop_id:3, date:"2026-03-22", work_type:"水やり", quantity:"", work_time:1, note:"", weather:"曇り", weather_icon:"☁️", temp:12 },
];

export default function App() {
  const [tab, setTab]           = useState("home");
  const [users, setUsers]       = useState(INIT_USERS);
  const [reports, setReports]   = useState(INIT_REPORTS);
  const [currentUser, setCurrentUser] = useState(INIT_USERS[0]);
  const [toast, setToast]       = useState("");

  // weather
  const [wxLoading, setWxLoading] = useState(true);
  const [wxAuto, setWxAuto]       = useState(null);   // { label, icon, temp } or null
  const [wxManual, setWxManual]   = useState({ label:"晴れ", icon:"🌤️", temp:"" });

  // forms
  const [rForm, setRForm] = useState({ user_id:2, crop_id:1, date:"2026-03-23", work_type:"収穫", quantity:"", work_time:"", note:"" });
  const [uForm, setUForm] = useState({ name:"", role:"worker" });

  useEffect(() => {
    let cancelled = false;
    const tryFetch = async (attempt) => {
      try {
        const res  = await fetch("https://api.open-meteo.com/v1/forecast?latitude=35.0167&longitude=135.5833&current_weather=true&timezone=Asia%2FTokyo");
        const data = await res.json();
        const cw   = data.current_weather;
        const lbl  = WMO_MAP[cw.weathercode] || "曇り";
        const opt  = WEATHER_OPTIONS.find(o => o.label === lbl) || WEATHER_OPTIONS[3];
        if (!cancelled) setWxAuto({ label: opt.label, icon: opt.icon, temp: Math.round(cw.temperature) });
      } catch {
        if (attempt < 2) {
          setTimeout(() => { if (!cancelled) tryFetch(attempt + 1); }, 1500);
          return;
        }
        if (!cancelled) setWxAuto(null);
      }
      if (!cancelled) setWxLoading(false);
    };
    tryFetch(0);
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const activeWeather = wxAuto || (wxManual.temp ? { ...wxManual } : null);

  const addReport = () => {
    if (!rForm.date || !rForm.work_type) return;
    const w = activeWeather;
    setReports(p => [...p, { ...rForm, id: Date.now(), image_url:"", weather: w?.label||"", weather_icon: w?.icon||"", temp: w?.temp||"" }]);
    showToast("✅ 作業報告を登録しました");
    setTab("home");
  };

  const addUser = () => {
    if (!uForm.name.trim()) return;
    setUsers(p => [...p, { ...uForm, id: Date.now() }]);
    setUForm({ name:"", role:"worker" });
    showToast("✅ ユーザーを追加しました");
  };

  const deleteUser = (id) => {
    if (id === currentUser.id) return showToast("⚠️ 自分自身は削除できません");
    setUsers(p => p.filter(u => u.id !== id));
  };

  const userName  = (id) => users.find(u => u.id === id)?.name || "不明";
  const cropName  = (id) => CROPS.find(c => c.id === id)?.name || "不明";

  const cropStats = CROPS.map(c => {
    const rs   = reports.filter(r => r.crop_id === c.id);
    const tot  = rs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const last = [...rs].sort((a,b) => b.date.localeCompare(a.date))[0];
    return { ...c, count: rs.length, tot, last };
  });

  // styles
  const S = {
    wrap:    { minHeight:"100vh", background:"#f5f7f0", fontFamily:"'Hiragino Sans',sans-serif", paddingBottom:72 },
    header:  { background:"#2d6a2d", color:"#fff", padding:"14px 16px", fontSize:17, fontWeight:"bold", display:"flex", alignItems:"center", gap:8 },
    page:    { padding:16 },
    card:    { background:"#fff", borderRadius:12, padding:16, marginBottom:12, boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
    sec:     { fontSize:14, fontWeight:"bold", color:"#555", marginBottom:10, marginTop:4 },
    label:   { fontSize:12, color:"#888", marginBottom:4 },
    input:   { width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #ddd", fontSize:15, boxSizing:"border-box", marginBottom:10 },
    select:  { width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #ddd", fontSize:15, boxSizing:"border-box", marginBottom:10, background:"#fff" },
    btn:     { background:"#2d6a2d", color:"#fff", border:"none", borderRadius:8, padding:"12px 0", width:"100%", fontSize:15, fontWeight:"bold", cursor:"pointer" },
    btnSm:   { background:"#e74c3c", color:"#fff", border:"none", borderRadius:6, padding:"5px 10px", fontSize:12, cursor:"pointer" },
    row:     { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 },
    wxBox:   { background:"linear-gradient(135deg,#e8f5e9,#c8e6c9)", borderRadius:12, padding:"12px 16px", marginBottom:12 },
    wxBadge: { background:"#fff", borderRadius:8, padding:"8px 12px", display:"inline-flex", alignItems:"center", gap:6, fontSize:14, fontWeight:"bold", color:"#333", marginRight:8 },
    tmpRow:  { display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 },
    tmpBtn:  (a) => ({ padding:"8px 14px", borderRadius:20, border:"2px solid "+(a?"#2d6a2d":"#ddd"), background:a?"#2d6a2d":"#fff", color:a?"#fff":"#555", fontSize:13, cursor:"pointer", fontWeight:a?"bold":"normal" }),
    nav:     { position:"fixed", bottom:0, left:0, right:0, background:"#fff", borderTop:"1px solid #e0e0e0", display:"flex", zIndex:100 },
    navBtn:  (a) => ({ flex:1, padding:"10px 0 6px", border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:a?"#2d6a2d":"#aaa", fontSize:10, fontWeight:a?"bold":"normal" }),
    tag:     (r) => ({ background:roleColor[r]+"22", color:roleColor[r], borderRadius:5, padding:"2px 8px", fontSize:12, fontWeight:"bold" }),
    toast:   { position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background:"#333", color:"#fff", padding:"10px 20px", borderRadius:20, fontSize:14, zIndex:999, whiteSpace:"nowrap" },
  };

  const navItems = [
    { key:"home",   icon:"🏠", label:"ホーム" },
    { key:"report", icon:"✏️", label:"報告" },
    { key:"crops",  icon:"🌱", label:"作物" },
    ...(currentUser.role === "admin" ? [{ key:"users", icon:"👥", label:"ユーザー" }] : []),
  ];

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        🌾 農作業レポート
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, opacity:0.8 }}>{currentUser.name}</span>
          <select style={{ fontSize:11, borderRadius:5, border:"none", background:"rgba(255,255,255,0.2)", color:"#fff", padding:"3px 6px", cursor:"pointer" }}
            value={currentUser.id} onChange={e => { const u = users.find(u => u.id === Number(e.target.value)); if(u){ setCurrentUser(u); setTab("home"); }}}>
            {users.map(u => <option key={u.id} value={u.id} style={{ color:"#333" }}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* HOME */}
      {tab === "home" && (
        <div style={S.page}>
          <div style={S.wxBox}>
            <div style={{ fontSize:11, color:"#555", marginBottom:6 }}>📍 京都府亀岡市 / 現在の天気</div>
            {wxLoading
              ? <span style={{ fontSize:13, color:"#777" }}>🔄 取得中...</span>
              : wxAuto
                ? <><span style={S.wxBadge}>{wxAuto.icon} {wxAuto.label}</span><span style={S.wxBadge}>🌡️ {wxAuto.temp}°C</span></>
                : <span style={{ fontSize:13, color:"#e07020" }}>⚠️ 取得できませんでした（報告時に手動入力）</span>
            }
          </div>

          <div style={S.sec}>📊 作物サマリー</div>
          {cropStats.map(c => (
            <div key={c.id} style={S.card}>
              <div style={{ fontWeight:"bold", fontSize:16, marginBottom:6 }}>🌿 {c.name} <span style={{ fontSize:12, color:"#888" }}>{c.field}</span></div>
              <div style={{ display:"flex", gap:16, fontSize:13, color:"#555" }}>
                <span>📦 収穫計 <b>{c.tot}kg</b></span>
                <span>🔁 作業 <b>{c.count}回</b></span>
              </div>
              {c.last && <div style={{ fontSize:12, color:"#999", marginTop:4 }}>最終: {c.last.date} {c.last.work_type}</div>}
            </div>
          ))}

          <div style={S.sec}>📋 最新の作業報告</div>
          {[...reports].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5).map(r => (
            <div key={r.id} style={S.card}>
              <div style={S.row}>
                <span style={{ fontWeight:"bold" }}>{cropName(r.crop_id)}</span>
                <span style={{ fontSize:12, color:"#888" }}>{r.date}</span>
              </div>
              <div style={{ fontSize:13, color:"#555" }}>
                {r.work_type}{r.quantity ? ` ・ ${r.quantity}kg` : ""}{r.work_time ? ` ・ ${r.work_time}h` : ""}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                <span style={{ fontSize:12, color:"#aaa" }}>{userName(r.user_id)}</span>
                {r.weather && <span style={{ fontSize:12, color:"#777" }}>{r.weather_icon} {r.weather}{r.temp !== "" ? ` / ${r.temp}°C` : ""}</span>}
              </div>
              {r.note && <div style={{ fontSize:12, color:"#777", marginTop:4 }}>📝 {r.note}</div>}
            </div>
          ))}
        </div>
      )}

      {/* REPORT */}
      {tab === "report" && (
        <div style={S.page}>
          <div style={S.sec}>✏️ 作業報告を登録</div>

          {/* Weather panel */}
          <div style={{ ...S.wxBox, marginBottom:14 }}>
            <div style={{ fontSize:12, color:"#444", marginBottom:6 }}>📍 京都府亀岡市の天気（自動入力）</div>
            {wxLoading
              ? <span style={{ fontSize:13, color:"#777" }}>🔄 取得中...</span>
              : wxAuto
                ? <><span style={S.wxBadge}>{wxAuto.icon} {wxAuto.label}</span><span style={S.wxBadge}>🌡️ {wxAuto.temp}°C</span></>
                : (
                  <div>
                    <div style={{ fontSize:12, color:"#e07020", marginBottom:6 }}>⚠️ 自動取得できませんでした。手動で入力してください。</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <select style={{ ...S.select, marginBottom:0, flex:2 }}
                        value={wxManual.label}
                        onChange={e => { const o = WEATHER_OPTIONS.find(x => x.label === e.target.value) || WEATHER_OPTIONS[0]; setWxManual(f => ({ ...f, label:o.label, icon:o.icon })); }}>
                        {WEATHER_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.icon} {o.label}</option>)}
                      </select>
                      <input type="number" placeholder="気温°C" style={{ ...S.input, marginBottom:0, flex:1 }}
                        value={wxManual.temp} onChange={e => setWxManual(f => ({ ...f, temp:e.target.value }))} />
                    </div>
                  </div>
                )
            }
          </div>

          <div style={S.card}>
            <div style={S.label}>作業の種類</div>
            <div style={S.tmpRow}>
              {WORK_TEMPLATES.map(t => (
                <button key={t} style={S.tmpBtn(rForm.work_type === t)} onClick={() => setRForm(f => ({ ...f, work_type:t }))}>{t}</button>
              ))}
            </div>
            <div style={S.label}>日付</div>
            <input type="date" style={S.input} value={rForm.date} onChange={e => setRForm(f => ({ ...f, date:e.target.value }))} />
            <div style={S.label}>作業者</div>
            <select style={S.select} value={rForm.user_id} onChange={e => setRForm(f => ({ ...f, user_id:Number(e.target.value) }))}>
              {users.filter(u => u.role !== "viewer").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div style={S.label}>作物</div>
            <select style={S.select} value={rForm.crop_id} onChange={e => setRForm(f => ({ ...f, crop_id:Number(e.target.value) }))}>
              {CROPS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={S.label}>収穫量 (kg)</div>
                <input type="number" style={S.input} placeholder="例: 20" value={rForm.quantity} onChange={e => setRForm(f => ({ ...f, quantity:e.target.value }))} />
              </div>
              <div style={{ flex:1 }}>
                <div style={S.label}>作業時間 (h)</div>
                <input type="number" style={S.input} placeholder="例: 2" value={rForm.work_time} onChange={e => setRForm(f => ({ ...f, work_time:e.target.value }))} />
              </div>
            </div>
            <div style={S.label}>メモ</div>
            <input style={S.input} placeholder="気づいたことなど" value={rForm.note} onChange={e => setRForm(f => ({ ...f, note:e.target.value }))} />
            <button style={S.btn} onClick={addReport}>📤 報告を登録する</button>
          </div>
        </div>
      )}

      {/* CROPS */}
      {tab === "crops" && (
        <div style={S.page}>
          <div style={S.sec}>🌱 登録作物</div>
          {CROPS.map(c => (
            <div key={c.id} style={S.card}>
              <div style={{ fontWeight:"bold", fontSize:15 }}>🌿 {c.name}</div>
              <div style={{ fontSize:13, color:"#777", marginTop:4 }}>{c.field}　作付け: {c.start_date}</div>
            </div>
          ))}
          <div style={{ fontSize:12, color:"#aaa", textAlign:"center", marginTop:8 }}>※ 作物の追加・変更は管理者にお問い合わせください</div>
        </div>
      )}

      {/* USERS (admin only) */}
      {tab === "users" && currentUser.role === "admin" && (
        <div style={S.page}>
          <div style={S.sec}>👤 ユーザーを追加</div>
          <div style={S.card}>
            <div style={S.label}>名前 *</div>
            <input style={S.input} placeholder="例: 山田 三郎" value={uForm.name} onChange={e => setUForm(f => ({ ...f, name:e.target.value }))} />
            <div style={S.label}>役割</div>
            <select style={S.select} value={uForm.role} onChange={e => setUForm(f => ({ ...f, role:e.target.value }))}>
              <option value="admin">管理者</option>
              <option value="worker">作業者</option>
              <option value="viewer">閲覧者</option>
            </select>
            <button style={S.btn} onClick={addUser}>＋ ユーザーを追加</button>
          </div>
          <div style={S.sec}>登録済みユーザー</div>
          {users.map(u => (
            <div key={u.id} style={S.card}>
              <div style={S.row}>
                <div><span style={{ fontWeight:"bold", marginRight:8 }}>{u.name}</span><span style={S.tag(u.role)}>{roleLabel[u.role]}</span></div>
                {u.id !== currentUser.id && <button style={S.btnSm} onClick={() => deleteUser(u.id)}>削除</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Nav */}
      <nav style={S.nav}>
        {navItems.map(n => (
          <button key={n.key} style={S.navBtn(tab === n.key)} onClick={() => setTab(n.key)}>
            <span style={{ fontSize:22 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}