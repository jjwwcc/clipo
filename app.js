'use strict';
/*
 * Clipo 快剪 — 极简所见即所得视频编辑（裁剪 / 字幕 / 水印 / 纵横比）
 * 预览与导出共用同一个 render()，因此预览即成品。
 *   预览：<video> 播放 → render() 到 canvas
 *   导出：mp4box 解封装 → VideoDecoder → render() → VideoEncoder → mp4-muxer（音频直通）
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

const FONTS = {
  sans: '"PingFang SC","Noto Sans SC","Microsoft YaHei","Helvetica Neue",sans-serif',
  serif: '"Songti SC","Noto Serif SC",STSong,SimSun,serif',
  round: '"Yuanti SC","Hiragino Maru Gothic ProN","Arial Rounded MT Bold",sans-serif',
};
const RATIOS = [
  { id: 'orig', label: null },  // 文案来自 i18n
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '4:5', label: '4:5' },
  { id: '21:9', label: '21:9' },
];

/* ------------------------------------------------------------------ state */
const S = {
  src: null,        // { name, url, w, h, duration }  w/h 为显示尺寸（已考虑旋转）
  demux: null,      // { vt, at, vs, as, vdesc, adesc, rot, fps }
  thumbs: [],       // [{ t, canvas }]
  trimIn: 0, trimOut: 0,   // 裁剪区间（秒）
  aspect: 'orig', res: '1080',
  fit: 'contain', bg: 'blur', bgColor: '#000000', zoom: 1, panX: 0, panY: 0,
  cues: [], selCue: null,
  sub: { size: 0.055, color: '#ffffff', stroke: true, strokeColor: '#000000', box: false, boxColor: '#000000', bold: true, font: 'sans', x: 0.5, y: 0.86 },
  wm: { on: true, type: 'text', text: tr('defaultWm'), img: null, color: '#ffffff', size: 0.04, opacity: 0.75, tile: false, x: 0.82, y: 0.08 },
  tab: 'frame',
};
let cueId = 1;
const get = (path) => path.split('.').reduce((o, k) => o[k], S);
const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], S)[last] = v; };

/* ------------------------------------------------------------------ dom */
const video = $('#video');
const canvas = $('#preview');
const ctx = canvas.getContext('2d');
const tlBody = $('#tlBody');
const cueTrack = $('#cueTrack');
const film = $('#film');

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
const fmt = (t) => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};
const parseTime = (str) => {
  str = String(str).trim().replace(',', '.');
  const p = str.split(':').map(Number);
  if (p.some(isNaN)) return NaN;
  return p.reduce((a, v) => a * 60 + v, 0);
};

/* ------------------------------------------------------------------ geometry */
function ratioOf() {
  if (S.aspect === 'orig') return [S.src.w, S.src.h];
  return S.aspect.split(':').map(Number);
}
function outSize() {
  if (!S.src) return { W: 1280, H: 720 };
  const [aw, ah] = ratioOf();
  const short = S.res === 'src' ? Math.min(S.src.w, S.src.h) : +S.res;
  let W, H;
  if (aw >= ah) { H = short; W = short * aw / ah; } else { W = short; H = short * ah / aw; }
  return { W: even(W), H: even(H) };
}
function placeVideo(W, H, sw, sh) {
  const base = S.fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
  const k = base * S.zoom, w = sw * k, h = sh * k;
  return { x: (W - w) / 2 + S.panX * W, y: (H - h) / 2 + S.panY * H, w, h };
}

/* ------------------------------------------------------------------ render (preview & export share this) */
const blurCanvas = document.createElement('canvas');
const blurCtx = blurCanvas.getContext('2d');

