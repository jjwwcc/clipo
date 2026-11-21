# Clipo 快剪

> 浏览器里的极简视频编辑器 · 所见即所得 · 视频不离开你的设备
> A minimal, WYSIWYG video editor that runs entirely in your browser. [English summary ↓](#english)

**在线使用：<https://clipo.ondarlin.com>**

Clipo 基于 [WebCodecs](https://developer.mozilla.org/docs/Web/API/WebCodecs_API) 直接调用浏览器内置的硬件编解码器，把常见的四件事做到最简单：

| 功能 | 说明 |
| --- | --- |
| ✂️ **裁剪（Trim）** | 时间轴上拖动黄色入点 / 出点手柄，或按 `I` / `O`；导出精确到帧 |
| 💬 **字幕** | 时间轴字幕轨可视化编辑（拖动、拉伸、双击新建），支持 SRT / VTT 导入与 SRT 导出 |
| 💧 **水印** | 文字或图片 Logo，透明度、大小、九宫格定位、自由拖动、平铺防盗模式 |
| 📐 **纵横比** | 原始 / 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 4:5 / 21:9，完整显示或填满裁切，模糊或纯色背景 |

此外：中英双语界面（自动跟随浏览器语言）、720p / 1080p / 原始分辨率输出、原音频无损直通、自动识别手机视频的旋转信息。

---

## 目录

- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [关键实现细节](#关键实现细节)
- [国际化](#国际化)
- [部署](#部署)
- [浏览器支持与限制](#浏览器支持与限制)
- [开发与测试](#开发与测试)
- [English](#english)

---

## 快速开始

项目是纯静态网页，**没有构建步骤、没有框架依赖**，两个第三方库已放在 `vendor/` 中。

```bash
git clone <repo-url> clipo && cd clipo
npm run dev          # 等同于 python3 -m http.server 8765
# 打开 http://localhost:8765
```

> WebCodecs 只在安全上下文（HTTPS 或 `localhost`）中可用，请勿通过局域网 IP 的 http 地址访问。

可选：生成测试视频（需要 `ffmpeg`）

```bash
npm run samples      # 生成 samples/landscape.mp4 与 samples/rotated.mp4
```

## 使用指南

### 基本流程

1. 把 MP4 / MOV 拖进页面（或点「打开视频」）。
2. 右侧面板依次调整 **画面 / 字幕 / 水印**，左侧预览实时反映最终效果。
3. 在时间轴上设置入点、出点（可选）。
4. 点「导出 MP4」，弹窗中实时显示正在编码的画面与速度，完成后可直接预览并下载。

### 预览区交互

| 操作 | 效果 |
| --- | --- |
| 拖动画面空白处 | 平移视频（靠近中心会吸附，并显示粉色参考线） |
| 鼠标滚轮 | 缩放视频（30% – 300%） |
| 拖动字幕 / 水印 | 改变位置（水平 / 垂直居中吸附） |
| 双击字幕 | 跳到右侧列表并选中文字，直接编辑；无字幕时双击占位框会新建一条 |

### 时间轴

| 操作 | 效果 |
| --- | --- |
| 点击 / 拖动标尺或缩略图 | 跳转播放位置 |
| 拖动黄色手柄 | 设置入点 / 出点，区间外变暗 |
| 拖动字幕块 | 整体移动；拖动左右边缘调整起止时间 |
| 双击字幕轨空白处 | 在该时间新建字幕 |

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `Space` | 播放 / 暂停（在裁剪区间内循环） |
| `I` / `O` | 把当前位置设为入点 / 出点 |
| `←` / `→` | 后退 / 前进一帧（按住 `Shift` 为 1 秒） |
| `Delete` / `Backspace` | 删除选中的字幕 |

拖放文件也有快捷方式：拖入 `.srt` / `.vtt` 直接导入字幕，拖入图片直接设为水印。

## 技术架构

核心原则：**预览和导出共用同一个 `render()` 函数**，因此预览就是成品。实测导出帧与同一时刻的预览帧逐像素对比，平均差异 < 1/255。

```
                        ┌──────────────────────────────────────────────┐
                        │  render(ctx, W, H, source, t, ui)            │
                        │  背景(模糊/纯色) → 视频 → 水印 → 字幕 → [UI 辅助线] │
                        └──────────────────────────────────────────────┘
                                 ▲                         ▲
  预览（实时）                    │                         │            导出（离线）
  <video> ──── requestAnimationFrame                       │
                                                            │
  File ─ mp4box.js 解封装 ─ VideoDecoder ─ 旋转校正 ─────────┘
                    │                                       │
                    │                          OffscreenCanvas → VideoFrame
                    │                                       │
                    │                                VideoEncoder (H.264)
                    │                                       │
                    └──── AAC 音频样本（直通，不重编码）──── mp4-muxer ──→ MP4 Blob
```

| 依赖 | 版本 | 用途 | 许可证 |
| --- | --- | --- | --- |
| [mp4box.js](https://github.com/gpac/mp4box.js) | 0.5.2 | MP4 / MOV 解封装，读取编码参数、样本、旋转矩阵、编辑列表 | BSD-3-Clause |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | 5.1.3 | 把编码后的视频块和原始音频块封装为 MP4（fast-start） | MIT |

两者都以 UMD 文件放在 `vendor/`，页面不依赖任何 CDN。

## 项目结构

```
.
├── index.html            # 页面结构；所有文案通过 data-i18n* 属性引用
├── styles.css            # 深色编辑器风格样式
├── i18n.js               # 中英文案字典、语言检测、tr() / applyI18n() / setLang()
├── app.js                # 全部逻辑（见下方分区）
├── vendor/
│   ├── mp4box.all.min.js
│   └── mp4-muxer.js
├── scripts/
│   └── make-samples.sh   # 用 ffmpeg 生成测试视频
├── cloudflare.config.ts  # Cloudflare Worker 配置（名称、自定义域名）
└── package.json          # dev / build / deploy / samples 脚本
```

`app.js` 按功能分区（文件内以 `/* ---- xxx */` 注释分隔）：

| 分区 | 内容 |
| --- | --- |
| state | 全局状态 `S`：源视频、裁剪区间、画面参数、字幕列表、字幕样式、水印参数 |
| geometry | `outSize()` 计算输出尺寸，`placeVideo()` 计算视频在画布中的位置 |
| render | 共用渲染函数：背景、视频、水印（单个 / 平铺）、字幕（自动换行、描边、底框）、交互辅助线 |
| demux | `demuxFile()`：解析轨道、提取样本、生成解码器 `description`、读取旋转与 elst 偏移 |
| thumbnails | 用 `VideoDecoder` 只解码关键帧生成时间轴缩略图 |
| load / preview loop | 打开文件、预览循环、区间循环播放 |
| stage interaction | 预览画布上的拖动、滚轮缩放、双击编辑、吸附参考线 |
| timeline / trim / cues | 标尺、跳转、裁剪手柄、字幕块拖动与列表编辑、SRT 解析与生成 |
| panel bindings | 右侧面板控件与状态双向同步（`syncAll()`） |
| export | 编码器选择、解码 → 渲染 → 编码流水线、背压控制、音频直通、封装下载 |
| language | 语言切换后的动态文案刷新 |

## 关键实现细节

**1. 所见即所得**
预览画布的像素尺寸就是输出尺寸（如 1080×1920），只是用 CSS 缩小显示。所有位置和大小都以相对值保存（字号 = 比例 × 短边，位置 = 0–1 归一化坐标），因此切换分辨率或纵横比时布局保持一致。

**2. 旋转视频**
手机拍摄的视频通常把画面横着存储，再用 `tkhd` 矩阵标记旋转。`<video>` 会自动旋转，而 `VideoDecoder` 输出的是未旋转的原始帧。`frameSource()` 根据矩阵角度先把帧画到一个旋转后的中间画布，再交给 `render()`，保证预览与导出一致。

**3. 编辑列表（elst）时间偏移**
含 B 帧的 H.264 文件常用编辑列表把第一帧的 `cts`（例如 2 帧的偏移）对齐到 0；AAC 也有约 1024 个采样的前置延迟。`<video>` 按呈现时间播放，而 mp4box 给出的是原始 `cts`。如果不处理，导出画面会比预览早 2 帧，字幕也会错位。`demuxFile()` 读取每条轨道的 `elst.media_time` 作为偏移（视频没有 elst 时退回到最小 `cts`），所有时间统一换算到呈现时间轴。

**4. 帧精确裁剪**
只编码呈现时间落在 `[入点, 出点)` 内的帧。由于解码必须从关键帧开始，解码器会从入点之前最近的关键帧开始喂数据，入点之前的帧解码后直接丢弃。输出时间戳整体减去入点；音频按同样规则筛选并平移。

**5. 背压控制**
解码和编码都是异步队列。送入下一个样本前检查 `decodeQueueSize` / `encodeQueueSize`，任一超过 12 就等待，避免长视频把内存占满。

**6. 编码器选择**
依次尝试 `avc1.640034`（High 5.2）→ `640033` → `640028` → Main → Baseline，用 `VideoEncoder.isConfigSupported()` 选出设备支持的第一个。码率按 `宽 × 高 × 帧率 × 0.12` 估算，限制在 1.5–20 Mbps；每 2 秒一个关键帧。

**7. 音频直通**
AAC 音频样本直接从源文件复制进新 MP4，不解码也不重编码，因此没有音质损失，速度也快。其他音频编码（如 Opus、AC-3）当前不会保留。

**8. 时间轴缩略图**
不用 `<video>` 逐个 seek 截图，而是用 `VideoDecoder` 只解码约 40 个关键帧，几乎瞬间完成。

## 国际化

- 所有文案集中在 `i18n.js` 的 `I18N.zh` / `I18N.en` 字典中。
- 静态 HTML 用属性引用：`data-i18n`（文本）、`data-i18n-html`、`data-i18n-title`（提示）、`data-i18n-ph`（占位符）。
- JS 中用 `tr('key', { 变量 })` 取文案，例如 `tr('srtImported', { n: 3 })`。（函数名特意不用 `t`，因为 `t` 在代码里常作为时间变量，会把翻译函数遮蔽掉。）
- **语言选择顺序**：用户手动选择（存于 `localStorage` 的 `clipo.lang`）→ 浏览器 `navigator.languages` 中第一个 `zh*` / `en*` → 默认英文。
- 切换语言时派发 `langchange` 事件，`app.js` 刷新动态文案。用户没改过的默认水印文字也会跟着切换。

**新增一种语言**：复制 `I18N.en` 为新键（如 `ja`）并翻译，在 `detectLang()` 中加入匹配规则，再调整顶栏切换按钮的逻辑即可。

## 部署

当前部署在 Cloudflare Workers（纯静态资源，没有服务端代码），自定义域名 `clipo.ondarlin.com` 写在 `cloudflare.config.ts` 中：

```ts
export default defineConfig({
  worker: {
    name: "clipo",
    compatibilityDate: "2026-11-20",
    domains: ["clipo.ondarlin.com"],
  },
});
```

```bash
npm install          # 安装 cf CLI（devDependency）
npx cf auth login    # 首次需要登录
npm run deploy       # = npm run build（复制站点文件到 dist/）+ cf deploy ./dist
```

说明：

- `npm run build` 只复制 `index.html`、`i18n.js`、`app.js`、`styles.css`、`vendor/` 到 `dist/`，不会上传测试视频等无关文件。**新增站点文件时记得同步修改 build 脚本。**
- 因为配置中没有写 `workersDev`，`*.workers.dev` 子域名是关闭的，只能通过自定义域名访问。需要的话可在配置中加上 `workersDev: true`。
- `cf` 1.0.0-rc.2 要求 Node ≥ 22.23。在较旧的 22.x 上会出现 `EBADENGINE` 警告但仍可用，部署失败时请先升级 Node。

也可以部署到任何静态托管（GitHub Pages、Netlify、Vercel、Nginx…），只要通过 HTTPS 提供 `dist/` 目录即可。

## 浏览器支持与限制

| 浏览器 | 状态 |
| --- | --- |
| Chrome / Edge 99+（桌面） | ✅ 推荐，已完整测试 |
| Safari 17+ | ⚠️ WebCodecs 可用，未全面测试 |
| Firefox 130+ | ⚠️ WebCodecs 可用，未全面测试 |

当前限制：

- 输入仅支持 **MP4 / MOV**（WebM、MKV 等容器暂不支持）；视频解码能力取决于浏览器和硬件，例如部分设备无法解码 HEVC，这时可以预览但无法导出。
- 输出固定为 **H.264 + AAC 的 MP4**；非 AAC 音频不会保留。
- 整个文件会读进内存，适合几分钟到几十分钟的视频，超大文件可能内存不足。
- 暂不支持：多段拼接、撤销 / 重做、字幕动画、变速、滤镜。

## 开发与测试

- 没有构建工具：修改文件后刷新浏览器即可。
- 调试时，`app.js` 中的全局函数可以在控制台直接调用，例如：

  ```js
  const blob = await fetch('/samples/landscape.mp4').then(r => r.blob());
  await loadFile(new File([blob], 'landscape.mp4'));
  setTrim('in', 1.5); setTrim('out', 5);
  startExport();
  ```

- **一致性检查**：导出后把结果视频某一时刻的帧和预览中同一时刻的 `render()` 结果做逐像素对比。平均差异应小于 2/255（仅有编码损失）；如果明显偏大，通常是时间轴或旋转出了问题。
- 发布前建议用 `npm run samples` 生成的两个样例分别验证：横屏带音频（裁剪 + 9:16）、带旋转元数据（1:1）。

---

## English

**Clipo** is a minimal, what-you-see-is-what-you-get video editor that runs entirely in the browser using **WebCodecs**. Videos never leave your device.

**Features**

- **Trim:** drag in / out handles on the timeline or press `I` / `O`; the cut is frame-accurate.
- **Subtitles:** edit them visually on a timeline track (drag, resize, double-click to add), import SRT / VTT, export SRT. Style options: font, size, colour, outline, background box.
- **Watermark:** text or image logo with opacity and size, 3×3 position presets, free dragging, and a tiled anti-theft mode.
- **Aspect ratio:** Original, 16:9, 9:16, 1:1, 4:3, 3:4, 4:5 or 21:9. Fit the whole picture or fill and crop, on a blurred or solid background, with pan and zoom.
- **Also:** 720p / 1080p / source-resolution output, lossless AAC audio passthrough, automatic handling of phone rotation metadata, and a Chinese / English UI that follows the browser language and can be switched manually.

**Run locally:** `npm run dev`, then open <http://localhost:8765>. There's no build step. The page must be served over HTTPS or `localhost`, because WebCodecs only works in a secure context.

**How it works:** preview and export share a single `render()` function. The preview draws from a `<video>` element. Export runs mp4box.js (demux) → `VideoDecoder` → rotation fix → `render()` on an `OffscreenCanvas` → `VideoEncoder` (H.264) → mp4-muxer, with the AAC audio samples copied through. Timestamps are normalised to presentation time using each track's edit list (`elst`). A trim starts decoding from the keyframe before the in-point and drops the frames before it.

**Deploy:** `npm run deploy`, which builds `dist/` and runs `cf deploy ./dist` to Cloudflare Workers. The custom domain is configured in `cloudflare.config.ts`.

**Limitations:**
- Input must be MP4 or MOV.
- Output is always H.264 + AAC MP4; audio in other formats is dropped.
- The whole file is loaded into memory.
- No multi-clip editing and no undo yet.

Third-party code: mp4box.js (BSD-3-Clause) and mp4-muxer (MIT), both included in `vendor/`.
