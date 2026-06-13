/* host.jsx — Bézier Inspector ExtendScript backend (v2)
 *
 * Two modes:
 *   SELECTION  — read the currently selected text frames / paths in the doc,
 *                extract real bezier geometry, measure metrics from the live
 *                font, and draw the inspection overlay directly on top.
 *   FONT FILE  — receive a fully-computed payload from the panel (opentype.js)
 *                and draw a fresh specimen (incl. sidebearings + kerning).
 *
 * All coordinates are Illustrator points, Y-up.
 */

#target illustrator

var BI_doc = null, BI_OX = 0, BI_OY = 0, BI_GEO = null, BI_SEL = null;
var BI_EPS = 0.01;
var BI_LIVE = "Bézier Inspector (live)";

function BI_err(m) { return "ERR:" + m; }
function BI_T(x, y) { return [x + BI_OX, y + BI_OY]; }

/* remove the current live overlay layer(s) so the next draw replaces it */
function BI_clearLive() {
  for (var i = BI_doc.layers.length - 1; i >= 0; i--) {
    if (BI_doc.layers[i].name === BI_LIVE) { try { BI_doc.layers[i].remove(); } catch (e) {} }
  }
}

function BI_saveSelection(sel) {
  BI_SEL = [];
  if (!sel) return;
  for (var i = 0; i < sel.length; i++) {
    try { BI_SEL.push(sel[i]); } catch (e) {}
  }
}
function BI_restoreSelection() {
  try {
    BI_doc.selection = null;
    if (!BI_SEL || !BI_SEL.length) return;
    for (var i = 0; i < BI_SEL.length; i++) {
      try { BI_SEL[i].selected = true; } catch (e) {}
    }
  } catch (e2) {}
}

/* ── minimal JSON serializer (ExtendScript has no JSON) ── */
function BI_stringify(o) {
  if (o === null || o === undefined) return "null";
  var t = typeof o;
  if (t === "number") return (Math.round(o * 1000) / 1000).toString();
  if (t === "boolean") return o ? "true" : "false";
  if (t === "string") return '"' + o.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  var i, a;
  if (o instanceof Array) {
    a = [];
    for (i = 0; i < o.length; i++) a.push(BI_stringify(o[i]));
    return "[" + a.join(",") + "]";
  }
  a = [];
  for (var k in o) if (o.hasOwnProperty(k)) a.push('"' + k + '":' + BI_stringify(o[k]));
  return "{" + a.join(",") + "}";
}

/* ── color from hex, matched to document color space ── */
function BI_color(hex) {
  hex = String(hex).replace("#", "");
  var r = parseInt(hex.substr(0, 2), 16),
      g = parseInt(hex.substr(2, 2), 16),
      b = parseInt(hex.substr(4, 2), 16);
  if (BI_doc && BI_doc.documentColorSpace === DocumentColorSpace.CMYK) {
    var rr = r / 255, gg = g / 255, bb = b / 255, k = 1 - Math.max(rr, Math.max(gg, bb));
    var c = new CMYKColor();
    if (k >= 0.9999) { c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100; }
    else {
      c.cyan = (1 - rr - k) / (1 - k) * 100;
      c.magenta = (1 - gg - k) / (1 - k) * 100;
      c.yellow = (1 - bb - k) / (1 - k) * 100;
      c.black = k * 100;
    }
    return c;
  }
  var col = new RGBColor(); col.red = r; col.green = g; col.blue = b; return col;
}