function wrapLines(c, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    // 按字符换行；英文单词尽量不拆
    const tokens = para.match(/[A-Za-z0-9'’\-.,!?;:]+\s*|\s+|./gu) || [''];
    for (const tk of tokens) {
      const test = line + tk;
      if (c.measureText(test.trimEnd()).width > maxW && line) { out.push(line.trimEnd()); line = tk.trimStart(); }
      else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

function activeCue(t) {
  for (const c of S.cues) if (t >= c.start && t < c.end) return c;
  return null;
}

/**
 * @param c   2D context
 * @param src 可绘制的画面源（video / VideoFrame / canvas）
 * @param ui  预览时传入 { hits, ghost, hover, guides }，导出时为 null
 */
function render(c, W, H, src, sw, sh, t, ui) {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.filter = 'none';

  // 1. 背景
  if (S.bg === 'blur' && src) {
    const bw = Math.max(16, Math.round(W / 14)), bh = Math.max(16, Math.round(H / 14));
    if (blurCanvas.width !== bw || blurCanvas.height !== bh) { blurCanvas.width = bw; blurCanvas.height = bh; }
    const k = Math.max(bw / sw, bh / sh) * 1.2;
    blurCtx.filter = 'blur(2.5px)';
    blurCtx.drawImage(src, (bw - sw * k) / 2, (bh - sh * k) / 2, sw * k, sh * k);
    blurCtx.filter = 'none';
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(blurCanvas, 0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, 0, W, H);
  } else {
    c.fillStyle = S.bgColor; c.fillRect(0, 0, W, H);
  }

  // 2. 主画面
  if (src) {
    const p = placeVideo(W, H, sw, sh);
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, p.x, p.y, p.w, p.h);
    if (ui) ui.hits.video = p;
  }

  const m = Math.min(W, H);

  // 3. 水印
  if (ui) ui.hits.wm = null;
  if (S.wm.on && (S.wm.type === 'text' ? S.wm.text.trim() : S.wm.img)) {
    c.save();
    c.globalAlpha = S.wm.opacity;
    let w, h, draw;
    if (S.wm.type === 'text') {
      const fs = S.wm.size * m;
      c.font = `600 ${fs}px ${FONTS.sans}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      w = c.measureText(S.wm.text).width; h = fs * 1.2;
      draw = (x, y) => {
        c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = fs * 0.15; c.shadowOffsetY = fs * 0.04;
        c.fillStyle = S.wm.color; c.fillText(S.wm.text, x, y);
      };
    } else {
      const img = S.wm.img;
      h = S.wm.size * m * 1.6; w = h * img.width / img.height;
      draw = (x, y) => c.drawImage(img, x - w / 2, y - h / 2, w, h);
    }
    if (S.wm.tile) {
      c.translate(W / 2, H / 2); c.rotate(-Math.PI / 6);
      const gx = w + m * 0.18, gy = h + m * 0.16, R = Math.hypot(W, H) / 2;
      let row = 0;
      for (let y = -R; y <= R; y += gy, row++) {
        for (let x = -R + (row % 2) * gx / 2; x <= R; x += gx) draw(x, y);
      }
    } else {
      const x = S.wm.x * W, y = S.wm.y * H;
      draw(x, y);
      if (ui) ui.hits.wm = { x: x - w / 2, y: y - h / 2, w, h };
    }
    c.restore();
  }

  // 4. 字幕
  if (ui) ui.hits.sub = null;
  const cue = activeCue(t);
  if (cue || (ui && ui.ghost)) {
    const text = cue ? cue.text : tr('ghostSub');
    const fs = S.sub.size * m;
    c.save();
    if (!cue) c.globalAlpha = 0.45;
    c.font = `${S.sub.bold ? 700 : 500} ${fs}px ${FONTS[S.sub.font]}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = wrapLines(c, text, W * 0.86);
    const lh = fs * 1.32, total = lh * lines.length;
    const cx = S.sub.x * W, cy = S.sub.y * H;
    const maxW = Math.max(...lines.map((l) => c.measureText(l).width), fs);
    const padX = fs * 0.45, padY = fs * 0.22;
    const box = { x: cx - maxW / 2 - padX, y: cy - total / 2 - padY, w: maxW + padX * 2, h: total + padY * 2 };
    if (S.sub.box) {
      c.fillStyle = hexA(S.sub.boxColor, 0.62);
      c.beginPath(); c.roundRect(box.x, box.y, box.w, box.h, fs * 0.25); c.fill();
    }
    lines.forEach((l, i) => {
      const y = cy - total / 2 + lh * (i + 0.5);
      if (S.sub.stroke) {
        c.lineJoin = 'round'; c.miterLimit = 2;
        c.lineWidth = fs * 0.16; c.strokeStyle = S.sub.strokeColor; c.strokeText(l, cx, y);
      } else if (!S.sub.box) {
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = fs * 0.2; c.shadowOffsetY = fs * 0.05;
      }
      c.fillStyle = S.sub.color; c.fillText(l, cx, y);
    });
    c.restore();
    if (ui) ui.hits.sub = { ...box, cue };
  }

  // 5. 仅预览：交互辅助线
  if (ui) {
    const lw = ui.px;
    c.lineWidth = lw * 1.5;
    const outline = (b, color, dash) => {
      if (!b) return;
      c.setLineDash(dash ? [lw * 6, lw * 4] : []);
      c.strokeStyle = color; c.strokeRect(b.x, b.y, b.w, b.h);
    };
    if (ui.hover === 'wm' || ui.drag === 'wm') outline(ui.hits.wm, '#22d3ee', ui.drag !== 'wm');
    if (ui.hover === 'sub' || ui.drag === 'sub') outline(ui.hits.sub, '#f59e0b', ui.drag !== 'sub');
    if (ui.drag === 'video' && ui.hits.video) outline(ui.hits.video, 'rgba(124,92,255,.9)', true);
    c.setLineDash([]);
    if (ui.guides) {
      c.strokeStyle = '#ff3d81'; c.lineWidth = lw;
      if (ui.guides.x) { c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); }
      if (ui.guides.y) { c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); }
    }
  }
  c.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

/* ------------------------------------------------------------------ demux (mp4box) */
async function demuxFile(file) {
  const buf = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    buf.fileStart = 0;
    const mp4 = MP4Box.createFile();
    const vs = [], as = [];
    let info;
    mp4.onError = (e) => reject(new Error(e));
    mp4.onReady = (i) => {
      info = i;
      const vt = i.videoTracks[0];
      if (!vt) return reject(new Error(tr('errNoVideoTrack')));
      mp4.setExtractionOptions(vt.id, 'v', { nbSamples: Infinity });
      const at = i.audioTracks[0];
      if (at) mp4.setExtractionOptions(at.id, 'a', { nbSamples: Infinity });
      mp4.start();
    };
    mp4.onSamples = (id, user, samples) => (user === 'v' ? vs : as).push(...samples);
    try {
      mp4.appendBuffer(buf);
      mp4.flush();
    } catch (e) { return reject(e); }
    if (!info) return reject(new Error(tr('errUnparsable')));

    try {
    const vt = info.videoTracks[0];
    const at = info.audioTracks[0];
    const vtrak = mp4.getTrackById(vt.id);
    let vdesc;
    for (const e of vtrak.mdia.minf.stbl.stsd.entries) {
      const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
      if (box) {
        const DS = MP4Box.DataStream || window.DataStream;
        const ds = new DS(undefined, 0, DS.BIG_ENDIAN);
        box.write(ds);
        vdesc = new Uint8Array(ds.buffer, 8);
        break;
      }
    }
    let adesc = null;
    if (at && at.codec.startsWith('mp4a')) {
      const e = mp4.getTrackById(at.id).mdia.minf.stbl.stsd.entries[0];
      adesc = e?.esds?.esd?.descs?.[0]?.descs?.[0]?.data || null;
    }
    // 编辑列表（elst）偏移：<video> 按呈现时间播放，这里把 cts 统一换算到同一时间轴
    const elstOff = (trak, fallback) => {
      const ents = trak?.edts?.elst?.entries || [];
      const e = ents.find((x) => x.media_time >= 0);
      return e ? e.media_time / trak.mdia.mdhd.timescale : fallback;
    };
    const vOff = elstOff(vtrak, vs.length ? Math.min(...vs.slice(0, 64).map((x) => x.cts)) / vs[0].timescale : 0);
    const aOff = at ? elstOff(mp4.getTrackById(at.id), 0) : 0;
    // 旋转：tkhd matrix
    const mtx = vt.matrix || [65536, 0, 0, 0, 65536, 0];
    let rot = Math.round(Math.atan2(mtx[1], mtx[0]) * 180 / Math.PI);
    rot = ((rot % 360) + 360) % 360;
    const dur = vs.length ? (vs[vs.length - 1].cts + vs[vs.length - 1].duration) / vs[0].timescale : vt.duration / vt.timescale;
    resolve({
      vt, at: at && at.codec.startsWith('mp4a') && adesc ? at : null,
      vs, as, vdesc, adesc, rot, vOff, aOff,
      fps: vs.length / Math.max(0.01, dur) || 30,
    });
    } catch (e) { reject(e); }
  });
}

function decoderConfig(D) {
  return { codec: D.vt.codec, codedWidth: D.vt.video.width, codedHeight: D.vt.video.height, description: D.vdesc };
}
const usec = (s, v) => Math.round(v * 1e6 / s.timescale);
function toChunk(s) {
  return new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: usec(s, s.cts), duration: usec(s, s.duration), data: s.data });
}

// 解码出的帧是未旋转的，按 tkhd 旋转后再交给 render()
const rotCanvas = document.createElement('canvas');
const rotCtx = rotCanvas.getContext('2d');
function frameSource(frame, rot) {
  const fw = frame.displayWidth, fh = frame.displayHeight;
  if (!rot) return { src: frame, w: fw, h: fh };
  const sw = rot % 180 ? fh : fw, sh = rot % 180 ? fw : fh;
  if (rotCanvas.width !== sw || rotCanvas.height !== sh) { rotCanvas.width = sw; rotCanvas.height = sh; }
  rotCtx.setTransform(1, 0, 0, 1, 0, 0);
  rotCtx.translate(sw / 2, sh / 2);
  rotCtx.rotate(rot * Math.PI / 180);
  rotCtx.drawImage(frame, -fw / 2, -fh / 2, fw, fh);
  return { src: rotCanvas, w: sw, h: sh };
}

