# TYT UVL-15W 网页写频工具

通过浏览器直接给 **TYT UVL-15W** 手持对讲机写频的纯前端工具。无需安装任何驱动或桌面软件，用 USB 串口或蓝牙（BLE 透传）连接设备，读写信道、VFO 与设备信息，支持 CSV / JSON 导入导出，并内置「附近中继」地图。

> 纯静态站点：HTML + CSS + 原生 JavaScript，无构建步骤、无后端。

## 功能一览

| 模块 | 说明 |
|---|---|
| **信道读写** | 128 个信道表格，单条 / 批量编辑、复制粘贴、上移下移、清空；支持 CSV 导入导出 |
| **频率模式 (VFO)** | 读写 VFO A / B 频率参数与临时中继快捷区（写入会同步 Temp A/B 镜像） |
| **附近中继** | 基于天地图显示全国中继台，支持定位、地图选点、半径筛选（10–300 km），一键填入 VFO A 或写入指定信道 |
| **设备信息** | 机型、版本、序列号读取；读频 / 写频密码校验（最多 8 字节 ASCII） |
| **通信日志** | 串口 / 蓝牙通信帧实时记录（可选完整十六进制帧） |
| **设置** | 帧日志开关、重试次数、读写块大小、保持会话；BLE 服务/特征 UUID；天地图 Token；本地配置存取 |

### 信道参数

每个信道 48 字节，可编辑：

- 接收 / 发射频率（MHz），自动推导差频模式与差频频率
- 信道名称（≤ 24 字节）
- 亚音：模拟 CTCSS / 数字 DTCS 编码与解码（含反向）
- 功率（低 / 中 / 高）、带宽（宽 / 窄）、仅接收、扫描标志、步进（2.5k–100k）

## 连接设备

两种连接方式，连接后自动握手（`0xE0`）：

1. **USB 串口** —— 使用 Web Serial API，波特率 **115200**。点击「连接 USB 串口」授权设备即可。
2. **蓝牙 (BLE)** —— 使用 Web Bluetooth API 连接 BLE 透传模块（如 ET25SE）。在「设置」中填写 Service / 写特征 / 通知特征 UUID（默认已填一组常见 UUID），连接时若精确匹配失败会自动按「同后缀优先 + 特征属性兜底」智能匹配，并把实际 UUID 写回设置页。

断线后支持自动重连（优先复用原端口 / 设备）。

## 运行方式

浏览器要求：**Chrome 或 Edge 89+ 桌面版**，且页面必须通过 **HTTPS 或 localhost** 打开（Web Serial / Web Bluetooth 的安全上下文限制）。

- 本地调试：在仓库目录下起一个静态服务器，例如 `python -m http.server 8000`，访问 `http://localhost:8000`
- 部署：将仓库作为静态站点托管到任意 HTTPS 空间即可

## 通信协议（简述）

设备帧格式（详见 `js/protocol.js`）：

```
FE EF EE | CMD | ESC(数据…) | ESC(LRC) | FD
```

- 帧头 `FE EF EE`，帧尾 `FD`，数据段经 `0x80` 偏移转义，LRC 纵向校验
- 命令字：`0xE0` 握手、`0xE1` 设备信息、`0xE2` 读起始、`0xE3` 写起始、`0xE4` 写数据、`0xE6` 读数据、`0xE5` 结束、`0xE7` 密码校验、`0xEE` 错误
- 关键地址：信道区 `0x8000` 起（128 × 48 B）、VFO A `0x13B80`、VFO B `0x13BB0`、扫描标志 `0x15080`

## 目录结构

```
index.html              # 单页应用入口与全部 UI 结构
css/style.css           # 设计系统（深色 Linear + 浅色 Vercel，详见 DESIGN.md）
js/
  protocol.js           # 帧编解码、信道解析、频率/亚音表
  connection.js         # Web Serial / Web Bluetooth 连接与重连
  session.js            # 握手、读写会话状态机
  state.js / log.js / modal.js
  ui-channel.js         # 信道表格与编辑面板
  ui-vfo.js             # VFO A/B 与临时中继
  ui-repeater-map.js    # 附近中继地图
  ui-device.js / ui-settings.js
  repeaters-csv.js      # 中继 CSV 解析
  main.js               # 入口与事件绑定
DESIGN.md               # UI 设计语言基线（权威来源）
repeaters.csv           # 中继示例数据
guardrail-ids.json      # DOM 元素 id / class 清单（防护用）
```

## 附近中继地图

「附近中继」页使用[天地图（Tianditu）](https://cloudcenter.tianditu.gov.cn/center/development/myApp)显示全国中继台位置，需免费申请「浏览器端」Token 并粘贴到「设置 → 天地图 Token」。

> 未填 Token 时地图不显示，但中继列表与「填入 VFO A / 写入信道」功能仍可用。

中继数据默认来自 `repeaters.csv`（含纬度、经度、下行/上行频率、亚音等字段），可按需替换。

## 配置与备份

- 配置可保存到浏览器 `localStorage`，或导出 / 导入 JSON 文件迁移
- 信道表支持 CSV 导入导出，便于批量编辑与备份

## 免责声明

本工具为第三方非官方写频工具，按「现状」提供。使用产生的任何设备损坏、频率违规或法律风险由使用者自行承担。请务必遵守所在地无线电管理规定，仅在合法授权的频段与功率下使用。