/* ── primitive drawing helpers ── */
function BI_line(grp, x1, y1, x2, y2, color, w, dashed, opacity) {
  var p = grp.pathItems.add();
  p.setEntirePath([BI_T(x1, y1), BI_T(x2, y2)]);
  p.filled = false; p.stroked = true; p.strokeColor = color; p.strokeWidth = w;
  try { p.strokeCap = StrokeCap.BUTTENDCAP; } catch (e) {}
  if (dashed) p.strokeDashes = [w * 3, w * 3];
  if (opacity != null) p.opacity = opacity;
  return p;
}
function BI_marker(grp, shape, x, y, size, fill, sCol, sW, emoji) {
  var h = size / 2, c = BI_T(x, y);
  if (shape === "emoji") {
    var tf = grp.textFrames.add();
    tf.contents = emoji || "🙂";
    try { tf.textRange.characterAttributes.size = size; } catch (e) {}
    try { tf.position = [c[0] - tf.width / 2, c[1] + tf.height / 2]; } catch (e2) { tf.position = [c[0], c[1]]; }
    return tf;
  }
  function sty(it) {
    it.filled = true; it.fillColor = fill;
    if (sW && sW > 0 && sCol) { it.stroked = true; it.strokeColor = sCol; it.strokeWidth = sW; } else it.stroked = false;
  }
  if (shape === "circle") { var e = grp.pathItems.ellipse(c[1] + h, c[0] - h, size, size); sty(e); return e; }
  if (shape === "square") { var r = grp.pathItems.rectangle(c[1] + h, c[0] - h, size, size); sty(r); return r; }
  if (shape === "diamond") { var d = grp.pathItems.add(); d.setEntirePath([[c[0], c[1] + h], [c[0] + h, c[1]], [c[0], c[1] - h], [c[0] - h, c[1]]]); d.closed = true; sty(d); return d; }
  var gg = grp.groupItems.add(), sw = Math.max(0.5, size / 6);
  var l1 = gg.pathItems.add(); l1.setEntirePath([[c[0] - h, c[1] - h], [c[0] + h, c[1] + h]]); l1.filled = false; l1.stroked = true; l1.strokeColor = fill; l1.strokeWidth = sw;
  var l2 = gg.pathItems.add(); l2.setEntirePath([[c[0] - h, c[1] + h], [c[0] + h, c[1] - h]]); l2.filled = false; l2.stroked = true; l2.strokeColor = fill; l2.strokeWidth = sw;
  return gg;
}
function BI_label(grp, x, y, text, anchor, size, color) {
  var c = BI_T(x, y);
  var tf = grp.textFrames.add();
  tf.contents = String(text);
  try { tf.textRange.characterAttributes.size = size; tf.textRange.characterAttributes.fillColor = color; } catch (e) {}
  tf.position = [c[0], c[1]];
  try {
    if (anchor === "middle") tf.position = [c[0] - tf.width / 2, c[1]];
    else if (anchor === "end") tf.position = [c[0] - tf.width, c[1]];
  } catch (e2) {}
  return tf;
}

/* ════════════════════════════════════════════════════════════════════════
 * SELECTION MODE
 * ════════════════════════════════════════════════════════════════════════ */

function BI_collect(item, out) {
  var t = item.typename;
  if (t === "TextFrame") out.texts.push(item);
  else if (t === "PathItem") out.paths.push(item);
  else if (t === "CompoundPathItem") { for (var i = 0; i < item.pathItems.length; i++) out.paths.push(item.pathItems[i]); }
  else if (t === "GroupItem") { for (var j = 0; j < item.pageItems.length; j++) BI_collect(item.pageItems[j], out); }
}

function BI_pathToContour(p) {
  var pts = [];
  for (var i = 0; i < p.pathPoints.length; i++) {
    var pp = p.pathPoints[i];
    pts.push({
      a: [pp.anchor[0], pp.anchor[1]],
      l: [pp.leftDirection[0], pp.leftDirection[1]],
      r: [pp.rightDirection[0], pp.rightDirection[1]]
    });
  }
  return { pts: pts, closed: p.closed };
}

