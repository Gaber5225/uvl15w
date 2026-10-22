"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { sleep } = NS;

/* 常见 BLE 透传服务 UUID，连同用户配置的 Service 一起传入 optionalServices，
   提高 requestDevice 阶段的授权范围。 */
const BLE_COMMON_SERVICES = [
  "00000001-ba2a-46c9-ae49-01b0961f68bb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ffe5-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

class Connection {
  constructor() {
    this.kind = null;
    this.serialPort = null;
    this.serialWriter = null;
    this.serialReader = null;
    this.bleDevice = null;
    this.bleWriteChar = null;
    this.bleNotifyChar = null;
    this.bleServiceUuid = null;
    this.bleWriteCharUuid = null;
    this.bleNotifyCharUuid = null;
    this._bleNotifyHandler = null;
    this.rxQueue = [];
    this.closed = false;
    this._usbVidPid = NS.state._lastUsbVidPid || null;
  }

  /* ---------------- 串口 ---------------- */
  async connectSerial(preferExisting = false) {
    if (!("serial" in navigator))
      throw new Error("浏览器不支持 Web Serial（需 Chrome/Edge 桌面版，HTTPS 或 localhost）");

    let port = null;

    if (preferExisting) {
      try {
        const ports = await navigator.serial.getPorts();
        NS.log(`已授权串口数：${ports.length}`, "info");
        if (ports.length === 1) {
          port = ports[0];
          NS.log("复用已授权的唯一串口", "info");
        } else if (ports.length > 1 && this._usbVidPid) {
          port = ports.find(p => {
            const info = p.getInfo();
            return info.usbVendorId === this._usbVidPid.vid
                && info.usbProductId === this._usbVidPid.pid;
          });
          if (port) NS.log("复用已授权的匹配串口", "info");
        }
      } catch (e) {
        NS.log(`getPorts 失败：${e.message}`, "info");
      }
    }

    if (!port) port = await navigator.serial.requestPort();

    const info = port.getInfo();
    this._usbVidPid = { vid: info.usbVendorId, pid: info.usbProductId };
    NS.state._lastUsbVidPid = this._usbVidPid;

    await port.open({ baudRate: 115200 });
    this.kind = "serial";
    this.serialPort = port;
    this.serialWriter = port.writable.getWriter();
    this.closed = false;
    this._readLoopSerial();
    const vid = (info.usbVendorId  || 0).toString(16).padStart(4, "0");
    const pid = (info.usbProductId || 0).toString(16).padStart(4, "0");
    return `串口已连接 (VID=${vid} PID=${pid})`;
  }

  async _readLoopSerial() {
    try {
      this.serialReader = this.serialPort.readable.getReader();
    } catch (e) {
      if (!this.closed) NS.log(`串口 reader 获取失败：${e.message}`, "err");
      return;
    }
    try {
      while (true) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        if (value) this._pushBytes(value);
      }
    } catch (e) {
      if (!this.closed) NS.log(`串口读取异常：${e.message}`, "err");
    } finally {
      try { this.serialReader.releaseLock(); } catch (_) {}
    }
  }

  /* ---------------- 蓝牙 BLE ---------------- */
  async connectBle(serviceUuid, writeUuid, notifyUuid) {
    if (!navigator.bluetooth)
      throw new Error("浏览器不支持 Web Bluetooth（需 Chrome/Edge 桌面版，HTTPS 或 localhost）");

    const optionalServices = Array.from(new Set([serviceUuid, ...BLE_COMMON_SERVICES]));

    NS.log(`请求蓝牙设备… Service=${serviceUuid}`, "info");
    NS.log(`  写特征=${writeUuid}  通知特征=${notifyUuid}`, "info");

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });
    } catch (e) {
      if (e.name === "NotFoundError") {
        const err = new Error("CANCELLED");
        err.name = "NotFoundError";
        throw err;
      }
      throw e;
    }

    NS.log(`已选择设备：${device.name || "(未命名)"}  id=${device.id}`, "info");
    NS.setStatus("连接 GATT…", "busy");
    const server = await device.gatt.connect();

    /* 1. 优先按配置的 Service UUID 精确匹配 */
    let services = [];
    try {
      services = [await server.getPrimaryService(serviceUuid)];
      NS.log(`精确命中 Service ${serviceUuid}`, "info");
    } catch (_) {
      NS.log("配置的 Service UUID 不在设备上，遍历所有 GATT 服务并智能匹配…", "info");
      try {
        services = await server.getPrimaryServices();
      } catch (e) {
        throw new Error(
          "无法发现任何 GATT 服务（No Services found in device）。\n\n" +
          "原因：配置的 Service UUID 不在设备广播中，且设备未声明任何可授权的服务。\n\n" +
          "解决：\n" +
          "1) 在设置页填写 ET25SE 手册上的正确 Service UUID；\n" +
          "2) 或检查该模块是否为 BLE 透传（经典蓝牙 SPP 无法通过 Web Bluetooth 连接）。"
        );
      }
    }

    /* 2. 按"同后缀优先 → 特征属性兜底"的顺序选特征对 */
    const suffix = NS.state.bleUuidSuffix || "-ba2a-46c9-ae49-01b0961f68bb";
    const sameSuffix = (u) => typeof u === "string" && u.endsWith(suffix);

    /* 排序：同后缀服务放前面 */
    services.sort((a, b) => {
      const sa = sameSuffix(a.uuid) ? 0 : 1;
      const sb = sameSuffix(b.uuid) ? 0 : 1;
      return sa - sb;
    });

    let writeChar = null, notifyChar = null, foundSvc = null;
    const dump = [];
    for (const svc of services) {
      let chars = [];
      try { chars = await svc.getCharacteristics(); } catch (_) { continue; }
      const info = { svc: svc.uuid, chars: [] };

      /* 先按传入的 write/notify UUID 精确匹配 */
      for (const c of chars) {
        const w = !!(c.properties.write || c.properties.writeWithoutResponse);
        const n = !!(c.properties.notify || c.properties.indicate);
        info.chars.push({ uuid: c.uuid, write: w, notify: n });
        if (!writeChar && c.uuid === writeUuid) writeChar = c;
        if (!notifyChar && c.uuid === notifyUuid) notifyChar = c;
      }
      /* 再按属性兜底 */
      if (!writeChar) for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) { writeChar = c; break; }
      }
      if (!notifyChar) for (const c of chars) {
        if (c.properties.notify || c.properties.indicate) { notifyChar = c; break; }
      }
      dump.push(info);
      if (writeChar && notifyChar) { foundSvc = svc; break; }
    }

    /* 打印扫描到的服务与特征，便于定位 */
    NS.log(`共发现 ${services.length} 个服务：`, "info");
    for (const d of dump) {
      NS.log(`  服务 ${d.svc}${sameSuffix(d.svc) ? "（同后缀）" : ""}`, "info");
      for (const c of d.chars) {
        if (c.write || c.notify) {
          NS.log(`    特征 ${c.uuid}  write=${c.write} notify=${c.notify}`, "info");
        }
      }
    }

    if (!writeChar) throw new Error("未找到可写 BLE 特征。请检查 ET25SE 的 Service/Characteristic UUID，或确认它不是经典蓝牙 SPP。");
    if (!notifyChar) throw new Error("未找到可通知 BLE 特征（RX）。请确认透传模块支持 Notify/Indicate。");

    this.kind = "ble";
    this.bleDevice = device;
    this.bleWriteChar = writeChar;
    this.bleNotifyChar = notifyChar;
    this.bleServiceUuid = foundSvc ? foundSvc.uuid : serviceUuid;
    this.bleWriteCharUuid = writeChar.uuid;
    this.bleNotifyCharUuid = notifyChar.uuid;
    this.closed = false;

    this._bleNotifyHandler = (ev) => {
      const dv = ev.target.value;
      const arr = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      this._pushBytes(arr);
    };
    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", this._bleNotifyHandler);

    device.addEventListener("gattserverdisconnected", () => {
      if (!this.closed) {
        NS.log("BLE 连接断开", "err");
        NS.setStatus("蓝牙已断开", "err");
      }
    });

    /* 把实际使用的 UUID 写回设置页，方便下次直连 */
    NS.state.bleServiceUuid = this.bleServiceUuid;
    NS.state.bleWriteCharUuid = this.bleWriteCharUuid;
    NS.state.bleNotifyCharUuid = this.bleNotifyCharUuid;
    NS.syncBleSettingsToUI && NS.syncBleSettingsToUI();

    return `蓝牙已连接\n  服务 ${this.bleServiceUuid}\n  写   ${this.bleWriteCharUuid}\n  通知 ${this.bleNotifyCharUuid}`;
  }

  /* ---------------- 通用读写 ---------------- */
  async writeBytes(bytes) {
    if (this.kind === "serial") {
      await this.serialWriter.write(bytes);
    } else if (this.kind === "ble") {
      const CHUNK = 20;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        if (this.bleWriteChar.properties.writeWithoutResponse) {
          await this.bleWriteChar.writeValueWithoutResponse(chunk);
        } else {
          await this.bleWriteChar.writeValue(chunk);
        }
      }
    } else throw new Error("未连接");
  }

  _pushBytes(arr) {
    for (let i = 0; i < arr.length; i++) this.rxQueue.push(arr[i]);
  }

  async readFrame(timeoutMs) {
    const t0 = Date.now();
    while (true) {
      const f = this._extractFrame();
      if (f) return f;
      if (Date.now() - t0 > timeoutMs) throw new Error("等待响应超时");
      await sleep(15);
    }
  }

  _extractFrame() {
    const q = this.rxQueue;
    while (q.length >= 6) {
      let start = -1;
      for (let i = 0; i + 2 < q.length; i++) {
        if (q[i] === 0xfe && q[i+1] === 0xef && q[i+2] === 0xee) { start = i; break; }
      }
      if (start < 0) {
        if (q.length > 2) q.splice(0, q.length - 2);
        return null;
      }
      if (start > 0) q.splice(0, start);
      let end = -1;
      for (let j = 3; j < q.length; j++) {
        if (q[j] === 0xfd) { end = j; break; }
      }
      if (end < 0) return null;
      const raw = q.slice(0, end + 1);
      try {
        const frame = this._parseFrame(raw);
        q.splice(0, end + 1);
        return frame;
      } catch (e) {
        q.splice(0, 1);
      }
    }
    return null;
  }

  _parseFrame(raw) {
    const cmd = raw[3];
    const bodyEsc = raw.slice(4, raw.length - 1);
    const data = NS.unescData(bodyEsc);
    if (data.length < 1) throw new Error("帧数据过短");
    const lrcRaw = data[data.length - 1];
    const payload = data.slice(0, data.length - 1);
    if (NS.calcLRC(payload) !== lrcRaw) throw new Error("LRC 校验失败");
    return { cmd, payload: Uint8Array.from(payload), raw: Uint8Array.from(raw) };
  }

  /* ---------------- 关闭 / 重连 ---------------- */
  async close() {
    this.closed = true;
    if (this.kind === "serial") {
      try { await this.serialReader?.cancel(); } catch (_) {}
      try { this.serialWriter?.releaseLock(); } catch (_) {}
      try { await this.serialPort?.close(); } catch (_) {}
      this.serialPort = null;
      this.serialReader = null;
      this.serialWriter = null;
    } else if (this.kind === "ble") {
      try { await this.bleNotifyChar?.stopNotifications(); } catch (_) {}
      try { this.bleDevice?.gatt?.disconnect(); } catch (_) {}
      this.bleDevice = null;
      this.bleWriteChar = null;
      this.bleNotifyChar = null;
    }
    this.kind = null;
    this.rxQueue = [];
  }

  async _cleanupForReconnect() {
    this.closed = true;
    if (this.kind === "serial") {
      try { await this.serialReader?.cancel(); } catch (_) {}
      try { this.serialWriter?.releaseLock(); } catch (_) {}
      try { await this.serialPort?.close(); } catch (_) {}
      this.serialReader = null;
      this.serialWriter = null;
    } else if (this.kind === "ble") {
      try { await this.bleNotifyChar?.stopNotifications(); } catch (_) {}
      try { await this.bleDevice?.gatt?.disconnect(); } catch (_) {}
    }
    this.rxQueue = [];
  }

  async reconnect(maxWaitMs = 20000) {
    const kind = this.kind;
    const savedPort = this.serialPort;
    const savedVidPid = this._usbVidPid;
    const savedBleDevice = this.bleDevice;
    const savedSvcUuid = this.bleServiceUuid;
    const savedWriteUuid = this.bleWriteCharUuid;
    const savedNotifyUuid = this.bleNotifyCharUuid;
    const savedHandler = this._bleNotifyHandler;

    await this._cleanupForReconnect();

    const start = Date.now();
    let lastErr = null;
    let attempts = 0;

    while (Date.now() - start < maxWaitMs) {
      attempts++;
      await sleep(800);
      try {
        if (kind === "serial") {
          if (savedPort) {
            try {
              await savedPort.open({ baudRate: 115200 });
              this.serialPort = savedPort;
              this.serialWriter = savedPort.writable.getWriter();
              this.kind = "serial";
              this.closed = false;
              this.rxQueue = [];
              this._readLoopSerial();
              NS.log(`串口已自动重连（原端口，第 ${attempts} 次）`, "info");
              return true;
            } catch (e) { lastErr = e; }
          }
          try {
            const ports = await navigator.serial.getPorts();
            let candidate = null;
            if (ports.length === 1) candidate = ports[0];
            else if (savedVidPid) {
              candidate = ports.find(p => {
                const info = p.getInfo();
                return info.usbVendorId === savedVidPid.vid
                    && info.usbProductId === savedVidPid.pid;
              });
            }
            if (candidate && candidate !== savedPort) {
              try {
                await candidate.open({ baudRate: 115200 });
                this.serialPort = candidate;
                this.serialWriter = candidate.writable.getWriter();
                this.kind = "serial";
                this.closed = false;
                this.rxQueue = [];
                this._readLoopSerial();
                NS.log(`串口已自动重连（新端口，第 ${attempts} 次）`, "info");
                return true;
              } catch (e) { lastErr = e; }
            }
          } catch (e) { lastErr = e; }

        } else if (kind === "ble") {
          if (!savedBleDevice) return false;
          try {
            await savedBleDevice.gatt.connect();
            const service = await savedBleDevice.gatt.getPrimaryService(savedSvcUuid);
            this.bleWriteChar = await service.getCharacteristic(savedWriteUuid);
            this.bleNotifyChar = await service.getCharacteristic(savedNotifyUuid);
            this.bleDevice = savedBleDevice;
            this.bleServiceUuid = savedSvcUuid;
            this.bleWriteCharUuid = savedWriteUuid;
            this.bleNotifyCharUuid = savedNotifyUuid;
            this._bleNotifyHandler = savedHandler;
            await this.bleNotifyChar.startNotifications();
            this.bleNotifyChar.addEventListener("characteristicvaluechanged", savedHandler);
            this.kind = "ble";
            this.closed = false;
            this.rxQueue = [];
            NS.log(`蓝牙已自动重连（第 ${attempts} 次）`, "info");
            return true;
          } catch (e) { lastErr = e; }
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (lastErr) NS.log(`自动重连失败（尝试 ${attempts} 次），最后错误：${lastErr.message}`, "err");
    return false;
  }
}

NS.Connection = Connection;

})(window.UVL);