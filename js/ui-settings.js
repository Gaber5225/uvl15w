"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { CH_COUNT, freqToInt, intToFreq, deriveDup, isEmptyChannel } = NS;
const state = NS.state;
const $ = (id) => document.getElementById(id);
const LOCAL_KEY = "uvl15w_config";

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* 把 state 里最新的 BLE UUID 同步回设置页输入框 */
function syncBleSettingsToUI() {
  if ($("setBleService")) $("setBleService").value = state.bleServiceUuid;
  if ($("setBleWrite"))   $("setBleWrite").value   = state.bleWriteCharUuid;
  if ($("setBleNotify"))  $("setBleNotify").value  = state.bleNotifyCharUuid;
}

function bindSettingsEvents() {
  $("setVerbose").onchange = (e) => { state.verboseLog = e.target.checked; };
  $("setRetry").onchange = (e) => { state.retryCount = Math.max(0, Math.min(3, parseInt(e.target.value) || 0)); };
  $("setBlockSize").onchange = (e) => { state.blockSize = Math.max(16, Math.min(128, parseInt(e.target.value) || 64)); };
  $("setKeepSession").onchange = (e) => { state.keepSessionAfterRead = e.target.checked; };
  $("setBleService").onchange = (e) => { state.bleServiceUuid = e.target.value.trim(); };
  $("setBleWrite").onchange = (e) => { state.bleWriteCharUuid = e.target.value.trim(); };
  $("setBleNotify").onchange = (e) => { state.bleNotifyCharUuid = e.target.value.trim(); };

  $("btnCsvExport").onclick = () => {
    const rows = [["CH","Name","RX_MHz","TX_MHz","DupMode","DupFreq_MHz","EncType","EncIndex","DecType","DecIndex","Power","BW","RxOnly","Scan"]];
    for (const item of state.channels) {
      if (isEmptyChannel(item.ch)) continue;
      const c = item.ch;
      rows.push([
        item.index, c.name || "",
        intToFreq(c.rx), intToFreq(c.tx),
        c.dupMode, c.dupFreq ? intToFreq(c.dupFreq) : "",
        c.encType, c.encIndex, c.decType, c.decIndex,
        c.power, c.channelMode, c.rxOnly,
        item.scan != null ? item.scan : 0,
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    download(new Blob(["\ufeff" + csv], {type:"text/csv;charset=utf-8"}), "uvl15w_channels.csv");
  };
  $("btnCsvImport").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".csv";
    inp.onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const txt = String(reader.result).replace(/^\ufeff/, "");
        const lines = txt.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return;
        const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, ""));
        const idxMap = {};
        headers.forEach((h,i) => idxMap[h.trim()] = i);
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map(v => v.replace(/^"|"$/g, "").trim());
          const ch = parseInt(parts[idxMap["CH"]]);
          if (!ch || ch < 1 || ch > CH_COUNT) continue;
          const rx = freqToInt(parts[idxMap["RX_MHz"]]);
          const tx = freqToInt(parts[idxMap["TX_MHz"]]);
          if (!rx && !tx) continue;
          const d = deriveDup(rx, tx);
          const item = state.channels[ch - 1];
          item.ch = {
            rx: d.rx, tx: d.tx, dupMode: d.dupMode, dupFreq: d.dupFreq,
            name: parts[idxMap["Name"]] || "",
            encType: parseInt(parts[idxMap["EncType"]]) || 0,
            encIndex: parseInt(parts[idxMap["EncIndex"]]) || 0,
            decType: parseInt(parts[idxMap["DecType"]]) || 0,
            decIndex: parseInt(parts[idxMap["DecIndex"]]) || 0,
            power: parseInt(parts[idxMap["Power"]]) || 0,
            channelMode: parseInt(parts[idxMap["BW"]]) || 0,
            rxOnly: parseInt(parts[idxMap["RxOnly"]]) || 0,
            step: 2, offsetDir: 0, squelchType: 1, busyLock: 0,
            dtcsPolarity: 0, compander: 0, signalingType: 0, signalingIndex: 0,
            scramble: 0, pttId: 0, aprsRx: 0,
          };
          item.scan = parseInt(parts[idxMap["Scan"]]) || 0;
          item.dirty = true;
          count++;
        }
        NS.renderChannelTable();
        NS.log(`导入 ${count} 条信道`, "info");
      };
      reader.readAsText(f);
    };
    inp.click();
  };

  $("btnSaveLocal").onclick = () => {
    const data = {
      channels: state.channels.map(item => ({
        index: item.index, ch: item.ch, dirty: false,
        originalValid: item.originalValid, scan: item.scan,
      })),
      vfoA: state.vfoA, vfoB: state.vfoB,
      ble: {
        service: state.bleServiceUuid,
        write: state.bleWriteCharUuid,
        notify: state.bleNotifyCharUuid,
      },
      savedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    NS.log("已保存本地配置", "info");
  };
  $("btnLoadLocal").onclick = () => {
    const txt = localStorage.getItem(LOCAL_KEY);
    if (!txt) { NS.log("本地无配置", "err"); return; }
    try {
      const data = JSON.parse(txt);
      state.channels = data.channels.map(item => ({
        index: item.index, ch: item.ch, dirty: false,
        originalValid: item.originalValid, originalRaw: null, scan: item.scan,
      }));
      state.vfoA = data.vfoA; state.vfoB = data.vfoB;
      if (data.ble) {
        state.bleServiceUuid = data.ble.service || state.bleServiceUuid;
        state.bleWriteCharUuid = data.ble.write || state.bleWriteCharUuid;
        state.bleNotifyCharUuid = data.ble.notify || state.bleNotifyCharUuid;
        syncBleSettingsToUI();
      }
      NS.renderChannelTable();
      NS.renderVfoUI();
      NS.log(`已加载本地配置（保存于 ${new Date(data.savedAt).toLocaleString()}）`, "info");
    } catch (e) { NS.log(`加载失败：${e.message}`, "err"); }
  };
  $("btnExportJson").onclick = () => {
    const data = {
      channels: state.channels.map(item => ({
        index: item.index, ch: item.ch, dirty: false,
        originalValid: item.originalValid, scan: item.scan,
      })),
      vfoA: state.vfoA, vfoB: state.vfoB,
      ble: {
        service: state.bleServiceUuid,
        write: state.bleWriteCharUuid,
        notify: state.bleNotifyCharUuid,
      },
    };
    download(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"}), "uvl15w_config.json");
  };
  $("btnImportJson").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json";
    inp.onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(String(rd.result));
          state.channels = data.channels.map(item => ({
            index: item.index, ch: item.ch, dirty: false,
            originalValid: item.originalValid, originalRaw: null, scan: item.scan,
          }));
          state.vfoA = data.vfoA; state.vfoB = data.vfoB;
          if (data.ble) {
            state.bleServiceUuid = data.ble.service || state.bleServiceUuid;
            state.bleWriteCharUuid = data.ble.write || state.bleWriteCharUuid;
            state.bleNotifyCharUuid = data.ble.notify || state.bleNotifyCharUuid;
            syncBleSettingsToUI();
          }
          NS.renderChannelTable(); NS.renderVfoUI();
          NS.log("已导入 JSON 配置", "info");
        } catch (e) { NS.log(`JSON 导入失败：${e.message}`, "err"); }
      };
      rd.readAsText(f);
    };
    inp.click();
  };
}

NS.bindSettingsEvents = bindSettingsEvents;
NS.syncBleSettingsToUI = syncBleSettingsToUI;

})(window.UVL);