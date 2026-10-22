"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { CH_COUNT, CH_SIZE, ADDR_START, ADDR_USE_FLAG, ADDR_SCAN_FLAG,
        ADDR_VFO_A, ADDR_VFO_B,
        CTCSS_ARRAY, DTCS_ARRAY,
        freqToInt, intToFreq, hex,
        parseChannel48, emptyChannel48, buildChannel48,
        isEmptyChannel, deriveDup } = NS;
const state = NS.state;
const $ = (id) => document.getElementById(id);

function initChannels() {
  state.channels = [];
  for (let i = 1; i <= CH_COUNT; i++) {
    state.channels.push({ index: i, ch: null, originalValid: false, originalRaw: null, dirty: false, scan: 0 });
  }
}

function toneText(type, index) {
  if (type == null || type === 0) return "";
  if (type === 1) return CTCSS_ARRAY[index] != null ? String(CTCSS_ARRAY[index]) : "?";
  if (type === 2) return DTCS_ARRAY[index] != null ? "D" + DTCS_ARRAY[index] : "?";
  if (type === 3) return "↺" + (CTCSS_ARRAY[index] != null ? CTCSS_ARRAY[index] : "?");
  if (type === 4) return "↺D" + (DTCS_ARRAY[index] != null ? DTCS_ARRAY[index] : "?");
  return "";
}

function renderChannelTable() {
  const tb = $("chTbody");
  tb.innerHTML = "";
  for (const item of state.channels) {
    const tr = document.createElement("tr");
    const valid = !!item.ch && !isEmptyChannel(item.ch);
    const active = state.editingIndex === item.index;
    const selected = state.selected.has(item.index);
    tr.className = (valid ? "" : "invalid") + (active ? " active" : "") + (item.dirty ? " changed" : "");
    tr.dataset.ch = item.index;

    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = selected; cb.style.width = "auto";
    cb.onchange = (e) => {
      if (e.target.checked) state.selected.add(item.index);
      else state.selected.delete(item.index);
      updateChToolbarState();
    };
    const tdCb = document.createElement("td"); tdCb.appendChild(cb);

    const ch = item.ch || {};
    const tdCh = document.createElement("td"); tdCh.className = "td-ch"; tdCh.textContent = "CH" + item.index;
    const tdName = document.createElement("td"); tdName.className = "td-name"; tdName.textContent = ch.name || (valid ? "(无名称)" : "");
    const tdRx = document.createElement("td"); tdRx.className = "td-freq"; tdRx.textContent = ch.rx ? intToFreq(ch.rx) : "";
    const tdTx = document.createElement("td"); tdTx.className = "td-freq"; tdTx.textContent = ch.tx ? intToFreq(ch.tx) : "";
    const tdDup = document.createElement("td");
    if (ch.dupMode != null) {
      const dm = ["", "-", "+", "分离"][ch.dupMode] || "";
      tdDup.textContent = ch.dupFreq ? `${dm}${intToFreq(ch.dupFreq)}` : "";
    }
    const tdEnc = document.createElement("td"); tdEnc.textContent = toneText(ch.encType, ch.encIndex);
    const tdDec = document.createElement("td"); tdDec.textContent = toneText(ch.decType, ch.decIndex);
    const tdPow = document.createElement("td"); tdPow.textContent = ch.power != null ? ["低","中","高"][ch.power] : "";
    const tdBw = document.createElement("td"); tdBw.textContent = ch.channelMode != null ? (ch.channelMode === 1 ? "窄" : "宽") : "";
    const tdScan = document.createElement("td"); tdScan.textContent = item.scan != null ? ["参与","跳过","优先","保留"][item.scan] : "";
    const tdFlag = document.createElement("td"); tdFlag.className = "td-flag";
    tdFlag.textContent = valid ? "有效" : "空";

    tr.append(tdCb, tdCh, tdName, tdRx, tdTx, tdDup, tdEnc, tdDec, tdPow, tdBw, tdScan, tdFlag);
    tr.onclick = (e) => { if (e.target.tagName !== "INPUT") selectChannel(item.index); };
    tb.appendChild(tr);
  }
  updateChToolbarState();
}

