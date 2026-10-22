"use strict";
window.UVL = window.UVL || {};
(function(NS) {

let _confirmResolve = null;

function modalConfirm(title, body) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    document.getElementById("mConfirmTitle").textContent = title;
    document.getElementById("mConfirmBody").textContent = body;
    document.getElementById("modalConfirm").classList.add("on");
  });
}

function bindModalEvents() {
  document.getElementById("mConfirmOk").onclick = () => {
    document.getElementById("modalConfirm").classList.remove("on");
    if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
  };
  document.getElementById("mConfirmCancel").onclick = () => {
    document.getElementById("modalConfirm").classList.remove("on");
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  };
}

NS.modalConfirm = modalConfirm;
NS.bindModalEvents = bindModalEvents;

})(window.UVL);