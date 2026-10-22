"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const { CMD, ADDR_START, ADDR_END, CH_SIZE,
        ADDR_USE_FLAG, ADDR_SCAN_FLAG,
        u32be, u16be, hex, buildFrame, sleep } = NS;

class RadioSession {
  constructor(conn) { this.conn = conn; }

  async sendAndWait(cmd, rawData, timeout = 3000, silent = false) {
    const frame = buildFrame(cmd, rawData);
    const state = NS.state;
    if (!silent) {
      if (state.verboseLog) NS.log(`TX [${hex(frame)}]`, "tx");
      else NS.log(`TX CMD 0x${cmd.toString(16).toUpperCase()} (${frame.length}B)`, "tx");
    }
    await this.conn.writeBytes(frame);

    let lastErr = null;
    for (let attempt = 0; attempt <= state.retryCount; attempt++) {
      try {
        const resp = await this.conn.readFrame(timeout);
        if (!silent) {
          if (state.verboseLog) NS.log(`RX [${hex(resp.raw)}]`, "rx");
          else NS.log(`RX CMD 0x${resp.cmd.toString(16).toUpperCase()} (${resp.payload.length}B)`, "rx");
        }
        return resp;
      } catch (e) {
        lastErr = e;
        if (attempt < state.retryCount) {
          NS.log(`超时，重发（${attempt + 1}/${state.retryCount}）`, "info");
          await this.conn.writeBytes(frame);
        }
      }
    }
    throw lastErr;
  }

  async handshake() {
    const model = new TextEncoder().encode("UVL-15W");
    const resp = await this.sendAndWait(CMD.HANDSHAKE, [...model], 3000, false);
    if (resp.cmd !== CMD.DEV_INFO) throw new Error(`握手失败 0x${resp.cmd.toString(16)}`);
    NS.state.deviceInfo = resp.payload;
    NS.state.readAllow = resp.payload[10] === 0x00;
    NS.state.writeAllow = resp.payload[11] === 0x00;
    if (NS.renderDeviceInfo) NS.renderDeviceInfo();
    return resp.payload;
  }

  async readStart() {
    const resp = await this.sendAndWait(CMD.READ_START, [...u32be(ADDR_START), ...u32be(ADDR_END)]);
    const txt = new TextDecoder().decode(resp.payload).trim();
    if (!txt.includes("READ START OK")) throw new Error(`读频开始失败：${txt}`);
    NS.log("READ START OK", "info");
  }

  async writeStart() {
    const resp = await this.sendAndWait(CMD.WRITE_START, [...u32be(ADDR_START), ...u32be(ADDR_END)]);
    const txt = new TextDecoder().decode(resp.payload).trim();
    if (!txt.includes("WRITE START OK")) throw new Error(`写频开始失败：${txt}`);
    NS.log("WRITE START OK", "info");
  }

  async readDone() {
    const t = new TextEncoder().encode("Read Complete");
    const resp = await this.sendAndWait(CMD.DONE, [...t]);
    NS.log(`读频完成：${new TextDecoder().decode(resp.payload)}`, "info");
  }

  async writeDone() {
    const t = new TextEncoder().encode("Write Complete");
    const resp = await this.sendAndWait(CMD.DONE, [...t]);
    NS.log(`写频完成：${new TextDecoder().decode(resp.payload)}`, "info");
  }

  async readBlock(addr, len, timeout = 5000) {
    const result = new Uint8Array(len);
    let off = 0;
    while (off < len) {
      const cl = Math.min(NS.state.blockSize, len - off);
      const resp = await this.sendAndWait(CMD.READ_DATA,
        [...u32be(addr + off), ...u16be(cl)], timeout, false);
      if (resp.cmd === CMD.ERROR)
        throw new Error(`读块错 @0x${(addr+off).toString(16)}：${new TextDecoder().decode(resp.payload)}`);
      if (resp.cmd !== CMD.WRITE_DATA)
        throw new Error(`读块 CMD 异常 0x${resp.cmd.toString(16)}`);
      if (resp.payload.length < 6 + cl)
        throw new Error(`读块数据不足 ${resp.payload.length} < ${6+cl}`);
      result.set(resp.payload.slice(6, 6 + cl), off);
      off += cl;
    }
    return result;
  }

  async writeBlock(addr, data, timeout = 5000) {
    let off = 0;
    while (off < data.length) {
      const cl = Math.min(NS.state.blockSize, data.length - off);
      const chunk = data.slice(off, off + cl);
      const resp = await this.sendAndWait(CMD.WRITE_DATA,
        [...u32be(addr + off), ...u16be(cl), ...chunk], timeout, false);
      if (resp.cmd === CMD.ERROR)
        throw new Error(`写块错 @0x${(addr+off).toString(16)}：${new TextDecoder().decode(resp.payload)}`);
      const txt = new TextDecoder().decode(resp.payload);
      if (!txt.includes("WF OK"))
        throw new Error(`写块未确认：${txt}`);
      off += cl;
    }
  }

  async readUseFlags128() {
    return await this.readBlock(ADDR_USE_FLAG, 16);
  }
  async readScanFlags128() {
    return await this.readBlock(ADDR_SCAN_FLAG, 32);
  }

  async writeUseFlags(changes) {
    const bytes = await this.readBlock(ADDR_USE_FLAG, 16);
    for (const c of changes) {
      const bi = Math.floor((c.index - 1) / 8);
      const bit = (c.index - 1) % 8;
      if (c.valid) bytes[bi] |= (1 << bit);
      else bytes[bi] &= ~(1 << bit);
    }
    await this.writeBlock(ADDR_USE_FLAG, bytes);
    return bytes;
  }

  async writeScanFlags(changes) {
    const bytes = await this.readBlock(ADDR_SCAN_FLAG, 32);
    for (const c of changes) {
      const bitPos = (c.index - 1) * 2;
      const bi = bitPos >> 3;
      const bit = bitPos & 7;
      bytes[bi] = (bytes[bi] & ~(0x03 << bit)) | ((c.scan & 0x03) << bit);
    }
    await this.writeBlock(ADDR_SCAN_FLAG, bytes);
    return bytes;
  }

  async passwordCheck(type, pwdStr) {
    const pwd = new TextEncoder().encode(pwdStr.slice(0, 8));
    const data = [type & 0x01];
    for (let i = 0; i < 8; i++) data.push(i < pwd.length ? pwd[i] : 0xff);
    const resp = await this.sendAndWait(CMD.PWD, data);
    return new TextDecoder().decode(resp.payload).trim();
  }
}

NS.RadioSession = RadioSession;

})(window.UVL);