function fillToneSelect(sel, type, curIndex) {
  sel.innerHTML = "";
  if (type === 0) { sel.innerHTML = '<option value="0">—</option>'; sel.disabled = true; return; }
  sel.disabled = false;
  const arr = (type === 1 || type === 3) ? CTCSS_ARRAY : DTCS_ARRAY;
  arr.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = (type === 2 || type === 4) ? "D" + v : v;
    sel.appendChild(opt);
  });
  if (curIndex != null && curIndex < arr.length) sel.value = curIndex;
}

function rebuildToneSelects(prefix) {
  fillToneSelect($(prefix + "encIndex"), parseInt($(prefix + "encType").value), null);
  fillToneSelect($(prefix + "decIndex"), parseInt($(prefix + "decType").value), null);
}

function applyDupToUI(prefix, rxStr, txStr) {
  const rxIn = freqToInt(rxStr);
  const txIn = freqToInt(txStr);
  const d = deriveDup(rxIn, txIn);
//  $(prefix + "rx").value = d.rx ? intToFreq(d.rx) : "";
//  $(prefix + "tx").value = d.tx ? intToFreq(d.tx) : "";
  $(prefix + "dupMode").value = d.dupMode;
  $(prefix + "dupFreq").value = d.dupFreq ? intToFreq(d.dupFreq) : "";
  return d;
}

function selectChannel(index) {
  state.editingIndex = index;
  const item = state.channels[index - 1];
  $("chEditForm").style.display = "block";
  $("chEditPanel").querySelector(".empty-edit").style.display = "none";
  $("chEditTitle").textContent = "编辑 CH" + index;

  const ch = item.ch || {};
  $("f_name").value = ch.name || "";
  $("f_rx").value = ch.rx ? intToFreq(ch.rx) : "";
  $("f_tx").value = ch.tx ? intToFreq(ch.tx) : "";
  $("f_dupMode").value = ch.dupMode != null ? ch.dupMode : 0;
  $("f_dupFreq").value = ch.dupFreq ? intToFreq(ch.dupFreq) : "";
  $("f_encType").value = ch.encType != null ? ch.encType : 0;
  $("f_decType").value = ch.decType != null ? ch.decType : 0;
  rebuildToneSelects("f_");
  $("f_encIndex").value = ch.encIndex || 0;
  $("f_decIndex").value = ch.decIndex || 0;
  $("f_power").value = ch.power != null ? ch.power : 0;
  $("f_bw").value = ch.channelMode === 1 ? 1 : 0;
  $("f_rxOnly").value = ch.rxOnly ? 1 : 0;
  $("f_step").value = ch.step != null ? ch.step : 2;
  $("f_scan").value = item.scan != null ? item.scan : 0;

  $("chEditPanel").classList.add("mobile-open");
  renderChannelTable();
}

function commitChannelEdit(applyToItem = true) {
  if (state.editingIndex < 0) return false;
  const item = state.channels[state.editingIndex - 1];
  const rx = freqToInt($("f_rx").value);
  const tx = freqToInt($("f_tx").value);

  if (!rx && !tx) {
    /* 清空：原有效→全 0xFF 标记；原无效→不动 */
    if (item.originalValid) {
      item.ch = null;
      item.dirty = true;
    } else {
      item.ch = null;
      item.dirty = false;
    }
    if (applyToItem) {
      renderChannelTable();
      NS.log(`CH${item.index} 已清空（写入时将写 0xFF）`, "info");
    }
    return true;
  }

  const dup = deriveDup(rx, tx);
  const ch = {
    rx: dup.rx, tx: dup.tx, dupMode: dup.dupMode, dupFreq: dup.dupFreq,
    name: $("f_name").value.trim(),
    encType: parseInt($("f_encType").value),
    encIndex: parseInt($("f_encIndex").value) || 0,
    decType: parseInt($("f_decType").value),
    decIndex: parseInt($("f_decIndex").value) || 0,
    power: parseInt($("f_power").value),
    channelMode: parseInt($("f_bw").value),
    rxOnly: parseInt($("f_rxOnly").value),
    step: parseInt($("f_step").value),
    offsetDir: item.ch?.offsetDir || 0,
    squelchType: item.ch?.squelchType || 1,
    busyLock: item.ch?.busyLock || 0,
    dtcsPolarity: item.ch?.dtcsPolarity || 0,
    compander: item.ch?.compander || 0,
    signalingType: item.ch?.signalingType || 0,
    signalingIndex: item.ch?.signalingIndex || 0,
    scramble: item.ch?.scramble || 0,
    pttId: item.ch?.pttId || 0,
    aprsRx: item.ch?.aprsRx || 0,
    _raw: item.ch?._raw,
  };

  $("f_rx").value = intToFreq(ch.rx);
  $("f_tx").value = intToFreq(ch.tx);
  $("f_dupMode").value = ch.dupMode;
  $("f_dupFreq").value = ch.dupFreq ? intToFreq(ch.dupFreq) : "";

  item.ch = ch;
  item.dirty = true;
  item.scan = parseInt($("f_scan").value);

  if (applyToItem) {
    renderChannelTable();
    NS.log(`CH${item.index} 已应用：RX ${intToFreq(ch.rx)} / TX ${intToFreq(ch.tx)}`, "info");
  }
  return true;
}

