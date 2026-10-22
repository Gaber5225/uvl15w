"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { ADDR_VFO_A, ADDR_VFO_B, CH_SIZE,
        freqToInt, intToFreq,
        parseChannel48, deriveDup,
        CTCSS_ARRAY, DTCS_ARRAY } = NS;
const state = NS.state;
const $ = (id) => document.getElementById(id);

function renderVfoUI() {
  for (const side of ["A", "B"]) {
    const ch = side === "A" ? state.vfoA : state.vfoB;
    const prefix = side === "A" ? "va_" : "vb_";
    const chd = ch || {};
    $(prefix + "rx").value = chd.rx ? intToFreq(chd.rx) : "";
    $(prefix + "tx").value = chd.tx ? intToFreq(chd.tx) : "";
    $(prefix + "dupMode").value = chd.dupMode != null ? chd.dupMode : 0;
    $(prefix + "dupFreq").value = chd.dupFreq ? intToFreq(chd.dupFreq) : "";
    $(prefix + "encType").value = chd.encType != null ? chd.encType : 0;
    $(prefix + "decType").value = chd.decType != null ? chd.decType : 0;
    NS.fillToneSelect($(prefix + "encIndex"), chd.encType || 0, chd.encIndex || 0);
    NS.fillToneSelect($(prefix + "decIndex"), chd.decType || 0, chd.decIndex || 0);
    $(prefix + "power").value = chd.power != null ? chd.power : 0;
    $(prefix + "bw").value = chd.channelMode === 1 ? 1 : 0;
    $(prefix + "step").value = chd.step != null ? chd.step : 2;
  }
}

function commitVfo(side) {
  const prefix = side === "A" ? "va_" : "vb_";
  const rx = freqToInt($(prefix + "rx").value);
  const tx = freqToInt($(prefix + "tx").value);
  if (!rx && !tx) { NS.log(`VFO ${side} 频率为空，请至少填一个`, "err"); return false; }
  const d = deriveDup(rx, tx);
  const old = (side === "A" ? state.vfoA : state.vfoB) || {};
  const ch = {
    ...old,
    rx: d.rx, tx: d.tx, dupMode: d.dupMode, dupFreq: d.dupFreq,
    name: old.name || "",
    encType: parseInt($(prefix + "encType").value),
    encIndex: parseInt($(prefix + "encIndex").value) || 0,
    decType: parseInt($(prefix + "decType").value),
    decIndex: parseInt($(prefix + "decIndex").value) || 0,
    power: parseInt($(prefix + "power").value),
    channelMode: parseInt($(prefix + "bw").value),
    step: parseInt($(prefix + "step").value),
    offsetDir: old.offsetDir || 0,
    squelchType: old.squelchType || 1,
    busyLock: old.busyLock || 0,
    dtcsPolarity: old.dtcsPolarity || 0,
    compander: old.compander || 0,
    signalingType: old.signalingType || 0,
    signalingIndex: old.signalingIndex || 0,
    scramble: old.scramble || 0,
    pttId: old.pttId || 0,
    aprsRx: old.aprsRx || 0,
    rxOnly: old.rxOnly || 0,
    _raw: old._raw,
  };
  if (side === "A") state.vfoA = ch; else state.vfoB = ch;
  state.vfoDirty[side] = true;
  $(prefix + "rx").value = intToFreq(ch.rx);
  $(prefix + "tx").value = intToFreq(ch.tx);
  $(prefix + "dupMode").value = ch.dupMode;
  $(prefix + "dupFreq").value = ch.dupFreq ? intToFreq(ch.dupFreq) : "";
  return true;
}

function clearVfo(side) {
  const old = (side === "A" ? state.vfoA : state.vfoB) || {};
  const newCh = {
    ...old,
    rx: 430000000, tx: 430000000,
    dupMode: 0, dupFreq: 0,
    encType: 0, encIndex: 0,
    decType: 0, decIndex: 0,
  };
  if (side === "A") state.vfoA = newCh; else state.vfoB = newCh;
  state.vfoDirty[side] = true;
  renderVfoUI();
  NS.log(`VFO ${side} 已设置为 430.000，差频和亚音已清除（其他参数保留）`, "info");
}

/* 中继台快捷区 */
function fillRptToneSelect() {
  NS.fillToneSelect($("rpt_toneValue"), parseInt($("rpt_toneType").value), null);
}

function rptApplyToVfo() {
  const rx = freqToInt($("rpt_rx").value);
  const tx = freqToInt($("rpt_tx").value);
  if (!rx || !tx) { NS.log("请填写上行和下行频率", "err"); return; }
  const target = $("rpt_target").value;
  const prefix = target === "A" ? "va_" : "vb_";
  const toneType = parseInt($("rpt_toneType").value);
  const toneVal = parseInt($("rpt_toneValue").value) || 0;

  $(prefix + "rx").value = intToFreq(rx);
  $(prefix + "tx").value = intToFreq(tx);
  const d = deriveDup(rx, tx);
  $(prefix + "dupMode").value = d.dupMode;
  $(prefix + "dupFreq").value = d.dupFreq ? intToFreq(d.dupFreq) : "";
  $(prefix + "encType").value = toneType;
  $(prefix + "decType").value = toneType;
  NS.fillToneSelect($(prefix + "encIndex"), toneType, toneVal);
  NS.fillToneSelect($(prefix + "decIndex"), toneType, toneVal);

  if (commitVfo(target)) NS.log(`已填入 VFO ${target}（尚未写入手台）`, "info");
}

function rptClear() {
  $("rpt_rx").value = "";
  $("rpt_tx").value = "";
  $("rpt_toneType").value = 0;
  fillRptToneSelect();
}