/* ------------------------------------------------------------------ thumbnails（WebCodecs 解码关键帧） */
async function buildThumbs(D) {
  S.thumbs = [];
  const keys = D.vs.filter((s) => s.is_sync);
  const N = Math.min(keys.length, 40);
  const pick = [];
  for (let i = 0; i < N; i++) pick.push(keys[Math.floor(i * keys.length / N)]);
  const cfg = decoderConfig(D);
  if (!(await VideoDecoder.isConfigSupported(cfg)).supported) return;
  const TH = 80;
  const dec = new VideoDecoder({
    output: (f) => {
      const { src, w, h } = frameSource(f, D.rot);
      const cv = document.createElement('canvas');
      cv.height = TH; cv.width = Math.round(TH * w / h);
      cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
      S.thumbs.push({ t: f.timestamp / 1e6 - D.vOff, canvas: cv });
      f.close();
      drawFilm();
    },
    error: (e) => console.warn('thumb decode', e),
  });
  dec.configure(cfg);
  for (const s of pick) {
    dec.decode(toChunk(s));
    await dec.flush(); // 每个关键帧独立出图，保证顺序
  }
  dec.close();
}

function drawFilm() {
  const r = film.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  film.width = Math.max(1, r.width * dpr); film.height = Math.max(1, r.height * dpr);
  const c = film.getContext('2d');
  c.clearRect(0, 0, film.width, film.height);
  if (!S.src || !S.thumbs.length) return;
  const thumbs = [...S.thumbs].sort((a, b) => a.t - b.t);
  const h = film.height, ar = thumbs[0].canvas.width / thumbs[0].canvas.height;
  const w = h * ar, n = Math.ceil(film.width / w);
  for (let i = 0; i < n; i++) {
    const t = (i * w + w / 2) / film.width * S.src.duration;
    let best = thumbs[0];
    for (const th of thumbs) if (th.t <= t) best = th;
    c.drawImage(best.canvas, i * w, 0, w, h);
  }
  c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(0, 0, film.width, film.height);
}

/* ------------------------------------------------------------------ load */
async function loadFile(file) {
  if (!file) return;
  if (!('VideoEncoder' in window)) { toast(tr('errNoWebCodecs')); return; }
  toast(tr('parsing'));
  let D;
  try { D = await demuxFile(file); }
  catch (e) { console.error(e); toast(tr('parseFailed', { msg: e.message || e })); return; }

  if (S.src) URL.revokeObjectURL(S.src.url);
  const url = URL.createObjectURL(file);
  video.src = url;
  await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error(tr('errCantPlay'))); })
    .catch((e) => toast(e.message));
  S.src = { name: file.name, url, w: video.videoWidth, h: video.videoHeight, duration: video.duration };
  S.demux = D;
  S.thumbs = [];
  S.panX = S.panY = 0; S.zoom = 1;
  S.trimIn = 0; S.trimOut = S.src.duration;
  ['#setIn', '#setOut'].forEach((s) => ($(s).disabled = false));

  $('#dropzone').hidden = true;
  canvas.hidden = false;
  $('#sizeBadge').hidden = false;
  $('#stageHint').hidden = false;
  renderFileName();
  $('#exportBtn').disabled = false; $('#gifBtn').disabled = false;
  $('#addCueBtn').disabled = false;
  $('#addCueBtn2').disabled = false;
  $('#durTime').textContent = fmt(S.src.duration);
  syncAll();
  buildRuler();
  drawFilm();
  renderTrim();
  video.currentTime = 0.001;
  buildThumbs(D).catch((e) => console.warn(e));
  if (!(await VideoDecoder.isConfigSupported(decoderConfig(D))).supported)
    toast(tr('warnCantDecode', { codec: D.vt.codec }), 4000);
}

/* ------------------------------------------------------------------ preview loop */
const ui = { hits: {}, hover: null, drag: null, guides: null, ghost: false, px: 1 };
function layoutCanvas() {
  if (!S.src) return;
  const { W, H } = outSize();
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const st = $('#stage').getBoundingClientRect();
  const k = Math.min((st.width - 48) / W, (st.height - 56) / H);
  canvas.style.width = `${W * k}px`;
  canvas.style.height = `${H * k}px`;
  ui.px = 1 / k;
}
function frame() {
  requestAnimationFrame(frame);
  if (!S.src) return;
  const { W, H } = outSize();
  let t = video.currentTime;
  if (!video.paused && t >= S.trimOut - 0.01) { video.currentTime = t = S.trimIn; } // 区间内循环播放
  ui.ghost = S.tab === 'sub' && !activeCue(t);
  const ready = video.readyState >= 2;
  render(ctx, W, H, ready ? video : null, S.src.w, S.src.h, t, ui);
  $('#curTime').textContent = fmt(t);
  $('#playhead').style.left = `${t / S.src.duration * 100}%`;
  $('#playBtn').textContent = video.paused ? '▶' : '❚❚';
  // 高亮当前字幕
  const ac = activeCue(t);
  if (ac !== frame._ac) {
    frame._ac = ac;
    $$('.cue, .cue-item').forEach((el) => el.classList.toggle('active', ac && +el.dataset.id === ac.id));
  }
}
requestAnimationFrame(frame);
new ResizeObserver(() => { layoutCanvas(); buildRuler(); drawFilm(); renderCueTrack(); renderTrim(); }).observe($('#stage'));

/* ------------------------------------------------------------------ stage interaction */
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function hitTest(p) {
  if (inBox(p, ui.hits.sub)) return 'sub';
  if (inBox(p, ui.hits.wm)) return 'wm';
  return 'video';
}
canvas.addEventListener('pointermove', (e) => {
  if (ui.drag) return;
  const h = hitTest(canvasPoint(e));
  ui.hover = h;
  canvas.style.cursor = h === 'video' ? 'grab' : 'move';
});
canvas.addEventListener('pointerleave', () => { if (!ui.drag) ui.hover = null; });
canvas.addEventListener('pointerdown', (e) => {
  if (!S.src) return;
  canvas.setPointerCapture(e.pointerId);
  const p0 = canvasPoint(e), W = canvas.width, H = canvas.height;
  const what = hitTest(p0);
  ui.drag = what;
  canvas.style.cursor = what === 'video' ? 'grabbing' : 'move';
  const start = what === 'video' ? { x: S.panX, y: S.panY } : what === 'sub' ? { x: S.sub.x, y: S.sub.y } : { x: S.wm.x, y: S.wm.y };
  if (what === 'sub' && ui.hits.sub?.cue) selectCue(ui.hits.sub.cue, false);
  if (what === 'wm' && S.tab !== 'wm') switchTab('wm');
  const snap = 0.012;
  const move = (ev) => {
    const p = canvasPoint(ev);
    let nx = start.x + (p.x - p0.x) / W, ny = start.y + (p.y - p0.y) / H;
    const g = { x: false, y: false };
    if (what === 'video') {
      if (Math.abs(nx) < snap) { nx = 0; g.x = true; }
      if (Math.abs(ny) < snap) { ny = 0; g.y = true; }
      S.panX = nx; S.panY = ny;
    } else {
      nx = clamp(nx, 0, 1); ny = clamp(ny, 0, 1);
      if (Math.abs(nx - 0.5) < snap) { nx = 0.5; g.x = true; }
      if (Math.abs(ny - 0.5) < snap) { ny = 0.5; g.y = true; }
      const o = what === 'sub' ? S.sub : S.wm;
      o.x = nx; o.y = ny;
    }
    ui.guides = g.x || g.y ? g : null;
  };
  const up = () => {
    ui.drag = null; ui.guides = null;
    canvas.style.cursor = 'grab';
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
});
canvas.addEventListener('wheel', (e) => {
  if (!S.src) return;
  e.preventDefault();
  S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0015), 0.3, 3);
  syncFrameTab();
}, { passive: false });
canvas.addEventListener('dblclick', (e) => {
  const p = canvasPoint(e);
  if (!inBox(p, ui.hits.sub)) return;
  switchTab('sub');
  let cue = ui.hits.sub.cue;
  if (!cue) cue = addCue(video.currentTime);
  selectCue(cue, false);
  requestAnimationFrame(() => {
    const ta = $(`.cue-item[data-id="${cue.id}"] textarea`);
    if (ta) { ta.focus(); ta.select(); }
  });
});

