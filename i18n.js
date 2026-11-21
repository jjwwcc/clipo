'use strict';
/* Clipo i18n — 中英双语。默认跟随浏览器语言，手动切换后记住选择。 */

const I18N = {
  zh: {
    pageTitle: 'Clipo 快剪 · 浏览器里的极简视频编辑',
    brandCn: '快剪', brandTag: 'WebCodecs · 本地处理',
    noFile: '未打开视频', openVideo: '打开视频', exportMp4: '导出 MP4', langSwitch: 'EN', langSwitchTitle: 'Switch to English',
    dzTitle: '拖入视频开始编辑', dzSub: '支持 MP4 / MOV（H.264 · HEVC · VP9 · AV1），全程本地处理，不上传', chooseFile: '选择文件',
    stageHint: '拖动画面平移 · 滚轮缩放 · 拖动字幕/水印改变位置 · 双击字幕编辑 · I / O 设置入点出点',
    playTitle: '播放/暂停 (空格)',
    setIn: '⇤ 入点', setInTitle: '把当前位置设为入点 (I)', setOut: '出点 ⇥', setOutTitle: '把当前位置设为出点 (O)', trimResetTitle: '清除裁剪',
    trimFull: '✂ 完整片段 · {d}', trimDragIn: '拖动设置入点', trimDragOut: '拖动设置出点',
    addCueHere: '＋ 在此处添加字幕', tlVideo: '画面', tlSubs: '字幕', cueTrackTitle: '双击空白处添加字幕',
    tabFrame: '画面', tabSub: '字幕', tabWm: '水印',
    aspect: '纵横比', ratioOrig: '原始', fit: '画面适配', fitContain: '完整显示', fitCover: '填满裁切',
    background: '背景', bgBlur: '模糊', bgColor: '纯色', zoom: '缩放', resetPos: '重置位置与缩放',
    resolution: '输出分辨率', resSrc: '原始', outSize: '输出 {W} × {H}', badgeOrig: '原始比例',
    addCue: '＋ 添加字幕', importSrt: '导入 SRT', exportSrt: '导出 SRT', style: '样式',
    fontSans: '黑体', fontSerif: '宋体', fontRound: '圆体', fontSize: '字号', textColor: '文字', stroke: '描边', box: '底框',
    position: '位置', posTop: '顶部', posMid: '居中', posBottom: '底部',
    cueEmpty: '还没有字幕<br/>点击「添加字幕」、在时间轴字幕轨双击，<br/>或导入 SRT 文件',
    cueEmptyText: '（空）', newCue: '新字幕', del: '删除', ghostSub: '双击添加字幕 · 拖动调整位置',
    wmEnable: '启用水印', wmText: '文字', wmImage: '图片', wmPlaceholder: '水印文字', color: '颜色',
    wmUpload: '点击上传 Logo（PNG 透明背景最佳）', wmChange: '点击更换图片', size: '大小', opacity: '不透明度', tile: '平铺（防盗）',
    defaultWm: '@Clipo 快剪',
    posNames: [['左上', '中上', '右上'], ['左中', '居中', '右中'], ['左下', '中下', '右下']],
    exporting: '正在导出…', preparing: '准备中…', cancel: '取消', close: '关闭', download: '下载 MP4',
    exportDone: '导出完成 ✓', exportFailed: '导出失败',
    progress: '{n} / {total} 帧 · {W}×{H} · {codec} · {speed}× 实时速度',
    doneInfo: '{W}×{H} · 时长 {dur} · {mb} MB · 用时 {secs}s', withAudio: ' · 含原音频',
    noAudio: '无音频',
    errNoWebCodecs: '当前浏览器不支持 WebCodecs，请使用最新版 Chrome / Edge',
    parsing: '正在解析视频…', parseFailed: '解析失败：{msg}', errNoVideoTrack: '文件中没有视频轨道',
    errUnparsable: '无法解析：请使用 MP4 / MOV 文件', errCantPlay: '浏览器无法播放此视频',
    warnCantDecode: '提示：当前浏览器无法解码 {codec}，可预览但无法导出', errCantDecode: '浏览器无法解码 {codec}',
    errEncoder: '当前设备不支持 {W}×{H} 的 H.264 编码', errEmptyTrim: '裁剪区间内没有画面',
    srtNone: '没有识别到字幕', srtImported: '已导入 {n} 条字幕', noCues: '还没有字幕',
  },
  en: {
    pageTitle: 'Clipo · Minimal video editor in your browser',
    brandCn: '', brandTag: 'WebCodecs · runs locally',
    noFile: 'No video open', openVideo: 'Open video', exportMp4: 'Export MP4', langSwitch: '中文', langSwitchTitle: '切换到中文',
    dzTitle: 'Drop a video to start editing', dzSub: 'MP4 / MOV (H.264 · HEVC · VP9 · AV1). Everything stays on your device — nothing is uploaded.', chooseFile: 'Choose file',
    stageHint: 'Drag to pan · Scroll to zoom · Drag subtitles / watermark to move · Double-click a subtitle to edit · I / O set in / out',
    playTitle: 'Play / Pause (Space)',
    setIn: '⇤ In', setInTitle: 'Set in-point at playhead (I)', setOut: 'Out ⇥', setOutTitle: 'Set out-point at playhead (O)', trimResetTitle: 'Clear trim',
    trimFull: '✂ Full clip · {d}', trimDragIn: 'Drag to set in-point', trimDragOut: 'Drag to set out-point',
    addCueHere: '＋ Add subtitle here', tlVideo: 'Video', tlSubs: 'Subs', cueTrackTitle: 'Double-click empty space to add a subtitle',
    tabFrame: 'Frame', tabSub: 'Subtitles', tabWm: 'Watermark',
    aspect: 'Aspect ratio', ratioOrig: 'Original', fit: 'Fit', fitContain: 'Fit whole', fitCover: 'Fill & crop',
    background: 'Background', bgBlur: 'Blur', bgColor: 'Solid', zoom: 'Zoom', resetPos: 'Reset position & zoom',
    resolution: 'Output resolution', resSrc: 'Source', outSize: 'Output {W} × {H}', badgeOrig: 'Original',
    addCue: '＋ Add subtitle', importSrt: 'Import SRT', exportSrt: 'Export SRT', style: 'Style',
    fontSans: 'Sans', fontSerif: 'Serif', fontRound: 'Rounded', fontSize: 'Font size', textColor: 'Text', stroke: 'Outline', box: 'Box',
    position: 'Position', posTop: 'Top', posMid: 'Middle', posBottom: 'Bottom',
    cueEmpty: 'No subtitles yet<br/>Click “Add subtitle”, double-click the subtitle track,<br/>or import an SRT file',
    cueEmptyText: '(empty)', newCue: 'New subtitle', del: 'Delete', ghostSub: 'Double-click to add · drag to move',
    wmEnable: 'Enable watermark', wmText: 'Text', wmImage: 'Image', wmPlaceholder: 'Watermark text', color: 'Color',
    wmUpload: 'Click to upload a logo (transparent PNG works best)', wmChange: 'Click to replace image', size: 'Size', opacity: 'Opacity', tile: 'Tile (anti-theft)',
    defaultWm: '@Clipo',
    posNames: [['Top left', 'Top center', 'Top right'], ['Middle left', 'Center', 'Middle right'], ['Bottom left', 'Bottom center', 'Bottom right']],
    exporting: 'Exporting…', preparing: 'Preparing…', cancel: 'Cancel', close: 'Close', download: 'Download MP4',
    exportDone: 'Export complete ✓', exportFailed: 'Export failed',
    progress: '{n} / {total} frames · {W}×{H} · {codec} · {speed}× realtime',
    doneInfo: '{W}×{H} · {dur} long · {mb} MB · took {secs}s', withAudio: ' · original audio kept',
    noAudio: 'no audio',
    errNoWebCodecs: 'This browser does not support WebCodecs. Please use the latest Chrome or Edge.',
    parsing: 'Reading video…', parseFailed: 'Could not read file: {msg}', errNoVideoTrack: 'The file has no video track',
    errUnparsable: 'Unsupported file — please use MP4 or MOV', errCantPlay: 'The browser cannot play this video',
    warnCantDecode: 'Note: this browser cannot decode {codec}. You can preview but not export.', errCantDecode: 'The browser cannot decode {codec}',
    errEncoder: 'This device cannot encode H.264 at {W}×{H}', errEmptyTrim: 'The trimmed range contains no frames',
    srtNone: 'No subtitles found in the file', srtImported: 'Imported {n} subtitles', noCues: 'No subtitles yet',
  },
};

const LANG_KEY = 'clipo.lang';
function detectLang() {
  try { const saved = localStorage.getItem(LANG_KEY); if (saved && I18N[saved]) return saved; } catch { /* storage unavailable */ }
  const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  for (const l of prefs) {
    const s = String(l).toLowerCase();
    if (s.startsWith('zh')) return 'zh';
    if (s.startsWith('en')) return 'en';
  }
  return 'en';
}
let LANG = detectLang();

/** tr('key', {vars}) → 当前语言文本 */
function tr(key, vars) {
  let s = I18N[LANG][key] ?? I18N.en[key] ?? key;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  return s;
}

/** 把静态 HTML 中带 data-i18n* 的元素翻译成当前语言 */
function applyI18n(root = document) {
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
  document.title = tr('pageTitle');
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = tr(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = tr(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = tr(el.dataset.i18nPh); });
}

function setLang(lang) {
  if (!I18N[lang]) return;
  LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  applyI18n();
  document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}

applyI18n();