/* duplicate text → outline → read geometry → remove. returns per-glyph bottoms. */
function BI_outlineText(tf, contoursOut, bottomsOut) {
  var dup = tf.duplicate();
  var og;
  try { og = dup.createOutline(); }
  catch (e) { try { dup.remove(); } catch (_) {} return; }
  var items = { texts: [], paths: [] };
  BI_collect(og, items);
  for (var i = 0; i < items.paths.length; i++) contoursOut.push(BI_pathToContour(items.paths[i]));
  // per-glyph bottom edges (for baseline detection)
  for (var k = 0; k < og.pageItems.length; k++) {
    try { bottomsOut.push(og.pageItems[k].geometricBounds[3]); } catch (e2) {}
  }
  try { og.remove(); } catch (e3) {}
}

/* most-common value (rounded) — robust baseline from glyph bottoms */
function BI_mode(arr) {
  if (!arr.length) return 0;
  var map = {}, best = arr[0], bestN = 0;
  for (var i = 0; i < arr.length; i++) {
    var k = Math.round(arr[i] * 2) / 2;
    map[k] = (map[k] || 0) + 1;
    if (map[k] > bestN) { bestN = map[k]; best = k; }
  }
  return best;
}

/* Measure visible reference glyphs by duplicating the real selected text object.
 * This preserves object-level scaling and character vertical/horizontal scale.
 * Returned values are Illustrator point distances, not font units.
 */
function BI_refGlyphBounds(tf, ch) {
  var dup = null, og = null;
  try {
    dup = tf.duplicate();
    dup.contents = ch;
    og = dup.createOutline();
    var gb = og.geometricBounds; // [left, top, right, bottom]
    var r = { left: gb[0], top: gb[1], right: gb[2], bottom: gb[3] };
    try { og.remove(); } catch (e0) {}
    return r;
  } catch (e) {
    try { if (og) og.remove(); } catch (e1) {}
    try { if (dup) dup.remove(); } catch (e2) {}
  }
  return null;
}
function BI_metricRefs(tf, fallbackBase) {
  if (!tf) return null;
  var H = BI_refGlyphBounds(tf, "H"), x = BI_refGlyphBounds(tf, "x"), l = BI_refGlyphBounds(tf, "l"), p = BI_refGlyphBounds(tf, "p");
  var base = fallbackBase;
  try { if (tf.anchor && tf.anchor.length > 1) base = tf.anchor[1]; } catch (e) {}
  if ((base === null || base === undefined || isNaN(base)) && H) base = H.bottom;
  if (base === null || base === undefined || isNaN(base)) return null;
  function topDist(b) { return b ? (b.top - base) : null; }
  function bottomDist(b) { return b ? (base - b.bottom) : null; }
  return {
    baseline: base,
    cap: topDist(H),
    xheight: topDist(x),
    ascent: topDist(l),
    descent: bottomDist(p),
    H: H, x: x, l: l, p: p
  };
}

function BI_build(contours) {
  var anchors = [], handles = [], lines = [], seenA = {}, seenH = {};
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  function ext(x, y) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (var c = 0; c < contours.length; c++) {
    var pts = contours[c].pts;
    for (var i = 0; i < pts.length; i++) {
      var P = pts[i]; ext(P.a[0], P.a[1]);
      var ak = Math.round(P.a[0] * 20) + "," + Math.round(P.a[1] * 20);
      if (!seenA[ak]) { seenA[ak] = 1; anchors.push([P.a[0], P.a[1]]); }
      if (Math.abs(P.r[0] - P.a[0]) > BI_EPS || Math.abs(P.r[1] - P.a[1]) > BI_EPS) {
        lines.push([P.a[0], P.a[1], P.r[0], P.r[1]]); ext(P.r[0], P.r[1]);
        var rk = Math.round(P.r[0] * 20) + "," + Math.round(P.r[1] * 20);
        if (!seenH[rk]) { seenH[rk] = 1; handles.push([P.r[0], P.r[1]]); }
      }
      if (Math.abs(P.l[0] - P.a[0]) > BI_EPS || Math.abs(P.l[1] - P.a[1]) > BI_EPS) {
        lines.push([P.a[0], P.a[1], P.l[0], P.l[1]]); ext(P.l[0], P.l[1]);
        var lk = Math.round(P.l[0] * 20) + "," + Math.round(P.l[1] * 20);
        if (!seenH[lk]) { seenH[lk] = 1; handles.push([P.l[0], P.l[1]]); }
      }
    }
  }
  return { contours: contours, anchors: anchors, handles: handles, handleLines: lines,
           bbox: { minX: minX, minY: minY, maxX: maxX, maxY: maxY } };
}

