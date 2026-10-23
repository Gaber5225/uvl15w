"use strict";
window.UVL = window.UVL || {};
(function(NS) {

function getReps() { return window.UVL_REPEATERS || []; }
const TIANDITU_KEY_KEY = "uvl15w_tdt_key";
const MAP_STATE_KEY = "uvl15w_map_state";

let map = null, mapReady = false, tdtLoading = false;
let pickMode = false;           // 地图选点模式
let center = { lat: 39.9042, lng: 116.4074, label: "北京（默认）" };
let radius = 50;               // km
let markers = {};              // id -> T.Marker

const $ = (id) => document.getElementById(id);

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function ctcssIndex(val) {
  let best = 0, bd = 1e9;
  (NS.CTCSS_ARRAY || []).forEach((v, i) => {
    const d = Math.abs(v - (+val));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function dcsIndex(code) {
  const s = String(code).padStart(3, "0");
  const i = (NS.DTCS_ARRAY || []).indexOf(s);
  return i < 0 ? 0 : i;
}
function toneIndexFor(r) {
  if (r[5] === 1) return ctcssIndex(r[6]);
  if (r[5] === 2) return dcsIndex(r[6]);
  return 0;
}
function toneText(r) {
  if (r[5] === 1) return "CTCSS " + r[6];
  if (r[5] === 2) return "DCS " + String(r[6]).padStart(3, "0") + (r[7] ? "R" : "N");
  return "无亚音";
}
function fmtFreq(mhz) { return (+mhz).toFixed(4).replace(/\.?0+$/, ""); }
function byId(id) { return getReps().find(r => r[0] === id); }

/* ---------- 本地存储 ---------- */
function getKey() { try { return localStorage.getItem(TIANDITU_KEY_KEY) || ""; } catch (_) { return ""; } }
function setKey(k) { try { if (k) localStorage.setItem(TIANDITU_KEY_KEY, k); else localStorage.removeItem(TIANDITU_KEY_KEY); } catch (_) {} }
function loadMapState() {
  try {
    const s = JSON.parse(localStorage.getItem(MAP_STATE_KEY) || "{}");
    if (s.lat) center = { lat: s.lat, lng: s.lng, label: s.label || "上次位置" };
    if (s.radius) radius = s.radius;
  } catch (_) {}
}
function saveMapState() {
  try { localStorage.setItem(MAP_STATE_KEY, JSON.stringify({ lat: center.lat, lng: center.lng, label: center.label, radius })); } catch (_) {}
}

function refreshCenterLabel() {
  const el = $("rptCenterLabel"); if (el) el.textContent = "中心点：" + center.label;
  const la = $("rptLat"), lo = $("rptLng");
  if (la) la.value = center.lat.toFixed(4);
  if (lo) lo.value = center.lng.toFixed(4);
}

/* ---------- 列表 ---------- */
function computeNearby() {
  const arr = [];
  const REPS = getReps();
  for (const r of REPS) {
    const d = haversine(center.lat, center.lng, r[11], r[12]);
    if (d <= radius) arr.push({ r, d });
  }
  arr.sort((a, b) => a.d - b.d);
  return arr;
}
function chOptions(sel) {
  let h = "";
  for (let i = 1; i <= 128; i++) h += '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">CH" + i + "</option>";
  return h;
}
async function renderList() {
  const box = $("rptList");
  if (!box) return;
  /* 等待 CSV 异步加载完成 */
  if (NS.repeatersPromise) { try { await NS.repeatersPromise; } catch (_) {} }
  if (NS.repeatersError) {
    box.innerHTML = '<div class="rpt-empty">中继数据加载失败：' + esc(NS.repeatersError) +
      '。<br>请通过本地服务器（如 <code>python -m http.server</code>）打开本页；' +
      '直接用 file:// 打开会被浏览器拦截 CSV 读取。</div>';
    const cnt = $("rptCount");
    if (cnt) cnt.textContent = "数据加载失败";
    return;
  }
  const near = computeNearby();
  const cnt = $("rptCount");
  if (cnt) cnt.textContent = near.length
    ? `附近 ${near.length} 个中继（半径 ${radius}km）`
    : `半径 ${radius}km 内无中继，可扩大半径或移动中心点`;
  box.innerHTML = "";
  if (!near.length) {
    box.innerHTML = '<div class="rpt-empty">该范围内没有中继台，扩大半径或移动中心点试试。</div>';
    return;
  }
  const targetCh = $("rptTargetCh") ? (parseInt($("rptTargetCh").value) || 1) : 1;
  const frag = document.createDocumentFragment();
  near.forEach(item => {
    const r = item.r, d = item.d;
    const card = document.createElement("div");
    card.className = "rpt-card";
    card.dataset.id = r[0];
    const title = esc(r[1]) || esc(r[2]) || r[0];
    const dist = d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km";
    const place = esc(r[9]) + (r[10] && r[10] !== r[9] ? " " + esc(r[10]) : "");
    card.innerHTML =
      '<div class="rpt-card-head">' +
        '<div class="rpt-card-title">' + title + '</div>' +
        '<span class="rpt-card-dist">' + dist + '</span>' +
      '</div>' +
      '<div class="rpt-card-sub">' + (r[2] ? esc(r[2]) + " · " : "") + place + " · " + (r[8] || "FM") + '</div>' +
      '<div class="rpt-card-freq">' +
        '<span><b>RX</b> ' + fmtFreq(r[3]) + '</span>' +
        '<span><b>TX</b> ' + fmtFreq(r[4]) + '</span>' +
        '<span class="rpt-tone">' + esc(toneText(r)) + '</span>' +
      '</div>' +
      '<div class="rpt-card-actions">' +
        '<button class="rpt-fill" data-id="' + r[0] + '">填入并写入 VFO A</button>' +
        '<span class="rpt-ch-pick">信道' +
          '<select class="rpt-ch-select" data-id="' + r[0] + '">' + chOptions(targetCh) + '</select>' +
          '<button class="rpt-write" data-id="' + r[0] + '">写入</button>' +
        '</span>' +
      '</div>';
    frag.appendChild(card);
  });
  box.appendChild(frag);

  box.querySelectorAll(".rpt-fill").forEach(b => b.onclick = () => fillAndWriteVfoA(byId(b.dataset.id), b));
  box.querySelectorAll(".rpt-write").forEach(b => b.onclick = () => {
    const sel = b.previousElementSibling;
    writeToChannel(byId(b.dataset.id), parseInt(sel.value));
  });
}

/* ---------- 写入 VFO A ---------- */
function fillVfoA(r) {
  if (!r) return;
  const rx = Math.round(r[3] * 1e6), tx = Math.round(r[4] * 1e6);
  $("va_rx").value = NS.intToFreq(rx);
  $("va_tx").value = NS.intToFreq(tx);
  const d = NS.deriveDup(rx, tx);
  $("va_dupMode").value = d.dupMode;
  $("va_dupFreq").value = d.dupFreq ? NS.intToFreq(d.dupFreq) : "";
  const tt = r[5];
  $("va_encType").value = tt;
  $("va_decType").value = tt;
  const idx = toneIndexFor(r);
  NS.fillToneSelect($("va_encIndex"), tt, idx);
  NS.fillToneSelect($("va_decIndex"), tt, idx);
  if (NS.commitVfo("A"))
    NS.log(`已填入 VFO A：${r[1] || r[2] || r[0]}（RX ${fmtFreq(r[3])} / TX ${fmtFreq(r[4])}）`, "info");
}

/* ---------- 填入 VFO A 并直接写入手台（不重启模式切换，直接落盘） ---------- */
async function fillAndWriteVfoA(r, btn) {
  if (!r) return;
  if (!NS.state.session || !NS.state.conn) {
    NS.log("请先连接设备（USB 串口或蓝牙）后再写入手台", "err");
    NS.setStatus("未连接，无法写入", "err");
    return;
  }
  /* 1. 填参数并提交到 state.vfoA（含 RX/TX、差频、亚音等） */
  fillVfoA(r);
  const label = r[1] || r[2] || r[0];

  if (btn) btn.disabled = true;
  try {
    NS.log(`已将「${label}」填入 VFO A，正在直接写入手台…`, "info");
    NS.setStatus("写入 VFO A 到手台…", "busy");
    if (NS.showProgress) NS.showProgress(0);

    /* 2. 仅写 VFO A（+ Temp A 镜像），不动任何信道，保持信道现状不变 */
    const session = NS.state.session;
    await session.writeStart();
    const raw = NS.buildChannel48(NS.state.vfoA);
    await session.writeBlock(NS.ADDR_VFO_A, raw);
    await session.writeBlock(NS.ADDR_TEMP_A, raw);
    await session.writeDone();
    NS.state.vfoDirty.A = false;

    if (NS.showProgress) NS.showProgress(95);
    NS.setStatus("VFO A 已写入，设备重启中，正在自动重连…", "busy");

    /* 3. 写频必然触发设备重启，随后自动重连（与“写入全部”一致） */
    const ok = await NS.state.conn.reconnect(15000);
    if (ok) {
      NS.state.session = new NS.RadioSession(NS.state.conn);
      await NS.state.session.handshake();
      if (NS.enableAfterRead) NS.enableAfterRead();
      NS.setStatus("VFO A 已写入并重连成功", "ok");
      NS.log(`「${label}」已写入手台 VFO A（RX ${fmtFreq(r[3])} / TX ${fmtFreq(r[4])}），设备已自动重连。` +
             `可切到「频率模式」页核对，并按手台 VFO 键进入频率模式直接使用。`, "ok");
    } else {
      NS.setStatus("VFO A 已写入，但自动重连失败，请重新连接", "err");
      NS.log("VFO A 已写入并触发重启，但自动重连失败。请点击顶部“连接 USB 串口”重新连接。", "err");
      if (NS.onDisconnected) NS.onDisconnected();
    }
    if (NS.showProgress) NS.showProgress(100);
  } catch (e) {
    NS.setStatus("VFO A 写入失败", "err");
    NS.log(`VFO A 写入失败：${e.message}`, "err");
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => { if (NS.showProgress) NS.showProgress(null); }, 600);
  }
}

/* ---------- 写入信道 ---------- */
function writeToChannel(r, chIndex) {
  if (!r || !chIndex) return;
  const item = NS.state.channels[chIndex - 1];
  if (!item) { NS.log("信道索引无效", "err"); return; }
  const rx = Math.round(r[3] * 1e6), tx = Math.round(r[4] * 1e6);
  const d = NS.deriveDup(rx, tx);
  const tt = r[5], idx = toneIndexFor(r);
  const ch = {
    rx: d.rx, tx: d.tx, dupMode: d.dupMode, dupFreq: d.dupFreq,
    name: r[1] || r[2] || "",
    encType: tt, encIndex: idx,
    decType: tt, decIndex: idx,
    power: 2, channelMode: 0, rxOnly: 0, step: 2,
    offsetDir: 0, squelchType: 1, busyLock: 0,
    dtcsPolarity: tt === 2 ? (r[7] ? 2 : 1) : 0,
    compander: 0, signalingType: 0, signalingIndex: 0,
    scramble: 0, pttId: 0, aprsRx: 0,
    _raw: item.ch ? item.ch._raw : null
  };
  item.ch = ch;
  item.dirty = true;
  NS.renderChannelTable();
  NS.log(`已将「${r[1] || r[2] || r[0]}」写入 CH${chIndex}（记得点“写入全部”同步到手台）`, "info");
}

/* ---------- 天地图 ---------- */
function showTip(title, body) {
  const tip = $("mapTip"), t = $("mapTipTitle"), b = $("mapTipBody");
  if (!tip) return;
  if (t) t.textContent = title;
  if (b) b.textContent = body || "";
  tip.style.display = "flex";
  tip.classList.add("show");
}
function hideTip() {
  const tip = $("mapTip");
  if (tip) { tip.classList.remove("show"); tip.style.display = "none"; }
}
function ensureMap() {
  if (!getKey()) {
    showTip("未配置天地图 Token", "到「设置」中填写天地图 Token 后，这里会显示地图；列表与“填入 VFO A / 写入信道”功能不受影响。");
    return;
  }
  if (map) { map.checkResize(); return; }
  if (tdtLoading) return;
  tdtLoading = true;
  showTip("正在加载天地图…", "");
  const s = document.createElement("script");
  s.src = "https://api.tianditu.gov.cn/api?v=4.0&tk=" + encodeURIComponent(getKey());
  s.onload = () => { tdtLoading = false; buildMap(); };
  s.onerror = () => { tdtLoading = false; showTip("天地图脚本加载失败", "请检查网络或 Token 是否正确。"); };
  document.head.appendChild(s);
}
function buildMap() {
  if (typeof window.T === "undefined") { showTip("天地图 API 未就绪", "请刷新后重试。"); return; }
  try {
    map = new T.Map("mapCanvas");
    map.centerAndZoom(new T.LngLat(center.lng, center.lat), 11);
    map.enableScrollWheelZoom();
    map.addEventListener("click", onMapClick);
    renderMarkers();
    hideTip();
    mapReady = true;
  } catch (e) {
    showTip("地图初始化失败", e.message || String(e));
  }
}
/* 自定义地图图标：搜索中心(蓝针) 与 中继(红点) 区分，避免两者默认图标相同 */
let _centerIcon = null, _repIcon = null;
function svgToIcon(svg, size, anchor) {
  if (typeof T === "undefined") return null;
  return new T.Icon({
    iconUrl: "data:image/svg+xml," + encodeURIComponent(svg),
    iconSize: size,
    iconAnchor: anchor
  });
}
function getCenterIcon() {
  if (_centerIcon) return _centerIcon;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">' +
    '<path d="M14 0C6.27 0 0 6.27 0 14c0 9.7 13 21.6 13.6 22.1a1.5 1.5 0 0 0 2.8 0C17 35.6 28 23.7 28 14 28 6.27 21.73 0 14 0z" fill="#2f6bff"/>' +
    '<circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>';
  _centerIcon = svgToIcon(svg, [28, 36], [14, 36]);
  return _centerIcon;
}
const REP_ICON_SIZE = 32;   // ← 想更大就改这一个数（原 22）

function getRepIcon() {
  if (_repIcon) return _repIcon;
  const s = REP_ICON_SIZE;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 22 22">' +
    '<circle cx="11" cy="11" r="9" fill="#ff4d4f" stroke="#fff" stroke-width="2"/>' +
    '<path d="M11 4.5V12m0 0l-3-2m3 2l3-2M11 12v3.2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<circle cx="11" cy="17" r="1.2" fill="#fff"/></svg>';
  _repIcon = svgToIcon(svg, [s, s], [s / 2, s / 2]);   // ← anchor 同步居中
  return _repIcon;
}
function iconOpts(icon) { return icon ? { icon: icon } : {}; }

function renderMarkers() {
  if (!map) return;
  map.clearOverLays();
  markers = {};
  /* 中心点（搜索中心/我的位置/地图选点）标记：蓝色水滴针 */
  const cMk = new T.Marker(new T.LngLat(center.lng, center.lat), iconOpts(getCenterIcon()));
  cMk.addEventListener("click", () => NS.log("中心点：" + center.label, "info"));
  map.addOverLay(cMk);
  const near = computeNearby();
  near.forEach(item => {
    const r = item.r;
    /* 中继标记：红色圆点（带发射塔图案） */
    const m = new T.Marker(new T.LngLat(r[12], r[11]), iconOpts(getRepIcon()));
    m.addEventListener("click", () => focusRep(r[0]));
    map.addOverLay(m);
    markers[r[0]] = m;
  });
}
function focusRep(id) {
  const card = document.querySelector('.rpt-card[data-id="' + id + '"]');
  if (card) {
    card.scrollIntoView({ block: "center" });
    card.classList.add("rpt-card-focus");
    setTimeout(() => card.classList.remove("rpt-card-focus"), 1600);
  }
}
/* 点击地图 → 设为搜索中心点，并刷新列表与标记 */
function onMapClick(e) {
  if (!pickMode || !e || !e.lnglat) return;
  const ll = e.lnglat;
  const lng = typeof ll.getLng === "function" ? ll.getLng() : ll.lng;
  const lat = typeof ll.getLat === "function" ? ll.getLat() : ll.lat;
  if (typeof lat !== "number" || typeof lng !== "number") return;
  setCenterFromLatLng(lat, lng, "地图选点");
  exitPickMode();
}
/* 统一入口：更新中心 → 同步输入框 → 重算附近中继 */
function setCenterFromLatLng(lat, lng, labelPrefix) {
  center = { lat, lng, label: (labelPrefix || "选点") + " " + lat.toFixed(3) + "," + lng.toFixed(3) };
  refreshCenterLabel();
  saveMapState();
  renderList();
  if (map) { map.centerAndZoom(new T.LngLat(lng, lat), 11); renderMarkers(); }
  NS.log("已更新搜索中心点：" + center.label + "（半径 " + radius + "km）", "ok");
}
function enterPickMode() {
  if (!map) {
    NS.log("请先在「设置」中配置天地图 Token 并显示地图，才能使用地图选点", "err");
    return;
  }
  pickMode = true;
  const hint = $("mapPickHint");
  if (hint) hint.classList.add("show");
  const canvas = $("mapCanvas");
  if (canvas) canvas.classList.add("pick-active");
  const btn = $("btnPickCenter");
  if (btn) { btn.classList.add("active"); btn.textContent = "取消选点"; }
  NS.log("已进入地图选点模式：点击地图任意位置设为搜索中心点", "info");
}
function exitPickMode() {
  pickMode = false;
  const hint = $("mapPickHint");
  if (hint) hint.classList.remove("show");
  const canvas = $("mapCanvas");
  if (canvas) canvas.classList.remove("pick-active");
  const btn = $("btnPickCenter");
  if (btn) { btn.classList.remove("active"); btn.innerHTML = '<svg class="icon"><use href="#i-pointer"/></svg>地图选点'; }
}
function locateMe() {
  if (!navigator.geolocation) { NS.log("当前浏览器不支持定位", "err"); return; }
  NS.log("正在获取位置…", "busy");
  navigator.geolocation.getCurrentPosition(pos => {
    const la = pos.coords.latitude, lo = pos.coords.longitude;
    center = { lat: la, lng: lo, label: "我的位置" };
    refreshCenterLabel(); saveMapState();
    renderList();
    if (map) { map.centerAndZoom(new T.LngLat(lo, la), 11); renderMarkers(); }
    NS.log("已定位到我的位置", "ok");
  }, err => {
    NS.log("定位失败：" + (err.message || err.code) + "（可手动填写经纬度）", "err");
  }, { enableHighAccuracy: true, timeout: 10000 });
}

/* ---------- 初始化 ---------- */
function initTargetCh() {
  const sel = $("rptTargetCh");
  if (!sel) return;
  let html = "";
  for (let i = 1; i <= 128; i++) html += '<option value="' + i + '">CH' + i + "</option>";
  sel.innerHTML = html;
}

function bind() {
  initTargetCh();
  loadMapState();
  refreshCenterLabel();
  renderList();

  const rg = $("rptRadiusGroup");
  if (rg) {
    rg.querySelectorAll(".chip").forEach(c => {
      if (parseInt(c.dataset.r) === radius) c.classList.add("active");
      else c.classList.remove("active");
    });
    rg.querySelectorAll(".chip").forEach(c => c.onclick = () => {
      rg.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      radius = parseInt(c.dataset.r);
      saveMapState();
      renderList();
      if (map) renderMarkers();
    });
  }

  const locate = $("btnLocate");
  if (locate) locate.onclick = locateMe;
  const pick = $("btnPickCenter");
  if (pick) pick.onclick = () => { if (pickMode) exitPickMode(); else enterPickMode(); };
  const setC = $("btnSetCenter");
  if (setC) setC.onclick = () => {
    const la = parseFloat($("rptLat").value), lo = parseFloat($("rptLng").value);
    if (isNaN(la) || isNaN(lo)) { NS.log("请填写有效的纬度 / 经度", "err"); return; }
    center = { lat: la, lng: lo, label: "手动 " + la.toFixed(3) + "," + lo.toFixed(3) };
    refreshCenterLabel(); saveMapState();
    renderList();
    if (map) { map.centerAndZoom(new T.LngLat(lo, la), 11); renderMarkers(); }
  };
  const applyCh = $("btnApplyTargetCh");
  if (applyCh) applyCh.onclick = () => {
    const v = $("rptTargetCh").value;
    document.querySelectorAll(".rpt-ch-select").forEach(s => s.value = v);
    NS.log("已将默认写入信道统一设为 CH" + v, "info");
  };

  /* 天地图 Token 设置 */
  const keyInput = $("setTiandituKey");
  if (keyInput) {
    keyInput.value = getKey();
    const saveK = $("btnSaveKey");
    const clearK = $("btnClearKey");
    if (saveK) saveK.onclick = () => {
      setKey(keyInput.value.trim());
      NS.log("天地图 Token 已保存，切换到「附近中继」页即可显示地图", "ok");
    };
    if (clearK) clearK.onclick = () => {
      setKey("");
      keyInput.value = "";
      NS.log("天地图 Token 已清除", "info");
    };
  }

  /* 切换到地图页时初始化 / 重置尺寸 */
  const mapTab = document.querySelector('.tab[data-tab="map"]');
  if (mapTab) mapTab.addEventListener("click", () => {
    setTimeout(() => { if (!mapReady) ensureMap(); else if (map) map.checkResize(); }, 80);
  });
}

NS.bindRepeaterMapEvents = bind;
NS.onMapPageShow = function () {
  if (!mapReady) ensureMap();
  else if (map) map.checkResize();
  if (NS.repeatersPromise) NS.repeatersPromise.then(() => { if (map) renderMarkers(); }).catch(() => {});
};
NS.fillVfoAFromRepeater = fillVfoA;
NS.fillAndWriteVfoAFromRepeater = fillAndWriteVfoA;

})(window.UVL);
