"use strict";
window.UVL = window.UVL || {};
(function(NS) {

NS.state = {
  conn: null,
  session: null,
  deviceInfo: null,
  readAllow: true,
  writeAllow: true,
  channels: [],
  vfoA: null,
  vfoB: null,
  vfoDirty: { A: false, B: false },
  editingIndex: -1,
  selected: new Set(),
  clipboard: null,
  verboseLog: true,
  retryCount: 1,
  blockSize: 64,
  logAutoScroll: true,
  keepSessionAfterRead: false,
  bleServiceUuid: "00000001-ba2a-46c9-ae49-01b0961f68bb",
  bleWriteCharUuid: "00000002-ba2a-46c9-ae49-01b0961f68bb",
  bleNotifyCharUuid: "00000003-ba2a-46c9-ae49-01b0961f68bb",
  bleUuidSuffix: "-ba2a-46c9-ae49-01b0961f68bb",
  _lastUsbVidPid: null,
};

})(window.UVL);