function biReadSelection() {
  try {
    if (app.documents.length === 0) return BI_err("Open a document first.");
    BI_doc = app.activeDocument;
    var sel = BI_doc.selection;
    if (!sel || sel.length === 0) return BI_err("Select a text frame or path, then Inspect.");
    BI_saveSelection(sel);

    var items = { texts: [], paths: [] };
    for (var i = 0; i < sel.length; i++) BI_collect(sel[i], items);

    var contours = [], glyphBottoms = [], hasText = false, font = null, size = null, fontInfo = null, firstText = null;
    for (var t = 0; t < items.texts.length; t++) {
      hasText = true;
      if (!firstText) firstText = items.texts[t];
      if (!font) { try { var ca = items.texts[t].textRange.characterAttributes; font = ca.textFont; size = ca.size; fontInfo = { name: font.name, family: font.family, style: font.style, size: size }; } catch (e) {} }
      BI_outlineText(items.texts[t], contours, glyphBottoms);
    }
    for (var p = 0; p < items.paths.length; p++) contours.push(BI_pathToContour(items.paths[p]));
    if (contours.length === 0) return BI_err("No path or text geometry in selection.");

    var geo = BI_build(contours);

    var metricLines = [], metricRefs = null;
    if (hasText && font) {
      var baseY = BI_mode(glyphBottoms);
      metricRefs = BI_metricRefs(firstText, baseY);
      if (metricRefs && metricRefs.baseline != null) baseY = metricRefs.baseline;
      var x1 = geo.bbox.minX, x2 = geo.bbox.maxX;
      metricLines.push({ key: "baseline", y: baseY, x1: x1, x2: x2, label: "Baseline" });
    }
    geo.metricLines = metricLines;
    geo.metricRefs = metricRefs;
    geo.metricBase = { baseline: (metricRefs && metricRefs.baseline != null) ? metricRefs.baseline : (hasText ? BI_mode(glyphBottoms) : 0), x1: geo.bbox.minX, x2: geo.bbox.maxX };
    geo.fontInfo = fontInfo;
    geo.hasText = hasText;
    BI_GEO = geo;

    return BI_stringify({
      ok: true, hasText: hasText,
      contours: geo.contours, anchors: geo.anchors, handles: geo.handles,
      handleLines: geo.handleLines, metricLines: metricLines, metricRefs: metricRefs, metricBase: geo.metricBase, fontInfo: fontInfo, bbox: geo.bbox
    });
  } catch (e) { return BI_err(e.message + (e.line ? " (line " + e.line + ")" : "")); }
}