const RPT_MEM_KEY = "uvl15w_rpt_mem";
function loadRptMem() {
  try { return JSON.parse(localStorage.getItem(RPT_MEM_KEY) || "[]"); }
  catch (_) { return []; }
}
function saveRptMem(list) {
  localStorage.setItem(RPT_MEM_KEY, JSON.stringify(list));
  renderRptMem();
}
function renderRptMem() {
  const list = loadRptMem();
  const box = $("rptMemList");
  if (!list.length) {
    box.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted); font-size:12px;">无记忆</div>';
    return;
  }
  box.innerHTML = "";
  list.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "rpt-mem-item";
    div.innerHTML = `<span>RX ${intToFreq(item.rx)} / TX ${intToFreq(item.tx)} ${item.toneType ? '| T'+item.toneType+' #'+item.toneValue : ''}</span>
      <span><button data-del="${i}" style="padding:2px 8px;">删除</button></span>`;
    div.onclick = (e) => {
      if (e.target.dataset.del != null) return;
      $("rpt_rx").value = intToFreq(item.rx);
      $("rpt_tx").value = intToFreq(item.tx);
      $("rpt_toneType").value = item.toneType || 0;
      fillRptToneSelect();
      $("rpt_toneValue").value = item.toneValue || 0;
    };
    div.querySelector("button").onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(e.target.dataset.del);
      const list = loadRptMem();
      list.splice(idx, 1);
      saveRptMem(list);
    };
    box.appendChild(div);
  });
}

function bindVfoEvents() {
  for (const side of ["A","B"]) {
    const p = side === "A" ? "va_" : "vb_";
    $(p + "rx").oninput = () => NS.applyDupToUI(p, $(p + "rx").value, $(p + "tx").value);
    $(p + "tx").oninput = () => NS.applyDupToUI(p, $(p + "rx").value, $(p + "tx").value);
    $(p + "encType").onchange = () => { NS.fillToneSelect($(p + "encIndex"), parseInt($(p + "encType").value), null); commitVfo(side); };
    $(p + "decType").onchange = () => { NS.fillToneSelect($(p + "decIndex"), parseInt($(p + "decType").value), null); commitVfo(side); };
    $(p + "rx").onchange = () => commitVfo(side);
    $(p + "tx").onchange = () => commitVfo(side);
    $(p + "encIndex").onchange = () => commitVfo(side);
    $(p + "decIndex").onchange = () => commitVfo(side);
    $(p + "power").onchange = () => commitVfo(side);
    $(p + "bw").onchange = () => commitVfo(side);
    $(p + "step").onchange = () => commitVfo(side);
  }
  $("btnVfoAClear").onclick = () => clearVfo("A");
  $("btnVfoBClear").onclick = () => clearVfo("B");
  $("btnVfoRead").onclick = async () => {
	  if (!state.session) return;
	  try {
		NS.setStatus("读取 VFO…", "busy");
		await state.session.readStart();                       // ← 关键：进入读会话
		const rawA = await state.session.readBlock(ADDR_VFO_A, CH_SIZE);
		const rawB = await state.session.readBlock(ADDR_VFO_B, CH_SIZE);
		state.vfoA = parseChannel48(rawA);
		state.vfoB = parseChannel48(rawB);
		state.vfoDirty = { A: false, B: false };
		renderVfoUI();

		if (state.keepSessionAfterRead) {
		  NS.log("VFO A/B 已读取（保持会话，跳过 Read Complete）", "info");
		  NS.setStatus("VFO 已读取", "ok");
		} else {
		  await state.session.readDone();                      // 结束读会话，设备会重启
		  NS.setStatus("设备重启中，正在自动重连…", "busy");
		  const ok = await state.conn.reconnect(15000);
		  if (ok) {
			state.session = new NS.RadioSession(state.conn);
			await state.session.handshake();
			NS.setStatus("VFO 已读取并自动重连", "ok");
			NS.log("VFO A/B 已读取，设备已自动重连", "info");
		  } else {
			NS.setStatus("VFO 已读取，但自动重连失败，请点击“连接 USB 串口”", "err");
			NS.log("VFO 已读取，设备已重启，自动重连失败。请点击顶部“连接 USB 串口”按钮，会优先复用已授权端口。", "err");
			if (NS.onDisconnected) NS.onDisconnected();
		  }
		}
	  } catch (e) {
		NS.setStatus("VFO 读取失败", "err");
		NS.log(`VFO 读取失败：${e.message}`, "err");
	  }
  };
  $("btnVfoWrite").onclick = () => NS.doWriteChannels(true);

  $("rpt_toneType").onchange = () => fillRptToneSelect();
  $("btnRptApply").onclick = rptApplyToVfo;
  $("btnRptClear").onclick = rptClear;
  $("btnRptSaveMem").onclick = () => {
    const rx = freqToInt($("rpt_rx").value);
    const tx = freqToInt($("rpt_tx").value);
    if (!rx || !tx) { NS.log("请先填写上下行频率", "err"); return; }
    const list = loadRptMem();
    list.unshift({
      rx, tx,
      toneType: parseInt($("rpt_toneType").value),
      toneValue: parseInt($("rpt_toneValue").value) || 0,
      savedAt: Date.now(),
    });
    if (list.length > 30) list.length = 30;
    saveRptMem(list);
    NS.log("已保存到本地记忆", "info");
  };
  $("btnRptClearMem").onclick = () => {
    if (!confirm("清空所有本地中继记忆？")) return;
    saveRptMem([]);
  };
}

NS.renderVfoUI = renderVfoUI;
NS.commitVfo = commitVfo;
NS.clearVfo = clearVfo;
NS.bindVfoEvents = bindVfoEvents;
NS.fillRptToneSelect = fillRptToneSelect;
NS.renderRptMem = renderRptMem;

})(window.UVL);