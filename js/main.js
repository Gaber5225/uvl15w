"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { Connection, RadioSession, state } = NS;
const $ = (id) => document.getElementById(id);

function onConnected() {
  $("btnSerial").disabled = true;
  $("btnBle").disabled = true;
  $("btnDisconnect").disabled = false;
  $("btnRead").disabled = false;
  $("btnChRead").disabled = false;
  $("btnVfoRead").disabled = false;
  $("btnDevRefresh").disabled = false;
  $("btnPwdCheck").disabled = false;
}
function enableAfterRead() {
  $("btnWriteAll").disabled = false;
  $("btnChWrite").disabled = false;
  $("btnVfoWrite").disabled = false;
}
function onDisconnected() {
  state.conn = null;
  state.session = null;
  $("btnSerial").disabled = false;
  $("btnBle").disabled = false;
  $("btnDisconnect").disabled = true;
  $("btnRead").disabled = true;
  $("btnChRead").disabled = true;
  $("btnChWrite").disabled = true;
  $("btnWriteAll").disabled = true;
  $("btnVfoRead").disabled = true;
  $("btnVfoWrite").disabled = true;
  $("btnDevRefresh").disabled = true;
  $("btnPwdCheck").disabled = true;
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      $("page-" + tab.dataset.tab).classList.add("active");
    };
  });
}

function bindMainEvents() {
  $("btnSerial").onclick = async () => {
    NS.setStatus("正在连接串口…");
    try {
      const c = new Connection();
      /* 关键：preferExisting=true，有已授权端口时不弹窗直接复用 */
      const msg = await c.connectSerial(true);
      NS.log(msg, "info");
      state.conn = c;
      state.session = new RadioSession(c);
      NS.setStatus("握手中…", "busy");
      await state.session.handshake();
      NS.setStatus("已连接", "ok");
      onConnected();
      enableAfterRead();
    } catch (e) {
      if (e.name === "NotFoundError" || /cancel/i.test(e.message || "")) {
        NS.log("已取消串口选择", "info");
        NS.setStatus("已取消");
        return;
      }
      NS.setStatus("串口连接失败", "err");
      NS.log(`串口连接失败：${e.message}`, "err");
      onDisconnected();
    }
  };

  $("btnBle").onclick = async () => {
    NS.setStatus("正在连接蓝牙…");
    try {
      const c = new Connection();
      const msg = await c.connectBle(state.bleServiceUuid, state.bleCharUuid);
      NS.log(msg, "info");
      state.conn = c;
      state.session = new RadioSession(c);
      NS.setStatus("握手中…", "busy");
      await state.session.handshake();
      NS.setStatus("已连接", "ok");
      onConnected();
      enableAfterRead();
    } catch (e) {
      if (e.name === "NotFoundError" || e.message === "CANCELLED") {
        NS.log("已取消蓝牙选择（或过滤条件未匹配到设备）", "info");
        NS.setStatus("已取消");
        return;
      }
      NS.setStatus("蓝牙连接失败", "err");
      NS.log(`蓝牙连接失败：${e.message}`, "err");
      onDisconnected();
    }
  };

  $("btnDisconnect").onclick = async () => {
    if (state.conn) await state.conn.close();
    onDisconnected();
    NS.setStatus("未连接");
    NS.log("已断开", "info");
  };

  $("btnRead").onclick = () => NS.doReadAll();
  $("btnChRead").onclick = () => NS.doReadAll();
  $("btnWriteAll").onclick = () => NS.doWriteChannels(true);
  $("btnChWrite").onclick = () => NS.doWriteChannels(false);

  $("btnLogClear").onclick = () => { $("logBox").innerHTML = ""; };
  $("btnLogScrollToggle").onclick = (e) => {
    state.logAutoScroll = !state.logAutoScroll;
    e.target.textContent = "自动滚动：" + (state.logAutoScroll ? "开" : "关");
  };

  NS.onDisconnected = onDisconnected;
  NS.enableAfterRead = enableAfterRead;
}

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  NS.bindModalEvents();
  NS.bindChannelEvents();
  NS.bindVfoEvents();
  NS.bindDeviceEvents();
  NS.bindSettingsEvents();
  if (NS.bindRepeaterMapEvents) NS.bindRepeaterMapEvents();
  bindMainEvents();

  NS.initChannels();
  NS.renderChannelTable();
  NS.renderVfoUI();
  NS.fillRptToneSelect();
  NS.renderRptMem();

  NS.log("工具已就绪。", "info");
  NS.log("提示：设备重启后若自动重连失败，请直接再次点击“连接 USB 串口”，会优先复用已授权端口，无需重选。", "info");
});

})(window.UVL);