function BI_stylePathItem(p, fillColor, fillOn, strokeColor, strokeOn, strokeW) {
  try { p.filled = (!!fillOn && p.closed); if (p.filled) p.fillColor = fillColor; } catch (e) {}
  try { p.stroked = !!strokeOn; if (p.stroked) { p.strokeColor = strokeColor; p.strokeWidth = strokeW; } } catch (e2) {}
}
function BI_styleOutlineTree(item, fillColor, fillOn, strokeColor, strokeOn, strokeW) {
  if (!item) return 0;
  var n = 0;
  try {
    var t = item.typename;
    if (t === "PathItem") { BI_stylePathItem(item, fillColor, fillOn, strokeColor, strokeOn, strokeW); return 1; }
    if (t === "CompoundPathItem") {
      for (var i = 0; i < item.pathItems.length; i++) { BI_stylePathItem(item.pathItems[i], fillColor, fillOn, strokeColor, strokeOn, strokeW); n++; }
      return n;
    }
    if (t === "GroupItem") {
      for (var j = 0; j < item.pageItems.length; j++) n += BI_styleOutlineTree(item.pageItems[j], fillColor, fillOn, strokeColor, strokeOn, strokeW);
      return n;
    }
  } catch (e) {}
  return n;
}
function BI_outlineTextTree(item) {
  if (!item) return item;
  try {
    if (item.typename === "TextFrame") return item.createOutline();
    if (item.typename === "GroupItem") {
      for (var i = item.pageItems.length - 1; i >= 0; i--) {
        try { BI_outlineTextTree(item.pageItems[i]); } catch (e1) {}
      }
    }
  } catch (e) {}
  return item;
}
function BI_duplicateIntoGroup(item, grp) {
  var dup = null;
  try { dup = item.duplicate(grp, ElementPlacement.PLACEATEND); }
  catch (e) {
    try { dup = item.duplicate(); dup.move(grp, ElementPlacement.PLACEATEND); } catch (e2) { dup = null; }
  }
  return dup;
}
function BI_drawSourceOutlineFromSelection(outlineGrp, st, fillColor, strokeColor) {
  if (!BI_SEL || !BI_SEL.length) return 0;
  var count = 0;
  for (var i = 0; i < BI_SEL.length; i++) {
    try {
      var dup = BI_duplicateIntoGroup(BI_SEL[i], outlineGrp);
      if (!dup) continue;
      var outlined = BI_outlineTextTree(dup);
      count += BI_styleOutlineTree(outlined, fillColor, st.glyphFillOn, strokeColor, st.glyphStrokeOn, st.glyphStrokeW);
    } catch (e) {}
  }
  return count;
}

function biDrawSelection(d) {
  try {
    if (!BI_GEO) return BI_err("Inspect a selection first.");
    if (app.documents.length === 0) return BI_err("Open a document first.");
    BI_doc = app.activeDocument; BI_OX = 0; BI_OY = 0;
    var st = d.style, opt = d.opts, mOn = d.metricsOn, count = 0; if (opt) opt.glyph = false;

    BI_clearLive();
    var layer = BI_doc.layers.add(); layer.name = BI_LIVE;
    /* Groups are direct children of the live layer so they can be edited separately. */

    var cMetric = BI_color(st.metricColor), cAnchor = BI_color(st.anchorColor),
        cHandle = BI_color(st.handleColor), cLine = BI_color(st.lineColor),
        cGFill = BI_color(st.glyphFill), cGStroke = BI_color(st.glyphStroke),
        cAnchorO = BI_color(st.anchorOutlineColor), cHandleO = BI_color(st.handleOutlineColor);

    if (opt.glyph) {
      var outlineGrp = layer.groupItems.add(); outlineGrp.name = "Source outline";
      var outlineCount = BI_drawSourceOutlineFromSelection(outlineGrp, st, cGFill, cGStroke);
      if (outlineCount === 0 && BI_GEO.contours && BI_GEO.contours.length) {
        for (var gi = 0; gi < BI_GEO.contours.length; gi++) {
          BI_contourPath(outlineGrp, BI_GEO.contours[gi], cGFill, false, cGStroke, st.glyphStrokeOn, st.glyphStrokeW);
          outlineCount++;
        }
      }
      count += outlineCount;
    }
    var metricLines = d.metricLines || BI_GEO.metricLines;
    if (opt.metrics && metricLines) {
      var metricGrp = layer.groupItems.add(); metricGrp.name = "Metrics";
      for (var i = 0; i < metricLines.length; i++) {
        var m = metricLines[i];
        if (mOn && mOn[m.key] === false) continue;
        BI_line(metricGrp, m.x1, m.y, m.x2, m.y, cMetric, st.metricW, false, null); count++;
        BI_label(metricGrp, m.x1, m.y + st.labelSize * 1.3, m.label, "start", st.labelSize, cMetric); count++;
      }
    }
    if (opt.lines && BI_GEO.handleLines) {
      var linesGrp = layer.groupItems.add(); linesGrp.name = "Handle connector lines";
      for (var hl = 0; hl < BI_GEO.handleLines.length; hl++) {
        var L = BI_GEO.handleLines[hl];
        BI_line(linesGrp, L[0], L[1], L[2], L[3], cLine, st.lineW, false, 90); count++;
      }
    }
    if (opt.handles && BI_GEO.handles) {
      var handlesGrp = layer.groupItems.add(); handlesGrp.name = "Bézier handles";
      for (var hi = 0; hi < BI_GEO.handles.length; hi++) { BI_marker(handlesGrp, st.handleShape, BI_GEO.handles[hi][0], BI_GEO.handles[hi][1], st.handleSize, cHandle, cHandleO, st.handleOutlineW, st.handleEmoji); count++; }
    }
    if (opt.anchors && BI_GEO.anchors) {
      var anchorsGrp = layer.groupItems.add(); anchorsGrp.name = "Anchor points";
      for (var ai = 0; ai < BI_GEO.anchors.length; ai++) { BI_marker(anchorsGrp, st.anchorShape, BI_GEO.anchors[ai][0], BI_GEO.anchors[ai][1], st.anchorSize, cAnchor, cAnchorO, st.anchorOutlineW, st.anchorEmoji); count++; }
    }

    BI_restoreSelection(); app.redraw();
    return "Drew " + count + " items over the selection.";
  } catch (e) { return BI_err(e.message + (e.line ? " (line " + e.line + ")" : "")); }
}