function updateChToolbarState() {
  const n = state.selected.size;
  $("btnChBatch").disabled = n === 0;
  $("btnChClear").disabled = n === 0;
  $("btnChPaste").disabled = n === 0 || !state.clipboard;
  $("btnChMoveUp").disabled = n !== 1;
  $("btnChMoveDown").disabled = n !== 1;
}

/* 读取全部（信道 + 位图 + VFO），完成后自动重连 */
async function doReadAll() {
  if (!state.session) return;
  const btn = $("btnRead");
  btn.disabled = true;
  NS.setStatus("读取中…", "busy");
  NS.showProgress(0);
  const t0 = Date.now();
  try {
    await state.session.readStart();

    NS.setStatus("读有效位图…", "busy");
    NS.showProgress(5);
    const useFlags = await state.session.readUseFlags128();
    NS.log(`有效位图：${hex(useFlags)}`, "info");

    NS.setStatus("读扫描位图…", "busy");
    NS.showProgress(10);
    const scanFlags = await state.session.readScanFlags128();
    NS.log(`扫描位图前16B：${hex(scanFlags.slice(0, 16))}`, "info");

    initChannels();
    const validChs = [];
    for (let ch = 1; ch <= CH_COUNT; ch++) {
      const bi = Math.floor((ch - 1) / 8);
      const bit = (ch - 1) % 8;
      if (((useFlags[bi] >> bit) & 1) === 1) validChs.push(ch);
    }
    NS.log(`有效信道共 ${validChs.length} 个`, "info");

    for (let i = 0; i < validChs.length; i++) {
      const ch = validChs[i];
      const addr = ADDR_START + (ch - 1) * CH_SIZE;
      NS.setStatus(`读取 CH${ch} (${i+1}/${validChs.length})`, "busy");
      NS.showProgress(10 + (i + 1) / validChs.length * 70);
      try {
        const raw = await state.session.readBlock(addr, CH_SIZE);
        const parsed = parseChannel48(raw);
        const item = state.channels[ch - 1];
        item.ch = parsed;
        item.originalValid = true;
        item.originalRaw = raw;
        item.dirty = false;
        item.scan = (((scanFlags[Math.floor((ch-1)/4)] ?? 0) >> (2 * ((ch-1)%4))) & 0x03);
        if (!parsed.rx && !parsed.tx) {
          item.ch = null;
          item.originalValid = false;
        }
      } catch (e) {
        NS.log(`CH${ch} 读取失败：${e.message}`, "err");
      }
    }

    /* 读 VFO */
    NS.setStatus("读 VFO A/B…", "busy");
    NS.showProgress(85);
    try {
      const rawA = await state.session.readBlock(ADDR_VFO_A, CH_SIZE);
      const rawB = await state.session.readBlock(ADDR_VFO_B, CH_SIZE);
      state.vfoA = parseChannel48(rawA);
      state.vfoB = parseChannel48(rawB);
      state.vfoDirty = { A: false, B: false };
      if (NS.renderVfoUI) NS.renderVfoUI();
    } catch (e) {
      NS.log(`VFO 读取失败：${e.message}`, "err");
    }

    renderChannelTable();
    updateChToolbarState();

    /* 读频完成：发 0xE5 "Read Complete" 后设备会重启 */
    await state.session.readDone();

    if (state.keepSessionAfterRead) {
      NS.log("已选择保持会话模式，跳过设备重启（未发送 Read Complete 后未触发重启）", "info");
    } else {
      NS.setStatus("设备重启中，正在自动重连…", "busy");
      NS.showProgress(92);
      const ok = await state.conn.reconnect(15000);
      if (ok) {
        state.session = new NS.RadioSession(state.conn);
        await state.session.handshake();
        NS.setStatus("已读取并自动重连", "ok");
        NS.log("设备已自动重连", "info");
      } else {
        NS.setStatus("自动重连失败，请点击“连接 USB 串口”", "err");
        NS.log("自动重连失败：设备已重启。请点击顶部“连接 USB 串口”按钮；如果弹出设备选择，选择同一台手台即可。已授权端口会在下次点击时优先复用。", "err");
        if (NS.onDisconnected) NS.onDisconnected();
      }
    }

    NS.showProgress(100);
    const ms = Date.now() - t0;
    NS.log(`读取完成，耗时 ${ms} ms`, "info");
    if (NS.enableAfterRead) NS.enableAfterRead();
  } catch (e) {
    NS.setStatus("读取失败", "err");
    NS.log(`读取失败：${e.message}`, "err");
  } finally {
    btn.disabled = false;
    setTimeout(() => NS.showProgress(null), 600);
  }
}

