/* Bézier Inspector — CEP panel logic (v3, live)
 * No in-panel preview. Changes are applied to a live overlay layer on the
 * Illustrator artboard in real time (debounced); the layer is replaced on
 * every update until you Finalize it.
 */
(function () {
  "use strict";

  var cs = new CSInterface();
  var EPS = 0.01;

  var S = {
    sourceMode: "selection",
    font: null, upm: 1000, fontName: "",
    metricFont: null, metricFontName: "",
    text: "Hello", sizePt: 200, trackPt: 0, kern: true,
    features: { liga: true, kern: true, calt: false, dlig: false, ss01: false, ss02: false, salt: false, smcp: false },
    anchorShape: "square", anchorColor: "#ff7a00", anchorSize: 9,
    anchorOutlineColor: "#000000", anchorOutlineW: 0, anchorEmoji: "🙂",
    handleShape: "circle", handleColor: "#888888", handleSize: 6,
    handleOutlineColor: "#000000", handleOutlineW: 0, handleEmoji: "🙂",
    lineColor: "#888888", lineW: 0.75,
    metricColor: "#ff7a00", metricW: 0.75, metricLabelSize: 14,
    metricsOn: { baseline: true, xheight: true, cap: true, ascent: true, descent: true },
    metricsSupported: { baseline: true, xheight: false, cap: false, ascent: false, descent: false },
    sbOn: true, sbKernRect: true, sbColor: "#2255cc",
    gFill: "#d8d8d8", gFillOn: false, gStrokeOn: true, gStroke: "#D8D8D8", gStrokeW: 1,
    out: { glyph: false, anchors: true, handles: true, lines: true, metrics: true, sb: true }
  };
  var FEATURE_LIST = ["liga", "calt", "dlig", "ss01", "ss02", "salt", "smcp", "kern"];

  var _live = true, _liveTimer = null, _selReady = false, _fontGeo = null, _bbH = 300;
  var _selMetricLines = null, _selMetricSource = "", _selGeo = null;
  var _fontFiles = null, _fontMatchCache = {};

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  // ── live scheduling ──
  function liveReady() { return S.sourceMode === "selection" ? _selReady : !!S.font; }
  function scheduleLive() {
    if (!_live || !liveReady()) return;
    if (_liveTimer) clearTimeout(_liveTimer);
    _liveTimer = setTimeout(doLiveDraw, 220);
  }
  function doLiveDraw() {
    if (S.sourceMode === "selection") drawSelection();
    else { _fontGeo = buildFontGeometry(); updateFontReadout(); drawFont(); }
  }

  // ── mode ──
  function setMode(mode) {
    S.sourceMode = mode;
    document.body.className = "mode-" + mode;
    if ($("tab-sel")) $("tab-sel").classList.toggle("on", mode === "selection");
    if ($("tab-font")) $("tab-font").classList.toggle("on", mode === "font");
    if (mode === "selection") { S.out.glyph = false; if ($("o-glyph")) $("o-glyph").checked = false; S.out.sb = false; }
    else { S.out.glyph = false; if ($("o-glyph")) $("o-glyph").checked = false; S.out.sb = true; }
    syncMetricChipState();
    if (mode === "font" && S.font) { doLiveDraw(); }
    queueSplitHeights();
  }

  function initSections() {
    var heads = document.querySelectorAll(".sec-h");
    for (var i = 0; i < heads.length; i++) heads[i].addEventListener("click", function () {
      var sec = this.parentNode;
      sec.setAttribute("data-open", sec.getAttribute("data-open") === "true" ? "false" : "true");
      queueSplitHeights();
    });
  }
  function initFeatureChips() {
    var box = $("ot-feats"); if (!box) return;
    FEATURE_LIST.forEach(function (f) {
      var b = document.createElement("button");
      b.textContent = f; b.className = S.features[f] ? "on" : "";
      b.addEventListener("click", function () { S.features[f] = !S.features[f]; b.className = S.features[f] ? "on" : ""; scheduleLive(); });
      box.appendChild(b);
    });
  }
  function initMetricChips() {
    var btns = $("metric-chips").querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", function () {
      if (this.disabled) return;
      var m = this.getAttribute("data-m");
      S.metricsOn[m] = !S.metricsOn[m]; this.classList.toggle("on", S.metricsOn[m]); scheduleLive();
    });
  }
  function syncMetricChipState() {
    var btns = $("metric-chips").querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var m = btns[i].getAttribute("data-m"), sup = S.sourceMode === "selection" ? true : S.metricsSupported[m];
      btns[i].disabled = !sup;
      if (!sup) { S.metricsOn[m] = false; btns[i].classList.remove("on"); }
    }
  }
  function bindInput(id, fn) { var el = $(id); if (!el) return; el.addEventListener("input", function () { fn(el.value); scheduleLive(); }); }
  function bindCheck(id, fn) { var el = $(id); if (!el) return; el.addEventListener("change", function () { fn(el.checked); scheduleLive(); }); }

  function normHex(v) { v = String(v).trim(); if (v[0] !== "#") v = "#" + v; return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null; }
  function bindColorHex(colId, hexId, fn) {
    var col = $(colId), hex = $(hexId); if (!col) return;
    col.addEventListener("input", function () { var v = col.value.toUpperCase(); if (hex) hex.value = v; fn(v); scheduleLive(); });
    if (hex) hex.addEventListener("input", function () { var n = normHex(hex.value); if (n) { col.value = n; fn(n); scheduleLive(); } });
  }
  function bindRange(rangeId, valId, fn) {
    var r = $(rangeId), v = $(valId); if (!r) return;
    r.addEventListener("input", function () { if (v) v.textContent = r.value; fn(r.value); scheduleLive(); });
  }
  function bindEmoji(id, fn) { var el = $(id); if (!el) return; el.addEventListener("input", function () { fn(el.value || "🙂"); scheduleLive(); }); }

  function bindShapeRow(rowId, key, emojiRowId) {
    var btns = $(rowId).querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", function () {
      for (var j = 0; j < btns.length; j++) btns[j].classList.remove("on");
      this.classList.add("on"); S[key] = this.getAttribute("data-sh");
      if (emojiRowId) $(emojiRowId).classList.toggle("show", S[key] === "emoji");
      scheduleLive();
    });
  }
  function syncSplitHeights() {
    var split = $("split-grid");
    if (!split) return;
    var secs = split.querySelectorAll(".sec[data-match]");
    for (var i = 0; i < secs.length; i++) secs[i].style.minHeight = "";
    if (window.innerWidth <= 320) return;
    var groups = {};
    for (var j = 0; j < secs.length; j++) {
      var sec = secs[j];
      if (window.getComputedStyle(sec).display === "none") continue;
      var key = sec.getAttribute("data-match") || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push(sec);
    }
    for (var k in groups) {
      if (!groups.hasOwnProperty(k)) continue;
      var items = groups[k], h = 0;
      for (var a = 0; a < items.length; a++) {
        items[a].style.minHeight = "";
        h = Math.max(h, items[a].offsetHeight);
      }
      for (var b = 0; b < items.length; b++) items[b].style.minHeight = h + "px";
    }
  }
  function queueSplitHeights() { setTimeout(syncSplitHeights, 0); }

  // ── installed-font metric resolver for selection mode ──
  function nodeRequire(name) {
    try { if (typeof require === "function") return require(name); } catch (e) {}
    try { if (window.cep_node && window.cep_node.require) return window.cep_node.require(name); } catch (e2) {}
    return null;
  }
  function normName(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function firstName(n) {
    if (!n) return "";
    if (typeof n === "string") return n;
    return n.en || n.en_US || n["en-US"] || n["en"] || n[Object.keys(n)[0]] || "";
  }
  function fontNameBag(font) {
    var names = font.names || {}, out = [];
    ["postScriptName", "fullName", "fontFamily", "preferredFamily", "preferredSubfamily", "fontSubfamily"].forEach(function (k) {
      var v = firstName(names[k]); if (v) out.push(v);
    });
    return out;
  }
  function listFontFiles() {
    if (_fontFiles) return _fontFiles;
    _fontFiles = [];
    var fs = nodeRequire("fs"), path = nodeRequire("path"), os = nodeRequire("os");
    if (!fs || !path) return _fontFiles;
    var home = "";
    try { home = os && os.homedir ? os.homedir() : ""; } catch (e) {}
    var appData = "";
    try { appData = (typeof process !== "undefined" && process.env && (process.env.APPDATA || process.env.LOCALAPPDATA)) ? (process.env.APPDATA || process.env.LOCALAPPDATA) : ""; } catch (eAD) {}
    var dirs = [
      "/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts",
      home ? path.join(home, "Library/Fonts") : "",
      "/Library/Application Support/Adobe/Fonts",
      home ? path.join(home, "Library/Application Support/Adobe/Fonts") : "",
      "/Library/Application Support/Adobe/CoreSync/plugins/livetype",
      home ? path.join(home, "Library/Application Support/Adobe/CoreSync/plugins/livetype") : "",
      appData ? path.join(appData, "Adobe/CoreSync/plugins/livetype") : "",
      appData ? path.join(appData, "Adobe/Fonts") : "",
      "C:/Windows/Fonts"
    ];
    function walk(dir, depth) {
      if (!dir || depth > 4) return;
      var entries;
      try { entries = fs.readdirSync(dir); } catch (e) { return; }
      for (var i = 0; i < entries.length; i++) {
        var full = path.join(dir, entries[i]), st;
        try { st = fs.statSync(full); } catch (e2) { continue; }
        if (st.isDirectory()) walk(full, depth + 1);
        else {
          var isAdobeCache = /[\\\/](CoreSync|livetype|Adobe Fonts|Adobe[\\\/]Fonts)[\\\/]/i.test(full);
          var isFontExt = /\.(otf|ttf|ttc|otc|woff|woff2)$/i.test(full);
          if ((isFontExt || isAdobeCache) && (!st.size || st.size < 90000000)) _fontFiles.push(full);
        }
      }
    }
    for (var d = 0; d < dirs.length; d++) walk(dirs[d], 0);
    return _fontFiles;
  }
  function parseFontFile(file) {
    var fs = nodeRequire("fs"); if (!fs || !window.opentype) return null;
    try {
      var buf = fs.readFileSync(file);
      var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return opentype.parse(ab);
    } catch (e) { return null; }
  }
  function fontScore(font, info) {
    var targetPS = normName(info.name), targetFull = normName((info.family || "") + " " + (info.style || ""));
    var targetFamily = normName(info.family), targetStyle = normName(info.style);
    var names = font.names || {};
    var ps = normName(firstName(names.postScriptName));
    var full = normName(firstName(names.fullName));
    var family = normName(firstName(names.preferredFamily) || firstName(names.fontFamily));
    var style = normName(firstName(names.preferredSubfamily) || firstName(names.fontSubfamily));
    var score = 0;
    if (targetPS && ps === targetPS) score += 1000;
    if (targetFull && full === targetFull) score += 900;
    if (targetFamily && family === targetFamily) score += 220;
    if (targetStyle && style === targetStyle) score += 140;
    if (targetStyle && full.indexOf(targetStyle) >= 0) score += 60;
    if (targetFamily && full.indexOf(targetFamily) >= 0) score += 60;
    if (targetPS && ps && (ps.indexOf(targetPS) >= 0 || targetPS.indexOf(ps) >= 0)) score += 80;
    return score;
  }
  function resolveInstalledFont(info) {
    if (!info || !info.name) return null;
    var key = [info.name, info.family, info.style].join("|");
    if (_fontMatchCache.hasOwnProperty(key)) return _fontMatchCache[key];
    var files = listFontFiles();
    var familyNeedle = normName(info.family);
    var ordered = files.slice().sort(function (a, b) {
      var aa = normName(a), bb = normName(b);
      var ah = familyNeedle && aa.indexOf(familyNeedle) >= 0 ? 0 : 1;
      var bh = familyNeedle && bb.indexOf(familyNeedle) >= 0 ? 0 : 1;
      return ah - bh;
    });
    var best = null, bestScore = 0;
    for (var i = 0; i < ordered.length; i++) {
      var f = parseFontFile(ordered[i]);
      if (!f) continue;
      var sc = fontScore(f, info);
      if (sc > bestScore) { bestScore = sc; best = f; }
      if (sc >= 1000) break;
    }
    // Require a family+style-level match, or exact PostScript/full-name match.
    _fontMatchCache[key] = bestScore >= 300 ? best : null;
    return _fontMatchCache[key];
  }
  function glyphY(font, ch, which) {
    try {
      var g = font.charToGlyph(ch);
      var bb = g.getBoundingBox();
      return which === "min" ? bb.y1 : bb.y2;
    } catch (e) { return null; }
  }
  function metricLineBounds(geo) {
    var x1 = geo.metricBase.x1, x2 = geo.metricBase.x2;
    var h = geo.bbox ? Math.max(1, geo.bbox.maxY - geo.bbox.minY) : 300;
    var pad = Math.max(110, Math.min(340, h * 0.28));
    return { x1: x1 - pad, x2: x2 };
  }
  function buildBaselineOnlyMetricLines(geo) {
    if (!geo || !geo.metricBase) return [];
    var b = metricLineBounds(geo);
    return [{ key: "baseline", y: geo.metricBase.baseline, x1: b.x1, x2: b.x2, label: "Baseline" }];
  }
  function buildEstimatedUnitMetricLines(geo) {
    if (!geo || !geo.metricBase) return [];
    var refs = geo.metricRefs || {}, base = geo.metricBase.baseline, b = metricLineBounds(geo);
    var size = geo.fontInfo && geo.fontInfo.size ? +geo.fontInfo.size : 0;
    var upm = 1000;
    var scale = size > 0 ? size / upm : 0;
    var lines = [{ key: "baseline", y: base, x1: b.x1, x2: b.x2, label: "Baseline" }];
    function addTop(key, value, label) {
      if (value == null || isNaN(value)) return;
      var u = scale > 0 ? Math.round(value / scale) : Math.round(value);
      lines.push({ key: key, y: base + value, x1: b.x1, x2: b.x2, label: label + " " + u + "u" });
    }
    function addBottom(key, value, label) {
      if (value == null || isNaN(value)) return;
      var u = scale > 0 ? -Math.round(Math.abs(value) / scale) : -Math.round(Math.abs(value));
      lines.push({ key: key, y: base - Math.abs(value), x1: b.x1, x2: b.x2, label: label + " " + u + "u" });
    }
    addTop("xheight", refs.xheight, "x-height");
    addTop("cap", refs.cap, "Cap");
    addTop("ascent", refs.ascent, "Ascent");
    addBottom("descent", refs.descent, "Descent");
    return lines;
  }

  function metricScaleFromRefs(refs, raw) {
    if (!refs || !raw) return null;
    // Use cap/x-height to calibrate the actual Illustrator object scale.
    // Do not use ascender: many fonts have an ascender above the visible "l" top.
    if (refs.cap != null && raw.cap != null && raw.cap > 0) return refs.cap / raw.cap;
    if (refs.xheight != null && raw.xheight != null && raw.xheight > 0) return refs.xheight / raw.xheight;
    return null;
  }
  function buildSelectionMetricLines(geo) {
    if (!geo || !geo.hasText || !geo.metricBase || !geo.fontInfo) {
      _selMetricSource = "";
      return geo && geo.metricLines ? geo.metricLines : null;
    }
    var font = S.metricFont || resolveInstalledFont(geo.fontInfo);
    if (!font) {
      _selMetricSource = "metrics: estimated units · load font file for exact units";
      return buildEstimatedUnitMetricLines(geo);
    }
    var os2 = (font.tables && font.tables.os2) || {}, hhea = (font.tables && font.tables.hhea) || {};
    var raw = {
      ascent: (typeof os2.sTypoAscender === "number" ? os2.sTypoAscender : (typeof hhea.ascender === "number" ? hhea.ascender : font.ascender)),
      descent: (typeof os2.sTypoDescender === "number" ? os2.sTypoDescender : (typeof hhea.descender === "number" ? hhea.descender : font.descender)),
      cap: (os2.sCapHeight && os2.sCapHeight > 0) ? os2.sCapHeight : glyphY(font, "H", "max"),
      xheight: (os2.sxHeight && os2.sxHeight > 0) ? os2.sxHeight : glyphY(font, "x", "max")
    };
    if (raw.descent != null && raw.descent > 0) raw.descent = -raw.descent;
    var scale = metricScaleFromRefs(geo.metricRefs, raw);
    if (!scale || isNaN(scale) || scale <= 0) {
      var upm = font.unitsPerEm || 1000, size = +geo.fontInfo.size || 0;
      scale = size ? size / upm : 0;
    }
    if (!scale || isNaN(scale) || scale <= 0) {
      _selMetricSource = "metrics: estimated units · load font file for exact units";
      return buildEstimatedUnitMetricLines(geo);
    }
    var base = geo.metricBase.baseline, b = metricLineBounds(geo), x1 = b.x1, x2 = b.x2;
    var lines = [{ key: "baseline", y: base, x1: x1, x2: x2, label: "Baseline" }];
    function add(key, value, label) {
      if (value == null || isNaN(value)) return;
      lines.push({ key: key, y: base + value * scale, x1: x1, x2: x2, label: label + " " + Math.round(value) + "u" });
    }
    add("xheight", raw.xheight, "x-height");
    add("cap", raw.cap, "Cap");
    add("ascent", raw.ascent, "Ascent");
    add("descent", raw.descent, "Descent");
    _selMetricSource = S.metricFont ? "metrics: loaded font units" : "metrics: OpenType font units";
    return lines;
  }

  function updateSelectionReadout(geo) {
    if (!geo) return;
    var metricNote = geo.hasText ? (_selMetricSource ? " · " + _selMetricSource : "") : " (no metrics)";
    $("readout").textContent = (geo.hasText ? "Text · " : "Paths · ") + geo.anchors.length + " anchors · " + geo.handles.length + " handles · " + geo.contours.length + " contours" + metricNote;
  }

  function onMetricFontFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        S.metricFont = opentype.parse(r.result);
        S.metricFontName = file.name;
        var lbl = $("metric-font-name");
        if (lbl) { lbl.textContent = file.name; if (lbl.parentNode) lbl.parentNode.classList.add("loaded"); }
        if (_selGeo) {
          _selMetricLines = buildSelectionMetricLines(_selGeo);
          updateSelectionReadout(_selGeo);
        }
        scheduleLive();
      } catch (err) { setStatus("Could not parse metric font: " + err.message, "err"); }
    };
    r.readAsArrayBuffer(file);
  }

  function initInputs() {
    on($("tab-sel"), "click", function () { setMode("selection"); });
    on($("tab-font"), "click", function () { setMode("font"); });
    on($("btn-inspect"), "click", inspectSelection);
    on($("btn-update"), "click", function () { if (liveReady()) doLiveDraw(); else setStatus("Nothing to update yet.", "err"); });
    on($("btn-finalize"), "click", finalize);
    on($("btn-clear"), "click", clearOverlay);
    on($("tg-live"), "change", function () { _live = $("tg-live").checked; });

    bindShapeRow("anchor-shapes", "anchorShape", "anchor-emoji-row");
    bindShapeRow("handle-shapes", "handleShape", "handle-emoji-row");
    bindEmoji("anchor-emoji", function (v) { S.anchorEmoji = v; });
    bindEmoji("handle-emoji", function (v) { S.handleEmoji = v; });

    bindInput("in-text", function (v) { S.text = v; });
    bindInput("in-size", function (v) { S.sizePt = Math.max(4, +v || 200); });
    bindInput("in-track", function (v) { S.trackPt = +v || 0; });
    bindCheck("tg-kern", function (v) { S.kern = v; S.features.kern = v; });

    bindColorHex("anchor-col", "anchor-hex", function (v) { S.anchorColor = v; });
    bindColorHex("anchor-ocol", "anchor-ohex", function (v) { S.anchorOutlineColor = v; });
    bindRange("anchor-ow", "anchor-ow-v", function (v) { S.anchorOutlineW = +v || 0; });
    bindRange("anchor-size", "anchor-size-v", function (v) { S.anchorSize = +v || 9; });

    bindColorHex("handle-col", "handle-hex", function (v) { S.handleColor = v; });
    bindColorHex("handle-ocol", "handle-ohex", function (v) { S.handleOutlineColor = v; });
    bindRange("handle-ow", "handle-ow-v", function (v) { S.handleOutlineW = +v || 0; });
    bindRange("handle-size", "handle-size-v", function (v) { S.handleSize = +v || 6; });

    bindColorHex("line-col", "line-hex", function (v) { S.lineColor = v; });
    bindRange("line-w", "line-w-v", function (v) { S.lineW = +v || 0.75; });

    bindColorHex("metric-col", "metric-hex", function (v) { S.metricColor = v; });
    bindRange("metric-w", "metric-w-v", function (v) { S.metricW = +v || 0.75; });
    bindRange("metric-label-size", "metric-label-size-v", function (v) { S.metricLabelSize = +v || 14; });

    bindCheck("tg-lsb", function (v) { S.sbOn = v; });
    bindCheck("tg-kernrect", function (v) { S.sbKernRect = v; });
    bindColorHex("sb-col", "sb-hex", function (v) { S.sbColor = v; });

    bindColorHex("g-fill", "g-fill-hex", function (v) { S.gFill = v; });
    bindCheck("tg-fill", function (v) { S.gFillOn = v; });
    bindCheck("tg-stroke", function (v) { S.gStrokeOn = v; });
    bindColorHex("g-stroke", "g-stroke-hex", function (v) { S.gStroke = v; });
    bindRange("g-stroke-w", "g-stroke-w-v", function (v) { S.gStrokeW = +v || 1; });

    /* Source outline removed. */
    bindCheck("o-anchors", function (v) { S.out.anchors = v; });
    bindCheck("o-handles", function (v) { S.out.handles = v; });
    bindCheck("o-lines", function (v) { S.out.lines = v; });
    bindCheck("o-metrics", function (v) { S.out.metrics = v; });
    bindCheck("o-sb", function (v) { S.out.sb = v; });

    on($("font-file"), "change", onFontFile);
    on($("metric-font-file"), "change", onMetricFontFile);
    window.addEventListener("resize", queueSplitHeights);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SELECTION
  // ════════════════════════════════════════════════════════════════════════
  function inspectSelection() {
    setStatus("Reading selection…", "");
    cs.evalScript("biReadSelection()", function (res) {
      if (res === "EvalScript error.") { setStatus("ExtendScript error.", "err"); return; }
      if (res && res.indexOf("ERR:") === 0) { setStatus(res.substring(4), "err"); _selReady = false; return; }
      var geo; try { geo = JSON.parse(res); } catch (e) { setStatus("Parse error.", "err"); return; }
      _selReady = true;
      _selGeo = geo;
      _bbH = (geo.bbox.maxY - geo.bbox.minY) || 300;
      _selMetricLines = buildSelectionMetricLines(geo);
      updateSelectionReadout(geo);
      doLiveDraw();
    });
  }
  function drawSelection() {
    if (!_selReady) { setStatus("Inspect a selection first.", "err"); return; }
    var lbl = Math.max(6, Math.min(48, +S.metricLabelSize || 14));
    S.out.glyph = false;
    var arg = {
      opts: S.out, metricsOn: S.metricsOn, metricLines: _selMetricLines,
      style: {
        anchorShape: S.anchorShape, anchorColor: S.anchorColor, anchorSize: S.anchorSize,
        anchorOutlineColor: S.anchorOutlineColor, anchorOutlineW: S.anchorOutlineW, anchorEmoji: S.anchorEmoji,
        glyphFill: S.gFill, glyphFillOn: S.gFillOn, glyphStroke: S.gStroke, glyphStrokeOn: S.gStrokeOn, glyphStrokeW: S.gStrokeW,
        handleShape: S.handleShape, handleColor: S.handleColor, handleSize: S.handleSize,
        handleOutlineColor: S.handleOutlineColor, handleOutlineW: S.handleOutlineW, handleEmoji: S.handleEmoji,
        lineColor: S.lineColor, lineW: S.lineW,
        metricColor: S.metricColor, metricW: S.metricW, labelSize: lbl
      }
    };
    cs.evalScript("biDrawSelection(" + JSON.stringify(arg) + ")", function (res) { reportDraw(res); });
  }

  // ════════════════════════════════════════════════════════════════════════
  // FONT FILE
  // ════════════════════════════════════════════════════════════════════════
  function onFontFile(e) {
    var file = e.target.files && e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        S.font = opentype.parse(r.result); S.upm = S.font.unitsPerEm || 1000; S.fontName = file.name;
        readMetricsSupport();
        var lbl = $("font-name"); lbl.textContent = file.name; lbl.parentNode.classList.add("loaded");
        doLiveDraw();
      } catch (err) { setStatus("Could not parse font: " + err.message, "err"); }
    };
    r.readAsArrayBuffer(file);
  }
  function readMetricsSupport() {
    var f = S.font, os2 = (f.tables && f.tables.os2) || {};
    S.metricsSupported = { baseline: true, ascent: true, descent: true, cap: (os2.sCapHeight || 0) > 0, xheight: (os2.sxHeight || 0) > 0 };
    syncMetricChipState();
  }
  function metricValues() {
    var f = S.font, os2 = (f.tables && f.tables.os2) || {};
    return { baseline: 0, ascent: f.ascender, descent: f.descender, cap: (os2.sCapHeight > 0) ? os2.sCapHeight : null, xheight: (os2.sxHeight > 0) ? os2.sxHeight : null };
  }
  function close2(a, b) { return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS; }
  function cmdsToContours(cmds) {
    var contours = [], cur = null, prev = null;
    function P(x, y) { return { a: [x, y], l: [x, y], r: [x, y] }; }
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c.type === "M") { if (cur && cur.length) contours.push(cur); cur = []; var p = P(c.x, c.y); cur.push(p); prev = p; }
      else if (c.type === "L") { prev.r = [prev.a[0], prev.a[1]]; var p2 = P(c.x, c.y); cur.push(p2); prev = p2; }
      else if (c.type === "C") { prev.r = [c.x1, c.y1]; var p3 = { a: [c.x, c.y], l: [c.x2, c.y2], r: [c.x, c.y] }; cur.push(p3); prev = p3; }
      else if (c.type === "Q") {
        var p0 = prev.a, qc = [c.x1, c.y1], pe = [c.x, c.y];
        prev.r = [p0[0] + 2 / 3 * (qc[0] - p0[0]), p0[1] + 2 / 3 * (qc[1] - p0[1])];
        var lft = [pe[0] + 2 / 3 * (qc[0] - pe[0]), pe[1] + 2 / 3 * (qc[1] - pe[1])];
        var p4 = { a: [pe[0], pe[1]], l: lft, r: [pe[0], pe[1]] }; cur.push(p4); prev = p4;
      } else if (c.type === "Z") {
        if (cur && cur.length > 1) { var first = cur[0], last = cur[cur.length - 1]; if (close2(last.a, first.a)) { first.l = last.l.slice(); cur.pop(); } }
        if (cur && cur.length) contours.push(cur); cur = null; prev = null;
      }
    }
    if (cur && cur.length) contours.push(cur);
    return contours;
  }
  function buildFontGeometry() {
    if (!S.font) return null;
    var f = S.font, upm = S.upm, scale = S.sizePt / upm, glyphs;
    try { glyphs = f.stringToGlyphs(S.text || "", { features: S.features }); } catch (e) { glyphs = f.stringToGlyphs(S.text || ""); }
    var contours = [], anchorsRaw = [], handlesRaw = [], handleLines = [], glyphBoxes = [], kernRows = [], penX = 0;
    for (var i = 0; i < glyphs.length; i++) {
      var g = glyphs[i]; if (!g) continue;
      if (S.kern && i > 0 && f.getKerningValue) { var kv = f.getKerningValue(glyphs[i - 1], g) || 0; if (kv) kernRows.push((glyphs[i - 1].name || "?") + "→" + (g.name || "?") + ":" + Math.round(kv)); penX += kv * scale; }
      var gp = g.getPath(penX, 0, S.sizePt);
      cmdsToContours(gp.commands).forEach(function (c) { contours.push(c); });
      var adv = (g.advanceWidth || upm) * scale + (i < glyphs.length - 1 ? S.trackPt : 0);
      var bb = null; try { bb = gp.getBoundingBox(); } catch (e2) {}
      glyphBoxes.push({ gx: penX, penEnd: penX + (g.advanceWidth || upm) * scale, bb: bb });
      penX += adv;
    }
    var seenA = {}, seenH = {};
    contours.forEach(function (ct) {
      ct.forEach(function (pt) {
        pt.a[1] = -pt.a[1]; pt.l[1] = -pt.l[1]; pt.r[1] = -pt.r[1];
        var ak = Math.round(pt.a[0] * 50) + "," + Math.round(pt.a[1] * 50);
        if (!seenA[ak]) { seenA[ak] = 1; anchorsRaw.push([pt.a[0], pt.a[1]]); }
        if (!close2(pt.r, pt.a)) { handleLines.push([pt.a[0], pt.a[1], pt.r[0], pt.r[1]]); var rk = Math.round(pt.r[0] * 50) + "," + Math.round(pt.r[1] * 50); if (!seenH[rk]) { seenH[rk] = 1; handlesRaw.push([pt.r[0], pt.r[1]]); } }
        if (!close2(pt.l, pt.a)) { handleLines.push([pt.a[0], pt.a[1], pt.l[0], pt.l[1]]); var lk = Math.round(pt.l[0] * 50) + "," + Math.round(pt.l[1] * 50); if (!seenH[lk]) { seenH[lk] = 1; handlesRaw.push([pt.l[0], pt.l[1]]); } }
      });
    });
    var mv = metricValues(), mY = {
      baseline: 0, ascent: mv.ascent != null ? mv.ascent * scale : null, descent: mv.descent != null ? mv.descent * scale : null,
      cap: mv.cap != null ? mv.cap * scale : null, xheight: mv.xheight != null ? mv.xheight * scale : null
    };
    var ascentY = mY.ascent != null ? mY.ascent : S.sizePt * 0.8, descentY = mY.descent != null ? mY.descent : -S.sizePt * 0.2;
    var minX = 0, maxX = penX, minY = descentY, maxY = ascentY;
    function ext(x, y) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    anchorsRaw.forEach(function (p) { ext(p[0], p[1]); }); handlesRaw.forEach(function (p) { ext(p[0], p[1]); });
    ["baseline", "ascent", "descent", "cap", "xheight"].forEach(function (kk) { if (S.metricsOn[kk] && mY[kk] != null) { if (mY[kk] < minY) minY = mY[kk]; if (mY[kk] > maxY) maxY = mY[kk]; } });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, pad = S.sizePt * 0.16;
    var metricLines = [];
    ["ascent", "cap", "xheight", "baseline", "descent"].forEach(function (kk) {
      if (!S.metricsOn[kk] || mY[kk] == null) return;
      metricLines.push({ y: mY[kk] - cy, x1: minX - pad - cx, x2: maxX + pad - cx, label: (kk === "baseline" ? "Baseline" : (kk === "xheight" ? "x-height" : kk.charAt(0).toUpperCase() + kk.slice(1))) + (kk === "baseline" ? "" : " " + Math.round(mv[kk]) + "u") });
    });
    var sbLines = [], sbLabels = [], sbRects = [];
    if (S.sbOn) {
      var topY = ascentY - cy, botY = descentY - cy, labY = (ascentY - cy) + S.sizePt * 0.06;
      for (var b = 0; b < glyphBoxes.length; b++) {
        var box = glyphBoxes[b]; if (!box.bb) continue;
        var inkL = box.bb.x1, inkR = box.bb.x2, gx = box.gx, penEnd = box.penEnd;
        var lsbU = Math.round((inkL - gx) / scale), rsbU = Math.round((penEnd - inkR) / scale), wU = Math.round((inkR - inkL) / scale);
        sbLines.push({ x: gx - cx, y1: botY, y2: topY, dashed: false }); sbLines.push({ x: penEnd - cx, y1: botY, y2: topY, dashed: false });
        sbLines.push({ x: inkL - cx, y1: botY, y2: topY, dashed: true }); sbLines.push({ x: inkR - cx, y1: botY, y2: topY, dashed: true });
        if (inkL - gx > 0.5) sbLabels.push({ x: gx - cx + 2, y: labY, text: String(lsbU), anchor: "start" });
        if (wU > 0) sbLabels.push({ x: (inkL + inkR) / 2 - cx, y: labY, text: String(wU), anchor: "middle" });
        if (penEnd - inkR > 0.5) sbLabels.push({ x: penEnd - cx - 2, y: labY, text: String(rsbU), anchor: "end" });
        if (S.sbKernRect) { var nx = glyphBoxes[b + 1]; if (nx && nx.bb) { var oL = Math.max(inkR, nx.gx), oR = Math.min(penEnd, nx.bb.x1); if (oR > oL + 0.5) sbRects.push({ x: oL - cx, y: botY, w: oR - oL, h: topY - botY }); } }
      }
    }
    function sh(arr) { arr.forEach(function (p) { p[0] -= cx; p[1] -= cy; }); }
    sh(anchorsRaw); sh(handlesRaw);
    handleLines.forEach(function (l) { l[0] -= cx; l[1] -= cy; l[2] -= cx; l[3] -= cy; });
    contours.forEach(function (ct) { ct.forEach(function (P) { P.a[0] -= cx; P.a[1] -= cy; P.l[0] -= cx; P.l[1] -= cy; P.r[0] -= cx; P.r[1] -= cy; }); });
    _bbH = maxY - minY;
    return {
      contours: contours, anchors: anchorsRaw, handles: handlesRaw, handleLines: handleLines,
      metricLines: metricLines, sbLines: sbLines, sbLabels: sbLabels, sbRects: sbRects, kernRows: kernRows
    };
  }
  function updateFontReadout() {
    if (!_fontGeo) return;
    var nm = S.font.names && S.font.names.fontFamily ? (S.font.names.fontFamily.en || "") : S.fontName;
    var lines = [nm + " · " + S.upm + " upm", _fontGeo.anchors.length + " anchors · " + _fontGeo.handles.length + " handles"];
    if (_fontGeo.kernRows.length) lines.push("kern: " + _fontGeo.kernRows.join("  "));
    $("readout").textContent = lines.join("\n");
  }
  function drawFont() {
    if (!S.font || !_fontGeo) { setStatus("Load a font first.", "err"); return; }
    var payload = {
      opts: S.out,
      style: {
        glyphFill: S.gFill, glyphFillOn: S.gFillOn, glyphStroke: S.gStroke, glyphStrokeOn: S.gStrokeOn, glyphStrokeW: S.gStrokeW,
        anchorShape: S.anchorShape, anchorColor: S.anchorColor, anchorSize: S.anchorSize,
        anchorOutlineColor: S.anchorOutlineColor, anchorOutlineW: S.anchorOutlineW, anchorEmoji: S.anchorEmoji,
        handleShape: S.handleShape, handleColor: S.handleColor, handleSize: S.handleSize,
        handleOutlineColor: S.handleOutlineColor, handleOutlineW: S.handleOutlineW, handleEmoji: S.handleEmoji,
        lineColor: S.lineColor, lineW: S.lineW, metricColor: S.metricColor, metricW: S.metricW,
        sbColor: S.sbColor, labelSize: Math.max(6, Math.min(48, +S.metricLabelSize || Math.max(6, S.sizePt * 0.045)))
      },
      contours: _fontGeo.contours, anchors: _fontGeo.anchors, handles: _fontGeo.handles,
      handleLines: _fontGeo.handleLines, metricLines: _fontGeo.metricLines,
      sbLines: _fontGeo.sbLines, sbLabels: _fontGeo.sbLabels, sbRects: _fontGeo.sbRects
    };
    cs.evalScript("biRenderFont(" + JSON.stringify(payload) + ")", function (res) { reportDraw(res); });
  }

  // ── live-layer actions ──
  function finalize() {
    cs.evalScript("biFinalize()", function (res) {
      if (res && res.indexOf("ERR:") === 0) setStatus(res.substring(4), "err");
      else { setStatus(res || "Finalized.", "ok"); _selReady = _selReady; }
    });
  }
  function clearOverlay() { cs.evalScript("biClearOverlay()", function (res) { reportDraw(res); }); }

  function reportDraw(res) {
    if (res === "EvalScript error.") { setStatus("ExtendScript error (open a document).", "err"); return; }
    if (res && res.indexOf("ERR:") === 0) setStatus(res.substring(4), "err");
    else setStatus(res || "Updated.", "ok");
  }
  function setStatus(msg, cls) { var el = $("status"); el.textContent = msg || ""; el.className = "status" + (cls ? " " + cls : ""); }

  initSections(); initFeatureChips(); initMetricChips(); initInputs(); setMode("selection"); syncMetricChipState(); queueSplitHeights();
})();