/* ════════════════════════════════════════════════════════════════════════
 * FONT-FILE MODE  (panel already computed everything; centered on artboard)
 * ════════════════════════════════════════════════════════════════════════ */

function BI_contourPath(grp, ct, fillColor, fillOn, strokeColor, strokeOn, strokeW) {
  var pts = ct.pts || ct;
  var isClosed = (ct.closed === false) ? false : true;
  var path = grp.pathItems.add();
  var seed = path.pathPoints.length;
  for (var i = 0; i < pts.length; i++) {
    var P = pts[i];
    var pp = path.pathPoints.add();
    pp.anchor = BI_T(P.a[0], P.a[1]);
    pp.leftDirection = BI_T(P.l[0], P.l[1]);
    pp.rightDirection = BI_T(P.r[0], P.r[1]);
    try { pp.pointType = PointType.CORNER; } catch (e) {}
  }
  for (var k = 0; k < seed; k++) { try { path.pathPoints[0].remove(); } catch (e2) {} }
  path.closed = isClosed;
  path.filled = (!!fillOn && isClosed); if (path.filled) path.fillColor = fillColor;
  path.stroked = !!strokeOn; if (strokeOn) { path.strokeColor = strokeColor; path.strokeWidth = strokeW; }
  return path;
}

function biRenderFont(data) {
  try {
    if (app.documents.length === 0) return BI_err("Open a document first.");
    BI_doc = app.activeDocument;
    var ab = BI_doc.artboards[BI_doc.artboards.getActiveArtboardIndex()].artboardRect;
    BI_OX = (ab[0] + ab[2]) / 2; BI_OY = (ab[1] + ab[3]) / 2;

    BI_clearLive();
    var layer = BI_doc.layers.add(); layer.name = BI_LIVE;
    var grp = layer.groupItems.add(); grp.name = "bezier-specimen";
    var st = data.style, opt = data.opts, count = 0;

    var cMetric = BI_color(st.metricColor), cAnchor = BI_color(st.anchorColor),
        cHandle = BI_color(st.handleColor), cLine = BI_color(st.lineColor),
        cSB = BI_color(st.sbColor), cGFill = BI_color(st.glyphFill), cGStroke = BI_color(st.glyphStroke),
        cAnchorO = BI_color(st.anchorOutlineColor), cHandleO = BI_color(st.handleOutlineColor);

    if (opt.metrics && data.metricLines) for (var i = 0; i < data.metricLines.length; i++) {
      var m = data.metricLines[i];
      BI_line(grp, m.x1, m.y, m.x2, m.y, cMetric, st.metricW, false, null); count++;
      BI_label(grp, m.x1, m.y + st.labelSize * 1.3, m.label, "start", st.labelSize, cMetric); count++;
    }
    if (opt.sb) {
      var j;
      if (data.sbRects) for (j = 0; j < data.sbRects.length; j++) {
        var r = data.sbRects[j], c = BI_T(r.x, r.y + r.h);
        var rect = grp.pathItems.rectangle(c[1], c[0], r.w, r.h);
        rect.stroked = false; rect.filled = true; rect.fillColor = cSB; rect.opacity = 22; count++;
      }
      if (data.sbLines) for (j = 0; j < data.sbLines.length; j++) {
        var sl = data.sbLines[j];
        BI_line(grp, sl.x, sl.y1, sl.x, sl.y2, cSB, Math.max(0.25, st.lineW * 0.8), sl.dashed, sl.dashed ? 40 : 65); count++;
      }
      if (data.sbLabels) for (j = 0; j < data.sbLabels.length; j++) {
        var sb = data.sbLabels[j];
        BI_label(grp, sb.x, sb.y + st.labelSize, sb.text, sb.anchor, st.labelSize * 0.85, cSB); count++;
      }
    }
    if (opt.glyph && data.contours && data.contours.length) {
      var paths = [];
      for (var ci = 0; ci < data.contours.length; ci++)
        paths.push(BI_contourPath(grp, data.contours[ci], cGFill, st.glyphFillOn, cGStroke, st.glyphStrokeOn, st.glyphStrokeW));
      if (paths.length > 1) {
        BI_doc.selection = null;
        for (var pi = 0; pi < paths.length; pi++) paths[pi].selected = true;
        try { app.executeMenuCommand("compoundPath"); } catch (eC) {}
        BI_doc.selection = null;
      }
      count++;
    }
    if (opt.lines && data.handleLines) for (var hl = 0; hl < data.handleLines.length; hl++) {
      var L = data.handleLines[hl];
      BI_line(grp, L[0], L[1], L[2], L[3], cLine, st.lineW, false, 90); count++;
    }
    if (opt.handles && data.handles) for (var hi = 0; hi < data.handles.length; hi++) { BI_marker(grp, st.handleShape, data.handles[hi][0], data.handles[hi][1], st.handleSize, cHandle, cHandleO, st.handleOutlineW, st.handleEmoji); count++; }
    if (opt.anchors && data.anchors) for (var ai = 0; ai < data.anchors.length; ai++) { BI_marker(grp, st.anchorShape, data.anchors[ai][0], data.anchors[ai][1], st.anchorSize, cAnchor, cAnchorO, st.anchorOutlineW, st.anchorEmoji); count++; }

    BI_doc.selection = null; app.redraw();
    return "Drew " + count + " items on a new layer.";
  } catch (e) { return BI_err(e.message + (e.line ? " (line " + e.line + ")" : "")); }
}

/* ── live-layer lifecycle ── */
function biFinalize() {
  try {
    if (app.documents.length === 0) return BI_err("Open a document first.");
    BI_doc = app.activeDocument;
    var done = 0;
    for (var i = 0; i < BI_doc.layers.length; i++) {
      if (BI_doc.layers[i].name === BI_LIVE) { BI_doc.layers[i].name = "Bézier Inspector " + (new Date().getTime()); done++; }
    }
    if (!done) return BI_err("Nothing to finalize yet.");
    return "Finalized — overlay kept; live updates stopped.";
  } catch (e) { return BI_err(e.message); }
}

function biClearOverlay() {
  try {
    if (app.documents.length === 0) return BI_err("Open a document first.");
    BI_doc = app.activeDocument;
    BI_clearLive();
    app.redraw();
    return "Cleared live overlay.";
  } catch (e) { return BI_err(e.message); }
}
