"use strict";
window.UVL = window.UVL || {};
(function(NS) {

const CMD = {
  HANDSHAKE: 0xE0, DEV_INFO: 0xE1,
  READ_START: 0xE2, WRITE_START: 0xE3,
  WRITE_DATA: 0xE4, READ_DATA: 0xE6,
  DONE: 0xE5, PWD: 0xE7, ERROR: 0xEE,
};

const ADDR_START = 0x00008000;
const ADDR_END   = 0x00021000;
const CH_SIZE = 48;
const CH_COUNT = 128;
const ADDR_VFO_A = 0x00013B80;
const ADDR_VFO_B = 0x00013BB0;
const ADDR_TEMP_A = 0x00013C40;
const ADDR_TEMP_B = 0x00013C70;
const ADDR_USE_FLAG = 0x00015000;
const ADDR_SCAN_FLAG = 0x00015080;
const ADDR_ZONE_MAP = 0x0001A000;

const CTCSS_ARRAY = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5,
  94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
  131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9,
  171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
  203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1
];
const DTCS_ARRAY = [
  "023","025","026","031","032","036","043","047","051","053","054","065","071","072","073","074",
  "114","115","116","122","125","131","132","134","143","145","152","155","156","162","165","172",
  "174","205","212","223","225","226","243","244","245","246","251","252","255","261","263","265",
  "266","271","274","306","311","315","325","331","332","343","346","351","356","364","365","371",
  "411","412","413","423","431","432","445","446","452","454","455","462","464","465","466","503",
  "506","516","523","526","532","546","565","606","612","624","627","631","632","654","662","664",
  "703","712","723","731","732","734","743","754"
];

function escByte(b) {
  const t = (b + 0x80) & 0xff;
  if (t > 0xf9) return [0xff, t & 0x0f];
  return [t];
}
function escData(arr) {
  const out = [];
  for (const b of arr) out.push(...escByte(b));
  return out;
}
function unescData(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    if (arr[i] === 0xff) {
      if (i + 1 >= arr.length) throw new Error("转义不完整");
      out.push((0xf0 + arr[i + 1] + 0x80) & 0xff);
      i += 2;
    } else {
      out.push((arr[i] + 0x80) & 0xff);
      i++;
    }
  }
  return out;
}
function calcLRC(arr) {
  let s = 0;
  for (const b of arr) s = (s + b) & 0xff;
  return (0x100 - s) & 0xff;
}
function buildFrame(cmd, rawData) {
  return new Uint8Array([
    0xfe, 0xfe, 0xfe, 0xee, 0xef, cmd,
    ...escData(rawData),
    ...escByte(calcLRC(rawData)),
    0xfd
  ]);
}
function u32be(n) { return [(n>>>24)&0xff, (n>>>16)&0xff, (n>>>8)&0xff, n&0xff]; }
function u16be(n) { return [(n>>>8)&0xff, n&0xff]; }
function readU32BE(b, o) { return ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0; }
function freqToInt(s) {
  const v = String(s).trim().replace(/[^0-9.]/g, "");
  if (!v) return 0;
  return Math.round(parseFloat(v) * 1e6);
}
function intToFreq(n) {
  if (!n) return "";
  return (n / 1e6).toFixed(4).replace(/\.?0+$/, "");
}
function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2,"0").toUpperCase()).join(" ");
}
function asciiFromU8(u8, start, end) {
  let s = "";
  for (let i = start; i < end && i < u8.length; i++) {
    const c = u8[i];
    if (c >= 0x20 && c <= 0x7e) s += String.fromCharCode(c);
    else if (c === 0) break;
  }
  return s.trim();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseChannel48(b) {
  if (b.length !== 48) throw new Error("48B 长度错误");
  const b36 = b[0x24], b37 = b[0x25], b38 = b[0x26], b39 = b[0x27];
  return {
    rx: readU32BE(b, 0),
    tx: readU32BE(b, 4),
    name: new TextDecoder().decode(b.slice(8, 32)).replace(/\0/g,"").trim(),
    dupFreq: readU32BE(b, 0x20),
    dupMode: b36 & 0x03,
    offsetDir: (b36 >> 2) & 0x03,
    step: (b36 >> 4) & 0x0f,
    channelMode: b37 & 0x07,
    power: (b37 >> 3) & 0x03,
    rxOnly: (b37 >> 5) & 0x01,
    busyLock: (b37 >> 6) & 0x03,
    squelchType: (b38 >> 2) & 0x07,
    encType: (b38 >> 5) & 0x07,
    decType: b39 & 0x07,
    dtcsPolarity: (b39 >> 3) & 0x03,
    compander: (b39 >> 5) & 0x03,
    encIndex: b[0x28],
    decIndex: b[0x29],
    signalingType: b[0x2a] & 0x07,
    signalingIndex: b[0x2b],
    scramble: b[0x2c],
    pttId: b[0x2d] & 0x0f,
    aprsRx: b[0x2e] & 0x03,
    _raw: Uint8Array.from(b),
  };
}

function emptyChannel48() {
  return new Uint8Array(48).fill(0xff);
}

function buildChannel48(ch) {
  const b = new Uint8Array(48);
  b.set(u32be(ch.rx & 0xffffffff), 0);
  b.set(u32be(ch.tx & 0xffffffff), 4);
  b.set(new TextEncoder().encode(ch.name || "").slice(0, 24), 8);
  b.set(u32be(ch.dupFreq || 0), 0x20);
  b[0x24] = (ch.dupMode & 0x03) | ((ch.offsetDir & 0x03) << 2) | ((ch.step & 0x0f) << 4);
  b[0x25] = (ch.channelMode & 0x07) | ((ch.power & 0x03) << 3) | ((ch.rxOnly & 0x01) << 5) | ((ch.busyLock & 0x03) << 6);
  b[0x26] = ((ch.squelchType & 0x07) << 2) | ((ch.encType & 0x07) << 5);
  b[0x27] = (ch.decType & 0x07) | ((ch.dtcsPolarity & 0x03) << 3) | ((ch.compander & 0x03) << 5);
  b[0x28] = ch.encIndex & 0xff;
  b[0x29] = ch.decIndex & 0xff;
  b[0x2a] = ch.signalingType & 0x07;
  b[0x2b] = ch.signalingIndex & 0xff;
  b[0x2c] = ch.scramble & 0xff;
  b[0x2d] = ch.pttId & 0x0f;
  b[0x2e] = ch.aprsRx & 0x03;
  if (ch._raw && ch._raw.length === 48) b[0x2f] = ch._raw[0x2f];
  return b;
}

function isEmptyChannel(ch) {
  if (!ch) return true;
  return !ch.rx && !ch.tx;
}

function bandOf(hz) {
  if (!hz) return "none";
  const mhz = hz / 1e6;
  if (mhz >= 136 && mhz <= 174) return "VHF";
  if (mhz >= 400 && mhz <= 520) return "UHF";
  return "other";
}

function deriveDup(rxIn, txIn) {
  let rx = rxIn || 0, tx = txIn || 0;
  if (!rx && !tx) return { rx:0, tx:0, dupMode:0, dupFreq:0 };
  if (!rx) rx = tx;
  if (!tx) tx = rx;
  if (rx === tx) return { rx, tx, dupMode:0, dupFreq:0 };
  const diff = Math.abs(tx - rx);
  const bx = bandOf(rx), bt = bandOf(tx);
  const crossBand = (bx !== bt) || bx === "other" || bt === "other";
  if (crossBand) return { rx, tx, dupMode:3, dupFreq:diff };
  return { rx, tx, dupMode: (tx < rx) ? 1 : 2, dupFreq:diff };
}

Object.assign(NS, {
  CMD, ADDR_START, ADDR_END, CH_SIZE, CH_COUNT,
  ADDR_VFO_A, ADDR_VFO_B, ADDR_TEMP_A, ADDR_TEMP_B,
  ADDR_USE_FLAG, ADDR_SCAN_FLAG, ADDR_ZONE_MAP,
  CTCSS_ARRAY, DTCS_ARRAY,
  escByte, escData, unescData, calcLRC, buildFrame,
  u32be, u16be, readU32BE, freqToInt, intToFreq, hex, asciiFromU8, sleep,
  parseChannel48, emptyChannel48, buildChannel48, isEmptyChannel,
  bandOf, deriveDup,
});

})(window.UVL);