/* ------------------------------------------------------------------ timeline */
function buildRuler() {
  const ruler = $('#ruler');
  ruler.innerHTML = '';
  if (!S.src) return;
  const d = S.src.duration, w = ruler.clientWidth || 1;
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = steps.find((s) => w / (d / s) >= 70) || 600;
  const minor = major / 5;
  let html = '';
  for (let t = 0; t <= d + 1e-6; t += minor) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    const left = (t / d * 100).toFixed(3);
    html += `<i class="${isMajor ? 'big' : ''}" style="left:${left}%"></i>`;
    if (isMajor) html += `<b style="left:${left}%">${fmt(t).replace(/\.0$/, '')}</b>`;
  }
  ruler.innerHTML = html;
}
function timeAt(e) {
  const r = tlBody.getBoundingClientRect();
  return clamp((e.clientX - r.left) / r.width, 0, 1) * S.src.duration;
}
tlBody.addEventListener('pointerdown', (e) => {
  if (!S.src || e.target.closest('.cue')) return;
  if (e.target === cueTrack && e.detail > 1) return; // 让 dblclick 生效
  tlBody.setPointerCapture(e.pointerId);
  const wasPlaying = !video.paused;
  video.pause();
  video.currentTime = timeAt(e);
  const move = (ev) => { video.currentTime = timeAt(ev); };
  const up = () => {
    tlBody.removeEventListener('pointermove', move);
    tlBody.removeEventListener('pointerup', up);
    if (wasPlaying) video.play();
  };
  tlBody.addEventListener('pointermove', move);
  tlBody.addEventListener('pointerup', up);
});
cueTrack.addEventListener('dblclick', (e) => {
  if (!S.src || e.target !== cueTrack) return;
  const cue = addCue(timeAt(e));
  switchTab('sub');
  requestAnimationFrame(() => $(`.cue-item[data-id="${cue.id}"] textarea`)?.focus());
});

function renderCueTrack() {
  cueTrack.innerHTML = '';
  if (!S.src) return;
  const d = S.src.duration;
  for (const c of S.cues) {
    const el = document.createElement('div');
    el.className = 'cue' + (S.selCue === c ? ' sel' : '');
    el.dataset.id = c.id;
    el.style.left = `${c.start / d * 100}%`;
    el.style.width = `${(c.end - c.start) / d * 100}%`;
    el.textContent = c.text || tr('cueEmptyText');
    el.title = `${fmt(c.start)} → ${fmt(c.end)}\n${c.text}`;
    el.addEventListener('pointerdown', (e) => cueDrag(e, c, el));
    cueTrack.appendChild(el);
  }
  frame._ac = undefined;
}
function cueDrag(e, c, el) {
  e.stopPropagation();
  selectCue(c, true);
  const r = el.getBoundingClientRect();
  const off = e.clientX - r.left;
  const mode = off < 7 ? 'l' : off > r.width - 7 ? 'r' : 'm';
  const tw = tlBody.getBoundingClientRect().width, d = S.src.duration;
  const st = c.start, en = c.end, x0 = e.clientX;
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dt = (ev.clientX - x0) / tw * d;
    if (mode === 'm') { const len = en - st; c.start = clamp(st + dt, 0, d - len); c.end = c.start + len; }
    else if (mode === 'l') c.start = clamp(st + dt, 0, c.end - 0.2);
    else c.end = clamp(en + dt, c.start + 0.2, d);
    el.style.left = `${c.start / d * 100}%`;
    el.style.width = `${(c.end - c.start) / d * 100}%`;
    video.currentTime = mode === 'r' ? c.end - 0.05 : c.start;
    const item = $(`.cue-item[data-id="${c.id}"]`);
    if (item) { item.querySelector('.st').value = fmt(c.start); item.querySelector('.en').value = fmt(c.end); }
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    sortCues(); renderCueList();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

/* ------------------------------------------------------------------ trim */
const MIN_CLIP = 0.2;
function isFullClip() { return !S.src || (S.trimIn <= 0.001 && S.trimOut >= S.src.duration - 0.001); }
function renderTrim() {
  if (!S.src) { $('#trimInfo').textContent = tr('trimFull', { d: fmt(0) }); return; }
  const d = S.src.duration, a = S.trimIn / d * 100, b = S.trimOut / d * 100;
  Object.assign($('#shadeL').style, { left: '0%', width: `${a}%` });
  Object.assign($('#shadeR').style, { left: `${b}%`, width: `${100 - b}%` });
  Object.assign($('#trimWin').style, { left: `${a}%`, width: `${b - a}%` });
  const full = isFullClip(), info = $('#trimInfo');
  info.textContent = full ? tr('trimFull', { d: fmt(d) }) : `✂ ${fmt(S.trimIn)} – ${fmt(S.trimOut)} · ${(S.trimOut - S.trimIn).toFixed(1)}s`;
  info.classList.toggle('cut', !full);
  $('#trimReset').disabled = full;
}
function setTrim(which, t) {
  if (!S.src) return;
  const d = S.src.duration;
  if (which === 'in') S.trimIn = clamp(t, 0, d - MIN_CLIP);
  else S.trimOut = clamp(t, MIN_CLIP, d);
  // 若越过另一端，则推动另一端
  if (S.trimOut - S.trimIn < MIN_CLIP) {
    if (which === 'in') S.trimOut = Math.min(d, S.trimIn + MIN_CLIP);
    else S.trimIn = Math.max(0, S.trimOut - MIN_CLIP);
  }
  renderTrim();
}
$$('.th').forEach((h) => h.addEventListener('pointerdown', (e) => {
  if (!S.src) return;
  e.stopPropagation();
  h.setPointerCapture(e.pointerId);
  video.pause();
  const which = h.dataset.h;
  const move = (ev) => {
    const d = S.src.duration, t = timeAt(ev);
    if (which === 'in') { S.trimIn = clamp(t, 0, S.trimOut - MIN_CLIP); video.currentTime = S.trimIn; }
    else { S.trimOut = clamp(t, S.trimIn + MIN_CLIP, d); video.currentTime = Math.max(S.trimIn, S.trimOut - 0.04); }
    renderTrim();
  };
  const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); };
  move(e);
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', up);
}));
$('#setIn').addEventListener('click', () => setTrim('in', video.currentTime));
$('#setOut').addEventListener('click', () => setTrim('out', video.currentTime));
$('#trimReset').addEventListener('click', () => { if (!S.src) return; S.trimIn = 0; S.trimOut = S.src.duration; renderTrim(); });