/* 写入（信道 + 可选 VFO），完成后自动重连 */
async function doWriteChannels(includeVFO) {
  if (!state.session) return false;

  const toWrite = [];
  const toClear = [];
  const useChanges = [];
  const scanChanges = [];

  for (const item of state.channels) {
    const hasFreq = !isEmptyChannel(item.ch);
    const wasValid = item.originalValid;
    if (hasFreq) {
      if (item.dirty || !wasValid) {
        toWrite.push(item);
        useChanges.push({ index: item.index, valid: true });
        scanChanges.push({ index: item.index, scan: item.scan || 0 });
      } else if (item.scan != null) {
        scanChanges.push({ index: item.index, scan: item.scan });
      }
    } else if (wasValid && item.dirty) {
      toClear.push(item);
      useChanges.push({ index: item.index, valid: false });
    }
  }

  const vfoA_changed = includeVFO && (state.vfoDirty.A || state.vfoA);
  const vfoB_changed = includeVFO && (state.vfoDirty.B || state.vfoB);

  if (!toWrite.length && !toClear.length && !vfoA_changed && !vfoB_changed) {
    NS.log("没有需要写入的变更", "info");
    return true;
  }

  const preview = [];
  if (toWrite.length) preview.push(`写入有效信道：CH${toWrite.map(i=>i.index).join(", CH")}`);
  if (toClear.length) preview.push(`清空信道（写 0xFF 并清有效位）：CH${toClear.map(i=>i.index).join(", CH")}`);
  if (vfoA_changed) preview.push(`写入 VFO A 并同步 Temp A`);
  if (vfoB_changed) preview.push(`写入 VFO B 并同步 Temp B`);
  const ok = await NS.modalConfirm("写入预览", preview.join("\n") + "\n\n设备完成后会重启，随后自动重连。继续？");
  if (!ok) return false;

  const btn = $("btnWriteAll");
  btn.disabled = true;
  $("btnChWrite").disabled = true;
  NS.setStatus("写入中…", "busy");
  NS.showProgress(0);
  const t0 = Date.now();

  try {
    await state.session.writeStart();
    const total = toWrite.length + toClear.length + (vfoA_changed ? 2 : 0) + (vfoB_changed ? 2 : 0);
    let done = 0;

    for (const item of toWrite) {
      const addr = ADDR_START + (item.index - 1) * CH_SIZE;
      NS.setStatus(`写 CH${item.index} (${++done}/${total})`, "busy");
      NS.showProgress(done / total * 70);
      await state.session.writeBlock(addr, buildChannel48(item.ch));
    }
    for (const item of toClear) {
      const addr = ADDR_START + (item.index - 1) * CH_SIZE;
      NS.setStatus(`清空 CH${item.index} (${++done}/${total})`, "busy");
      NS.showProgress(done / total * 70);
      await state.session.writeBlock(addr, emptyChannel48());
    }
    if (useChanges.length) {
      NS.setStatus("更新有效位图…", "busy");
      NS.showProgress(75);
      const before = await state.session.readBlock(ADDR_USE_FLAG, 16);
      const after = await state.session.writeUseFlags(useChanges);
      NS.log(`有效位图 ${hex(before)} → ${hex(after)}`, "info");
    }
    if (scanChanges.length) {
      NS.setStatus("更新扫描位图…", "busy");
      NS.showProgress(80);
      const before = await state.session.readBlock(ADDR_SCAN_FLAG, 32);
      const after = await state.session.writeScanFlags(scanChanges);
      NS.log(`扫描位图前16B ${hex(before.slice(0,16))} → ${hex(after.slice(0,16))}`, "info");
    }
    if (vfoA_changed) {
      NS.setStatus("写 VFO A + Temp A…", "busy");
      NS.showProgress(85);
      const raw = buildChannel48(state.vfoA);
      await state.session.writeBlock(ADDR_VFO_A, raw);
      await state.session.writeBlock(NS.ADDR_TEMP_A, raw);
    }
    if (vfoB_changed) {
      NS.setStatus("写 VFO B + Temp B…", "busy");
      NS.showProgress(90);
      const raw = buildChannel48(state.vfoB);
      await state.session.writeBlock(ADDR_VFO_B, raw);
      await state.session.writeBlock(NS.ADDR_TEMP_B, raw);
    }

    await state.session.writeDone();

    for (const item of state.channels) {
      if (!isEmptyChannel(item.ch)) {
        item.originalValid = true;
        item.originalRaw = buildChannel48(item.ch);
      } else if (item.originalValid) {
        item.originalValid = false;
        item.originalRaw = null;
      }
      item.dirty = false;
    }
    if (includeVFO) state.vfoDirty = { A:false, B:false };

    NS.setStatus("设备重启中，正在自动重连…", "busy");
    NS.showProgress(95);
    const ok2 = await state.conn.reconnect(15000);
    if (ok2) {
      state.session = new NS.RadioSession(state.conn);
      await state.session.handshake();
      NS.setStatus("写入完成，已自动重连", "ok");
      NS.log("写入完成，设备已自动重连", "info");
    } else {
      NS.setStatus("写入完成，但自动重连失败，请点击“连接 USB 串口”", "err");
      NS.log("写入完成，设备已重启，但自动重连失败。请点击顶部“连接 USB 串口”按钮，会优先复用已授权端口。", "err");
      if (NS.onDisconnected) NS.onDisconnected();
    }

    NS.showProgress(100);
    const ms = Date.now() - t0;
    NS.log(`写入完成，耗时 ${ms} ms`, "info");
    return true;
  } catch (e) {
    NS.setStatus("写入失败", "err");
    NS.log(`写入失败：${e.message}`, "err");
    return false;
  } finally {
    $("btnWriteAll").disabled = false;
    $("btnChWrite").disabled = false;
    setTimeout(() => NS.showProgress(null), 600);
  }
}

