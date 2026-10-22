"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { asciiFromU8, hex } = NS;
const state = NS.state;
const $ = (id) => document.getElementById(id);

function renderDeviceInfo() {
  const info = state.deviceInfo;
  if (!info) return;
  const model = asciiFromU8(info, 0, 7);
  const swVer = asciiFromU8(info, 12, 20);
  const hwVer = info.length >= 61 ? asciiFromU8(info, 52, 61) : "";
  const sn    = info.length >= 81 ? asciiFromU8(info, 61, 81) : "";
  const body = $("devInfoBody");
  body.innerHTML = "";
  const rows = [
    ["机型", model],
    ["软件版本", swVer],
    ["硬件版本", hwVer || "(N/A)"],
    ["序列号", sn || "(N/A)"],
    ["读保护", state.readAllow ? "允许" : "需要密码"],
    ["写保护", state.writeAllow ? "允许" : "需要密码"],
    ["信息长度", info.length + " 字节"],
    ["原始数据", hex(info)],
  ];
  for (const [k, v] of rows) {
    const div = document.createElement("div");
    div.className = "info-row";
    div.innerHTML = `<div class="info-label">${k}</div><div class="info-val">${v}</div>`;
    body.appendChild(div);
  }
  const bar = $("devBar");
  bar.classList.add("on");
  bar.textContent = `${model}  软件 ${swVer}${hwVer ? "  硬件 "+hwVer : ""}${sn ? "  SN "+sn : ""}  ${state.readAllow ? "" : " [读保护]"}${state.writeAllow ? "" : " [写保护]"}`;
}

function bindDeviceEvents() {
  $("btnDevRefresh").onclick = async () => {
    if (!state.session) return;
    try { await state.session.handshake(); NS.log("设备信息已刷新", "info"); }
    catch (e) { NS.log(`刷新失败：${e.message}`, "err"); }
  };
  $("btnPwdCheck").onclick = async () => {
    if (!state.session) return;
    const type = parseInt($("pwdType").value);
    const pwd = $("pwdValue").value;
    if (!pwd) { NS.log("请输入密码", "err"); return; }
    try {
      const result = await state.session.passwordCheck(type, pwd);
      $("pwdResult").textContent = `结果：${result}`;
      NS.log(`密码校验：${result}`, result.includes("Right") ? "info" : "err");
    } catch (e) {
      $("pwdResult").textContent = `错误：${e.message}`;
      NS.log(`密码校验失败：${e.message}`, "err");
    }
  };
}

NS.renderDeviceInfo = renderDeviceInfo;
NS.bindDeviceEvents = bindDeviceEvents;

})(window.UVL);