/* ------------------------------------------------------------------ cues */
function sortCues() { S.cues.sort((a, b) => a.start - b.start); }
function addCue(t, text = '') {
  const d = S.src.duration;
  t = clamp(t, 0, Math.max(0, d - 0.3));
  // 避开已有字幕：若当前在某条字幕中，就接在它后面
  const cur = activeCue(t);
  if (cur) t = cur.end;
  const next = S.cues.find((c) => c.start > t);
  const end = Math.min(t + 2.5, next ? next.start : d, d);
  const cue = { id: cueId++, start: t, end: Math.max(end, t + 0.3), text: text || tr('newCue') };
  S.cues.push(cue); sortCues();
  S.selCue = cue;
  renderCueList(); renderCueTrack();
  if (video.paused) video.currentTime = cue.start + 0.01;
  return cue;
}
function selectCue(c, seek) {
  S.selCue = c;
  $$('.cue').forEach((el) => el.classList.toggle('sel', +el.dataset.id === c.id));
  $$('.cue-item').forEach((el) => el.classList.toggle('sel', +el.dataset.id === c.id));
  const item = $(`.cue-item[data-id="${c.id}"]`);
  if (item) item.scrollIntoView({ block: 'nearest' });
  if (seek && video.paused) video.currentTime = c.start + 0.01;
}
function deleteCue(c) {
  S.cues = S.cues.filter((x) => x !== c);
  if (S.selCue === c) S.selCue = null;
  renderCueList(); renderCueTrack();
}
function renderCueList() {
  const list = $('#cueList');
  list.innerHTML = '';
  if (!S.cues.length) {
    list.innerHTML = `<div class="cue-empty">${tr('cueEmpty')}</div>`;
    return;
  }
  for (const c of S.cues) {
    const el = document.createElement('div');
    el.className = 'cue-item' + (S.selCue === c ? ' sel' : '');
    el.dataset.id = c.id;
    el.innerHTML = `<div class="cue-times"><input class="st" value="${fmt(c.start)}" /> → <input class="en" value="${fmt(c.end)}" /><button class="del" title="${tr('del')}">✕</button></div><textarea rows="1"></textarea>`;
    const ta = el.querySelector('textarea');
    ta.value = c.text;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    requestAnimationFrame(fit);
    ta.addEventListener('input', () => {
      c.text = ta.value; fit();
      const blk = $(`.cue[data-id="${c.id}"]`); if (blk) blk.textContent = c.text || tr('cueEmptyText');
    });
    ta.addEventListener('focus', () => { selectCue(c, false); if (video.paused && activeCue(video.currentTime) !== c) video.currentTime = c.start + 0.01; });
    const onTime = (inp, key) => inp.addEventListener('change', () => {
      const v = parseTime(inp.value);
      if (!isNaN(v)) {
        c[key] = clamp(v, 0, S.src.duration);
        if (c.end - c.start < 0.2) { if (key === 'start') c.end = Math.min(S.src.duration, c.start + 0.2); else c.start = Math.max(0, c.end - 0.2); }
      }
      sortCues(); renderCueList(); renderCueTrack();
    });
    onTime(el.querySelector('.st'), 'start');
    onTime(el.querySelector('.en'), 'end');
    el.querySelector('.del').addEventListener('click', () => deleteCue(c));
    el.addEventListener('pointerdown', (e) => { if (e.target.tagName !== 'BUTTON') selectCue(c, e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT'); });
    list.appendChild(el);
  }
  frame._ac = undefined;
}

function parseSRT(txt) {
  const out = [];
  txt.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/).forEach((b) => {
    const lines = b.trim().split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return;
    const [a, z] = lines[i].split('-->').map((s) => parseTime(s.trim().split(/\s+/)[0]));
    if (isNaN(a) || isNaN(z)) return;
    out.push({ id: cueId++, start: a, end: z, text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '') });
  });
  return out;
}
function toSRT() {
  const ts = (t) => {
    const ms = Math.round(t * 1000), h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return S.cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}

/* ------------------------------------------------------------------ panel bindings */
function switchTab(tab) {
  S.tab = tab;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-body').forEach((b) => (b.hidden = b.dataset.body !== tab));
}
$$('#tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// 纵横比卡片
const ratioGrid = $('#ratioGrid');
for (const r of RATIOS) {
  const b = document.createElement('button');
  b.className = 'ratio';
  b.dataset.v = r.id;
  b.innerHTML = `<span class="shape"></span><span ${r.label ? '' : 'data-i18n="ratioOrig"'}>${r.label ?? tr('ratioOrig')}</span>`;
  b.addEventListener('click', () => { S.aspect = r.id; S.panX = S.panY = 0; syncAll(); });
  ratioGrid.appendChild(b);
}
function syncRatioShapes() {
  for (const b of ratioGrid.children) {
    let [w, h] = b.dataset.v === 'orig' ? (S.src ? [S.src.w, S.src.h] : [16, 9]) : b.dataset.v.split(':').map(Number);
    const k = 26 / Math.max(w, h);
    const sh = b.querySelector('.shape');
    sh.style.width = `${w * k}px`; sh.style.height = `${h * k}px`;
    b.classList.toggle('active', S.aspect === b.dataset.v);
  }
}

// segmented controls
$$('.seg[data-bind]').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    set(seg.dataset.bind, b.dataset.v);
    syncAll();
  });
});
// toggles & switches
$$('[data-toggle]').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  set(b.dataset.toggle, !get(b.dataset.toggle));
  syncAll();
}));
// ranges / colors
const bindInput = (sel, path, ev = 'input', cast = Number) =>
  $(sel).addEventListener(ev, (e) => { set(path, cast(e.target.value)); syncAll(); });
bindInput('#zoom', 'zoom');
bindInput('#bgColor', 'bgColor', 'input', String);
bindInput('#subSize', 'sub.size');
bindInput('#subColor', 'sub.color', 'input', String);
bindInput('#subStrokeColor', 'sub.strokeColor', 'input', String);
bindInput('#subBoxColor', 'sub.boxColor', 'input', String);
bindInput('#wmSize', 'wm.size');
bindInput('#wmOp', 'wm.opacity');
bindInput('#wmColor', 'wm.color', 'input', String);
bindInput('#wmText', 'wm.text', 'input', String);
$('#bgColor').addEventListener('input', () => { S.bg = 'color'; syncAll(); });
$('#resetPos').addEventListener('click', () => { S.zoom = 1; S.panX = S.panY = 0; syncAll(); });
$$('#subPos button').forEach((b) => b.addEventListener('click', () => { S.sub.x = 0.5; S.sub.y = +b.dataset.y; }));