function bindChannelEvents() {
  $("f_rx").oninput = () => applyDupToUI("f_", $("f_rx").value, $("f_tx").value);
  $("f_tx").oninput = () => applyDupToUI("f_", $("f_rx").value, $("f_tx").value);
  $("f_encType").onchange = () => fillToneSelect($("f_encIndex"), parseInt($("f_encType").value), null);
  $("f_decType").onchange = () => fillToneSelect($("f_decIndex"), parseInt($("f_decType").value), null);
  $("btnChBack").onclick = () => {
    $("chEditPanel").classList.remove("mobile-open");
  };
    $("btnChApply").onclick = () => {
    const ok = commitChannelEdit(true);
    if (ok) $("chEditPanel").classList.remove("mobile-open");
  };
  $("btnChApplyNext").onclick = () => {
    commitChannelEdit(true);
    const nx = state.editingIndex + 1;
    if (nx <= CH_COUNT) selectChannel(nx);
  };
  $("btnChRevert").onclick = () => {
    if (state.editingIndex < 0) return;
    const item = state.channels[state.editingIndex - 1];
    item.dirty = false;
    item.ch = item.originalRaw ? parseChannel48(item.originalRaw) : null;
    renderChannelTable();
    selectChannel(item.index);
  };

  $("chCheckAll").onchange = (e) => {
    if (e.target.checked) for (let i = 1; i <= CH_COUNT; i++) state.selected.add(i);
    else state.selected.clear();
    renderChannelTable();
  };
  $("btnChSelectAll").onclick = () => {
    for (let i = 1; i <= CH_COUNT; i++) state.selected.add(i);
    renderChannelTable();
  };
  $("btnChSelectNone").onclick = () => { state.selected.clear(); renderChannelTable(); };
  $("btnChClear").onclick = () => {
    for (const idx of state.selected) {
      const item = state.channels[idx - 1];
      if (item.originalValid) { item.ch = null; item.dirty = true; }
      else { item.ch = null; item.dirty = false; }
    }
    renderChannelTable();
    NS.log(`已清空 ${state.selected.size} 行（写入时将写 0xFF）`, "info");
  };
  $("btnChCopy").onclick = () => {
    if (state.editingIndex < 0) return;
    const item = state.channels[state.editingIndex - 1];
    if (!item.ch) return;
    state.clipboard = JSON.parse(JSON.stringify(item.ch));
    updateChToolbarState();
    NS.log(`已复制 CH${item.index}`, "info");
  };
  $("btnChPaste").onclick = () => {
    if (!state.clipboard || state.selected.size === 0) return;
    for (const idx of state.selected) {
      const item = state.channels[idx - 1];
      item.ch = JSON.parse(JSON.stringify(state.clipboard));
      item.dirty = true;
    }
    renderChannelTable();
    NS.log(`已粘贴到 ${state.selected.size} 行`, "info");
  };
  $("btnChMoveUp").onclick = () => {
    if (state.selected.size !== 1) return;
    const idx = [...state.selected][0];
    if (idx <= 1) return;
    const a = state.channels[idx - 1], b = state.channels[idx - 2];
    [a.ch, b.ch] = [b.ch, a.ch];
    [a.originalValid, b.originalValid] = [b.originalValid, a.originalValid];
    [a.originalRaw, b.originalRaw] = [b.originalRaw, a.originalRaw];
    a.dirty = b.dirty = true;
    state.selected = new Set([idx - 1]);
    renderChannelTable();
  };
  $("btnChMoveDown").onclick = () => {
    if (state.selected.size !== 1) return;
    const idx = [...state.selected][0];
    if (idx >= CH_COUNT) return;
    const a = state.channels[idx - 1], b = state.channels[idx];
    [a.ch, b.ch] = [b.ch, a.ch];
    [a.originalValid, b.originalValid] = [b.originalValid, a.originalValid];
    [a.originalRaw, b.originalRaw] = [b.originalRaw, a.originalRaw];
    a.dirty = b.dirty = true;
    state.selected = new Set([idx + 1]);
    renderChannelTable();
  };

  $("btnChBatch").onclick = () => { document.getElementById("modalBatch").classList.add("on"); };
  $("mBatchCancel").onclick = () => { document.getElementById("modalBatch").classList.remove("on"); };
  $("mBatchOk").onclick = () => {
    const power = $("b_power").value;
    const bw = $("b_bw").value;
    const rxOnly = $("b_rxOnly").value;
    const encType = $("b_encType").value;
    const encIndex = $("b_encIndex").value;
    const decType = $("b_decType").value;
    const decIndex = $("b_decIndex").value;
    const scan = $("b_scan").value;

    for (const idx of state.selected) {
      const item = state.channels[idx - 1];
      if (!item.ch) continue;
      if (power !== "") item.ch.power = parseInt(power);
      if (bw !== "") item.ch.channelMode = parseInt(bw);
      if (rxOnly !== "") item.ch.rxOnly = parseInt(rxOnly);
      if (encType !== "") item.ch.encType = parseInt(encType);
      if (encIndex !== "" && !isNaN(parseInt(encIndex))) item.ch.encIndex = parseInt(encIndex);
      if (decType !== "") item.ch.decType = parseInt(decType);
      if (decIndex !== "" && !isNaN(parseInt(decIndex))) item.ch.decIndex = parseInt(decIndex);
      if (scan !== "") item.scan = parseInt(scan);
      item.dirty = true;
    }
    document.getElementById("modalBatch").classList.remove("on");
    renderChannelTable();
    NS.log(`已批量修改 ${state.selected.size} 行`, "info");
  };
  $("b_encType").onchange = () => fillToneSelect($("b_encIndex"), parseInt($("b_encType").value), null);
  $("b_decType").onchange = () => fillToneSelect($("b_decIndex"), parseInt($("b_decType").value), null);
}

NS.initChannels = initChannels;
NS.renderChannelTable = renderChannelTable;
NS.selectChannel = selectChannel;
NS.commitChannelEdit = commitChannelEdit;
NS.applyDupToUI = applyDupToUI;
NS.fillToneSelect = fillToneSelect;
NS.rebuildToneSelects = rebuildToneSelects;
NS.doReadAll = doReadAll;
NS.doWriteChannels = doWriteChannels;
NS.bindChannelEvents = bindChannelEvents;

})(window.UVL);