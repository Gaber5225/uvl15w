"use strict";
window.UVL = window.UVL || {};
(function(NS) {

function log(msg, cls = "") {
  const box = document.getElementById("logBox");
  if (!box) return;
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(line);
  if (NS.state.logAutoScroll) box.scrollTop = box.scrollHeight;
}

function setStatus(text, cls = "") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = text;
  el.className = "status " + cls;
}

function showProgress(pct) {
  const w = document.getElementById("progressWrap");
  const b = document.getElementById("progressBar");
  if (!w || !b) return;
  if (pct == null) { w.classList.remove("on"); b.style.width = "0%"; }
  else { w.classList.add("on"); b.style.width = Math.max(0, Math.min(100, pct)) + "%"; }
}

NS.log = log;
NS.setStatus = setStatus;
NS.showProgress = showProgress;

})(window.UVL);