// 水印九宫格
const wmPos = $('#wmPos');
for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
  const b = document.createElement('button');
  b.dataset.pos = `${j},${i}`;
  b.addEventListener('click', () => wmPreset(i, j));
  wmPos.appendChild(b);
}
function wmPreset(i, j) {
  const W = canvas.width, H = canvas.height, h = ui.hits.wm;
  const wN = h ? h.w / W / 2 : 0.1, hN = h ? h.h / H / 2 : 0.03;
  const mg = 0.035 * Math.min(W, H);
  const mx = mg / W, my = mg / H;
  S.wm.x = [mx + wN, 0.5, 1 - mx - wN][i];
  S.wm.y = [my + hN, 0.5, 1 - my - hN][j];
  S.wm.tile = false;
  syncAll();
}
$('#wmImg').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  S.wm.img = await createImageBitmap(f);
  S.wm.type = 'image'; S.wm.on = true;
  const th = $('#wmThumb'); th.src = URL.createObjectURL(f); th.hidden = false;
  const up = $('#wmUploadTxt'); up.dataset.i18n = 'wmChange'; up.textContent = tr('wmChange');
  syncAll();
});

function syncFrameTab() {
  $('#zoom').value = S.zoom;
  $('#zoomVal').textContent = Math.round(S.zoom * 100) + '%';
}
function syncAll() {
  syncRatioShapes();
  $$('.seg[data-bind]').forEach((seg) => {
    const v = String(get(seg.dataset.bind));
    $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  });
  $$('[data-toggle]').forEach((b) => b.classList.toggle('on', !!get(b.dataset.toggle)));
  $$('[data-show]').forEach((el) => { const [k, v] = el.dataset.show.split('='); el.hidden = String(get(k)) !== v; });
  syncFrameTab();
  $('#bgColor').value = S.bgColor;
  $('#subSize').value = S.sub.size; $('#subSizeVal').textContent = Math.round(S.sub.size * 1000) / 10;
  $('#subColor').value = S.sub.color; $('#subStrokeColor').value = S.sub.strokeColor; $('#subBoxColor').value = S.sub.boxColor;
  $('#wmSize').value = S.wm.size; $('#wmSizeVal').textContent = Math.round(S.wm.size * 1000) / 10;
  $('#wmOp').value = S.wm.opacity; $('#wmOpVal').textContent = Math.round(S.wm.opacity * 100) + '%';
  $('#wmColor').value = S.wm.color;
  if (document.activeElement !== $('#wmText')) $('#wmText').value = S.wm.text;
  if (S.src) {
    const { W, H } = outSize();
    $('#outSize').textContent = tr('outSize', { W, H });
    $('#sizeBadge').textContent = `${S.aspect === 'orig' ? tr('badgeOrig') : S.aspect} · ${W}×${H}`;
    layoutCanvas();
  }
}

// 字幕按钮 & SRT
const onAdd = () => { if (!S.src) return; switchTab('sub'); const c = addCue(video.currentTime); requestAnimationFrame(() => { const ta = $(`.cue-item[data-id="${c.id}"] textarea`); ta?.focus(); ta?.select(); }); };
$('#addCueBtn').addEventListener('click', onAdd);
$('#addCueBtn2').addEventListener('click', onAdd);
$('#srtInput').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const cues = parseSRT(await f.text());
  if (!cues.length) return toast(tr('srtNone'));
  S.cues = cues; sortCues(); S.selCue = null;
  renderCueList(); renderCueTrack();
  toast(tr('srtImported', { n: cues.length }));
  e.target.value = '';
});
$('#exportSrt').addEventListener('click', () => {
  if (!S.cues.length) return toast(tr('noCues'));
  download(new Blob([toSRT()], { type: 'text/plain' }), (S.src?.name.replace(/\.\w+$/, '') || 'subtitles') + '.srt');
});
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// 播放
function togglePlay() {
  if (!S.src) return;
  if (!video.paused) return video.pause();
  if (video.currentTime < S.trimIn || video.currentTime >= S.trimOut - 0.05) video.currentTime = S.trimIn;
  video.play();
}
$('#playBtn').addEventListener('click', togglePlay);
window.addEventListener('keydown', (e) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) || !S.src) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'i' || e.key === 'I') setTrim('in', video.currentTime);
  else if (e.key === 'o' || e.key === 'O') setTrim('out', video.currentTime);
  else if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 1 : 1 / S.demux.fps));
  else if (e.key === 'ArrowRight') video.currentTime = Math.min(S.src.duration, video.currentTime + (e.shiftKey ? 1 : 1 / S.demux.fps));
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selCue) deleteCue(S.selCue);
});

