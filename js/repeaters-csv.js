/* 运行时加载：从 repeaters.csv 读取中继台数据（单一数据源）
 * 取代原先的 js/repeaters-data.js（硬编码数组）。
 * 网页启动即异步 fetch 本目录下的 repeaters.csv，解析并映射成
 * window.UVL_REPEATERS 元组数组，供 ui-repeater-map.js 使用。
 *
 * 元组字段顺序（与旧 repeaters-data.js 完全一致）：
 *   [0] id, [1] 名称, [2] 呼号, [3] RX(MHz), [4] TX(MHz),
 *   [5] 亚音类型(0无/1模拟CTCSS/2数字DCS), [6] 亚音值(CTCSS频率/DCS码),
 *   [7] DCS反向(0/1), [8] 制式(FM/C4FM/DMR/D-STAR), [9] 省, [10] 市,
 *   [11] 纬度, [12] 经度
 */
window.UVL = window.UVL || {};
(function (NS) {

  /* 解析 CSV（支持双引号字段、字段内逗号、CRLF/LF、UTF-8 BOM） */
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去掉 BOM
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* 忽略，与随后的 \n 一起处理 */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function toToneType(s) {
    if (!s) return 0;
    if (s.indexOf("DCS") >= 0) return 2;
    if (s.indexOf("CTCSS") >= 0) return 1;
    return 0;
  }

  /* 根据表头把一行映射成元组；无效（已停用 / 无坐标）返回 null */
  function buildTuple(hdr, cols) {
    const get = (name) => {
      const i = hdr.indexOf(name);
      return i >= 0 ? (cols[i] || "").trim() : "";
    };
    const disabled = get("停用") === "是";
    if (disabled) return null;

    const id = get("编号");
    const name = get("名称");
    const callsign = get("呼号");
    const rx = parseFloat(get("下行频率RX(MHz)"));
    const tx = parseFloat(get("上行频率TX(MHz)"));
    const mode = get("制式") || "FM";

    const toneType = toToneType(get("亚音类型"));
    const ctcss = get("CTCSS(Hz)");
    const dcsCode = get("DCS码");
    const dcsRev = get("DCS极性").indexOf("反向") >= 0 ? 1 : 0;

    let toneVal = 0;
    if (toneType === 1) toneVal = parseFloat(ctcss) || 0;
    else if (toneType === 2) toneVal = dcsCode ? parseInt(dcsCode, 10) : 0;

    const province = get("省份");
    let city = get("地点");
    if (city && province && city.indexOf(province) === 0) city = city.slice(province.length).trim();

    const lat = parseFloat(get("纬度"));
    const lng = parseFloat(get("经度"));
    if (!isFinite(lat) || !isFinite(lng)) return null;

    return [id, name, callsign, rx, tx, toneType, toneVal, dcsRev, mode, province, city, lat, lng];
  }

  async function load() {
    const resp = await fetch("repeaters.csv", { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const hdr = rows[0].map((h) => h.trim());
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const t = buildTuple(hdr, rows[i]);
      if (t) out.push(t);
    }
    window.UVL_REPEATERS = out;
    return out;
  }

  NS.repeatersPromise = load().catch((err) => {
    console.error("[repeaters-csv] 加载失败：", err);
    window.UVL_REPEATERS = [];
    NS.repeatersError = err && err.message ? err.message : String(err);
    return [];
  });

})(window.UVL);