// 打开文件 & 拖放
$('#fileInput').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
$('#fileInput2').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
const stage = $('#stage');
['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !e.relatedTarget) stage.classList.remove('over'); }));
document.addEventListener('drop', (e) => {
  const f = [...e.dataTransfer.files][0];
  if (!f) return;
  if (/\.(srt|vtt)$/i.test(f.name)) { $('#srtInput').files = e.dataTransfer.files; $('#srtInput').dispatchEvent(new Event('change')); }
  else if (/^image\//.test(f.type)) { $('#wmImg').files = e.dataTransfer.files; $('#wmImg').dispatchEvent(new Event('change')); switchTab('wm'); }
  else loadFile(f);
});

/* ------------------------------------------------------------------ export */
let exportJob = null;
$('#exportBtn').addEventListener('click', () => startExport());
$('#mCancel').addEventListener('click', () => {
  if (exportJob) exportJob.cancelled = true;
  closeModal();
});
function closeModal() {
  $('#modal').hidden = true;
  const v = $('#mVideo'); v.pause();
  if (v.src) { URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); }
  const im = $('#mImg');
  if (im.src) { URL.revokeObjectURL(im.src); im.removeAttribute('src'); }
}
/** 打开导出弹窗并重置为"进度"状态 */
function openModal(title) {
  $('#modal').hidden = false;
  $('#mCanvas').hidden = false; $('#mVideo').hidden = true; $('#mImg').hidden = true;
  $('#gifOpts').hidden = true; $('#mStart').hidden = true; $('#mDownload').hidden = true;
  $('#mTitle').textContent = title; $('#mCancel').textContent = tr('cancel');
  $('#mBar').style.width = '0%'; $('#mInfo').textContent = tr('preparing');
}

async function pickEncoderConfig(W, H, fps) {
  const bitrate = Math.round(clamp(W * H * fps * 0.12, 1.5e6, 20e6));
  const codecs = ['avc1.640034', 'avc1.640033', 'avc1.640028', 'avc1.4d0034', 'avc1.42e034', 'avc1.42e01f'];
  for (const codec of codecs) {
    const cfg = { codec, width: W, height: H, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* next */ }
  }
  throw new Error(tr('errEncoder', { W, H }));
}

async function startExport() {
  if (!S.src || exportJob) return;
  video.pause();
  const D = S.demux;
  const { W, H } = outSize();
  const job = (exportJob = { cancelled: false });
  const mCanvas = $('#mCanvas'), mVideo = $('#mVideo'), bar = $('#mBar'), info = $('#mInfo'), dl = $('#mDownload');
  openModal(tr('exporting'));
  dl.textContent = tr('download');
  mCanvas.width = W > H ? 480 : Math.round(300 * W / H); mCanvas.height = Math.round(mCanvas.width * H / W);
  const mctx = mCanvas.getContext('2d');

  const t0 = performance.now();
  let dec, enc;
  try {
    const dcfg = decoderConfig(D);
    if (!(await VideoDecoder.isConfigSupported(dcfg)).supported) throw new Error(tr('errCantDecode', { codec: D.vt.codec }));
    const fps = Math.round(D.fps) || 30;
    const ecfg = await pickEncoderConfig(W, H, fps);

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: fps },
      audio: D.at ? { codec: 'aac', numberOfChannels: D.at.audio.channel_count, sampleRate: D.at.audio.sample_rate } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    const oc = new OffscreenCanvas(W, H);
    const octx = oc.getContext('2d', { alpha: false });
    // 裁剪：只保留 [tIn, tOut) 内的帧，从前一个关键帧开始解码
    const tIn = S.trimIn, tOut = S.trimOut, eps = 1e-4;
    const inRange = (t) => t >= tIn - eps && t < tOut - eps;
    const keep = [];
    D.vs.forEach((s, i) => { if (inRange(s.cts / s.timescale - D.vOff)) keep.push(i); });
    if (!keep.length) throw new Error(tr('errEmptyTrim'));
    const total = keep.length;
    let first = keep[0];
    const last = keep[keep.length - 1];
    while (first > 0 && !D.vs[first].is_sync) first--;
    let encoded = 0, frameIdx = 0, err = null;
    const gop = fps * 2;

    enc = new VideoEncoder({
      output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta); encoded++; },
      error: (e) => (err = e),
    });
    enc.configure(ecfg);

    dec = new VideoDecoder({
      output: (frame) => {
        if (job.cancelled) { frame.close(); return; }
        const t = frame.timestamp / 1e6 - D.vOff; // 呈现时间（与预览 video.currentTime 一致）
        if (!inRange(t)) { frame.close(); return; } // 入点前的预解码帧 / 出点后的帧
        const { src, w, h } = frameSource(frame, D.rot);
        render(octx, W, H, src, w, h, t, null);
        const dur = frame.duration;
        frame.close();
        const vf = new VideoFrame(oc, { timestamp: Math.round((t - tIn) * 1e6), duration: dur || Math.round(1e6 / fps) });
        enc.encode(vf, { keyFrame: frameIdx % gop === 0 });
        vf.close();
        if (frameIdx % 4 === 0) mctx.drawImage(oc, 0, 0, mCanvas.width, mCanvas.height);
        frameIdx++;
      },
      error: (e) => (err = e),
    });
    dec.configure(dcfg);

    const tick = () => {
      const pct = encoded / total;
      bar.style.width = `${(pct * 100).toFixed(1)}%`;
      const el = (performance.now() - t0) / 1000;
      const speed = (encoded / fps) / Math.max(el, 0.01);
      info.textContent = tr('progress', { n: encoded, total, W, H, codec: ecfg.codec, speed: speed.toFixed(1) });
    };

    for (let i = first; i <= last; i++) {
      if (job.cancelled) throw new Error('cancelled');
      if (err) throw err;
      while (dec.decodeQueueSize > 12 || enc.encodeQueueSize > 12) {
        await new Promise((r) => setTimeout(r, 2));
        if (err) throw err;
      }
      dec.decode(toChunk(D.vs[i]));
      if (i % 10 === 0) tick();
    }
    await dec.flush();
    await enc.flush();
    if (err) throw err;
    if (job.cancelled) throw new Error('cancelled');
    tick();

    // 音频：AAC 直通，不重新编码
    if (D.at) {
      const meta = { decoderConfig: { codec: D.at.codec, numberOfChannels: D.at.audio.channel_count, sampleRate: D.at.audio.sample_rate, description: D.adesc } };
      const at = (s) => s.cts / s.timescale - D.aOff;
      D.as.filter((s) => inRange(at(s))).forEach((s, i) =>
        muxer.addAudioChunkRaw(s.data, 'key', Math.round((at(s) - tIn) * 1e6), usec(s, s.duration), i === 0 ? meta : undefined));
    }
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);

    $('#mTitle').textContent = tr('exportDone');
    bar.style.width = '100%';
    info.textContent = tr('doneInfo', { W, H, dur: fmt(tOut - tIn), mb: (blob.size / 1048576).toFixed(1), secs }) + (D.at ? tr('withAudio') : '');
    mCanvas.hidden = true; mVideo.hidden = false;
    mVideo.src = URL.createObjectURL(blob);
    dl.hidden = false;
    dl.href = mVideo.src;
    dl.download = S.src.name.replace(/\.\w+$/, '') + `_${S.aspect.replace(':', 'x')}_edited.mp4`;
    $('#mCancel').textContent = tr('close');
  } catch (e) {
    if (e.message !== 'cancelled') {
      console.error(e);
      $('#mTitle').textContent = tr('exportFailed');
      info.textContent = e.message || String(e);
      $('#mCancel').textContent = tr('close');
    }
  } finally {
    try { dec && dec.state !== 'closed' && dec.close(); } catch {}
    try { enc && enc.state !== 'closed' && enc.close(); } catch {}
    exportJob = null;
  }
}

/* ------------------------------------------------------------------ GIF */
// GIF 没有硬性时长上限，但每帧都是完整的 256 色图像，体积随 时长 × 帧率 × 尺寸 线性增长，
// 所以限制最长 GIF_MAX 秒（从入点算起），并让用户选尺寸 / 帧率。
const GIF_MAX = 20;
const GIF = { long: 480, fps: 15 };

function gifPlan() {
  const { W, H } = outSize();
  const k = GIF.long / Math.max(W, H);
  const gW = Math.max(2, Math.round(W * k / 2) * 2), gH = Math.max(2, Math.round(H * k / 2) * 2);
  const tIn = S.trimIn, full = S.trimOut - S.trimIn;
  const dur = Math.min(full, GIF_MAX);
  return { gW, gH, tIn, tEnd: tIn + dur, dur, full, n: Math.max(1, Math.round(dur * GIF.fps)) };
}
function renderGifOpts() {
  ['gifW', 'gifFps'].forEach((id) => {
    const v = id === 'gifW' ? GIF.long : GIF.fps;
    $(`#${id}`).querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.v === v));
  });
  const p = gifPlan();
  let html = tr('gifInfo', { W: p.gW, H: p.gH, dur: fmt(p.dur), n: p.n });
  if (p.full > GIF_MAX + 1e-3) html += '<br/>' + tr('gifTooLong', { max: GIF_MAX, dur: fmt(p.full) });
  $('#gifNote').innerHTML = html;
}
['gifW', 'gifFps'].forEach((id) => $(`#${id}`).addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (id === 'gifW') GIF.long = +b.dataset.v; else GIF.fps = +b.dataset.v;
  renderGifOpts();
}));

/** 第一步：弹窗显示 GIF 设置（尺寸 / 帧率 / 时长提示），预览当前帧 */
function openGifDialog() {
  if (!S.src || exportJob) return;
  video.pause();
  openModal(tr('gifTitle'));
  $('#gifOpts').hidden = false; $('#mStart').hidden = false;
  $('#mBar').style.width = '0%'; $('#mInfo').textContent = '';
  const { W, H } = outSize(), mc = $('#mCanvas');
  mc.width = W > H ? 480 : Math.round(300 * W / H); mc.height = Math.round(mc.width * H / W);
  mc.getContext('2d').drawImage($('#preview'), 0, 0, mc.width, mc.height);
  renderGifOpts();
}
$('#gifBtn').addEventListener('click', openGifDialog);
$('#mStart').addEventListener('click', () => startGif());
document.addEventListener('langchange', () => { if (!$('#gifOpts').hidden) renderGifOpts(); });

/** 第二步：WebCodecs 解码 → 与预览同一个 render() 合成 → 按目标帧率抽帧 → gifenc 量化编码 */
async function startGif() {
  if (!S.src || exportJob) return;
  const D = S.demux;
  const { gW, gH, tIn, tEnd, dur } = gifPlan();
  const fps = GIF.fps;
  const job = (exportJob = { cancelled: false });
  const mCanvas = $('#mCanvas'), mImg = $('#mImg'), bar = $('#mBar'), info = $('#mInfo'), dl = $('#mDownload');
  $('#gifOpts').hidden = true; $('#mStart').hidden = true;
  $('#mTitle').textContent = tr('exporting'); info.textContent = tr('preparing');
  const mctx = mCanvas.getContext('2d');

  const t0 = performance.now();
  let dec;
  try {
    const dcfg = decoderConfig(D);
    if (!(await VideoDecoder.isConfigSupported(dcfg)).supported) throw new Error(tr('errCantDecode', { codec: D.vt.codec }));
    const eps = 1e-4;
    const inRange = (t) => t >= tIn - eps && t < tEnd - eps;
    const keep = [];
    D.vs.forEach((s, i) => { if (inRange(s.cts / s.timescale - D.vOff)) keep.push(i); });
    if (!keep.length) throw new Error(tr('errEmptyTrim'));
    let first = keep[0];
    const last = keep[keep.length - 1];
    while (first > 0 && !D.vs[first].is_sync) first--;

    const total = Math.max(1, Math.round(dur * fps));
    const oc = new OffscreenCanvas(gW, gH);
    const octx = oc.getContext('2d', { alpha: false, willReadFrequently: true });
    const { GIFEncoder, quantize, applyPalette } = window.gifenc;
    const gif = GIFEncoder();
    // 每帧延时用"厘秒累计取整"计算，避免 15fps（6.67cs）这类帧率累积漂移
    const cs = (k) => Math.round(k * 100 / fps);
    let pending = null, written = 0, err = null;
    const flushPending = (kNext) => {
      if (!pending) return;
      const delay = Math.max(2, cs(kNext) - cs(pending.k)) * 10;
      gif.writeFrame(pending.index, gW, gH, { palette: pending.palette, delay, repeat: 0 });
      written++;
      pending = null;
    };

    dec = new VideoDecoder({
      output: (frame) => {
        if (job.cancelled || err) { frame.close(); return; }
        const t = frame.timestamp / 1e6 - D.vOff;
        // 第 k 个 GIF 帧对应时刻 tIn + k/fps；源帧更密时跳过，更稀时让上一帧延时变长
        const k = Math.max(0, Math.floor((t - tIn) * fps + 1e-3));
        if (!inRange(t) || k >= total || (pending && k <= pending.k)) { frame.close(); return; }
        try {
          const { src, w, h } = frameSource(frame, D.rot);
          render(octx, gW, gH, src, w, h, t, null);
          frame.close();
          const rgba = octx.getImageData(0, 0, gW, gH).data;
          const palette = quantize(rgba, 256);
          const index = applyPalette(rgba, palette);
          flushPending(k);
          pending = { k, index, palette };
          if (k % 3 === 0) mctx.drawImage(oc, 0, 0, mCanvas.width, mCanvas.height);
        } catch (e) { err = e; try { frame.close(); } catch {} }
      },
      error: (e) => (err = e),
    });
    dec.configure(dcfg);

    const tick = () => {
      const n = pending ? pending.k + 1 : written;
      bar.style.width = `${(Math.min(1, n / total) * 100).toFixed(1)}%`;
      info.textContent = tr('gifProgress', { n: Math.min(n, total), total, W: gW, H: gH, fps });
    };
    for (let i = first; i <= last; i++) {
      if (job.cancelled) throw new Error('cancelled');
      if (err) throw err;
      while (dec.decodeQueueSize > 6) {
        await new Promise((r) => setTimeout(r, 2));
        if (err) throw err;
      }
      dec.decode(toChunk(D.vs[i]));
      if (i % 4 === 0) { tick(); await new Promise((r) => setTimeout(r, 0)); }
    }
    await dec.flush();
    if (err) throw err;
    if (job.cancelled) throw new Error('cancelled');
    flushPending(total);
    if (!written) throw new Error(tr('errEmptyTrim'));
    gif.finish();
    const blob = new Blob([gif.bytes()], { type: 'image/gif' });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const mb = blob.size / 1048576;

    $('#mTitle').textContent = tr('exportDone');
    bar.style.width = '100%';
    info.textContent = tr('gifDone', { W: gW, H: gH, fps, dur: fmt(dur), mb: mb.toFixed(1), secs }) + (mb > 8 ? tr('gifBig') : '');
    mCanvas.hidden = true; mImg.hidden = false;
    mImg.src = URL.createObjectURL(blob);
    dl.hidden = false; dl.href = mImg.src; dl.textContent = tr('downloadGif');
    dl.download = S.src.name.replace(/\.\w+$/, '') + `_${gW}x${gH}.gif`;
    $('#mCancel').textContent = tr('close');
  } catch (e) {
    if (e.message !== 'cancelled') {
      console.error(e);
      $('#mTitle').textContent = tr('exportFailed');
      info.textContent = e.message || String(e);
      $('#mCancel').textContent = tr('close');
    }
  } finally {
    try { dec && dec.state !== 'closed' && dec.close(); } catch {}
    exportJob = null;
  }
}

/* ------------------------------------------------------------------ language */
function renderFileName() {
  const el = $('#fileName');
  if (!S.src) { el.textContent = tr('noFile'); return; }
  const D = S.demux;
  el.textContent = `${S.src.name} · ${S.src.w}×${S.src.h} · ${D.fps.toFixed(0)}fps · ${D.at ? 'AAC' : tr('noAudio')}`;
}
function relabelPosGrid() {
  $$('#wmPos button').forEach((b) => { const [j, i] = b.dataset.pos.split(',').map(Number); b.title = tr('posNames')[j][i]; });
}
$('#langBtn').addEventListener('click', () => setLang(LANG === 'zh' ? 'en' : 'zh'));
document.addEventListener('langchange', (e) => {
  // 用户没改过的默认水印文字，跟着语言切换
  const other = I18N[e.detail === 'zh' ? 'en' : 'zh'].defaultWm;
  if (S.wm.text === other) S.wm.text = tr('defaultWm');
  renderFileName(); relabelPosGrid(); renderCueList(); renderCueTrack(); renderTrim(); syncAll();
});

/* ------------------------------------------------------------------ init */
syncAll();
renderCueList();
renderFileName();
relabelPosGrid();
renderTrim();
if (!('VideoEncoder' in window)) toast(tr('errNoWebCodecs'), 6000);
