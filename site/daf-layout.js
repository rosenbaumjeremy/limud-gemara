"use strict";
// Lays out an amud the way the Vilna Shas does: the Gemara in the middle, Rashi on the
// inner side (toward the binding), Tosafot on the outer side, and the commentaries
// wrapping around the Gemara.
//
// Adapted from daf-renderer (https://github.com/GT-Jewish-DH/daf-renderer),
// MIT License, Copyright (c) 2020 Dan Jutan, Shaun Regenbaum. The "spacer" algorithm below
// is theirs. Changes here: the styles live in app.css (this site's CSP blocks the <style>
// tag the library injects), the variables are set on the page's own element rather than
// on a shared stylesheet, and the caller passes DOM nodes, so the words stay clickable.
//
// How it works: the three texts sit in three stacked, absolutely positioned layers. Each
// layer has invisible floated "spacer" boxes, and the text flows around them. The
// algorithm measures each text's area and sets the spacers' heights so that the three
// texts meet like a printed page: four lines of commentary over the top, the Gemara in
// the middle column, and whichever text is longest running under the rest.

const DafLayout = (() => {
  // How much room a text needs at a given width: its height times that width.
  function areaOf(html, font, size, width, lineHeight, dummy) {
    const test = document.createElement("div");
    test.style.font = `${size}px ${font}`;
    test.style.width = `${width}px`;
    test.style.lineHeight = `${lineHeight}px`;
    test.innerHTML = html;
    dummy.append(test);
    const area = test.clientHeight * test.clientWidth;
    test.remove();
    return area;
  }

  // Heights for the spacers (px), or null when there isn't enough commentary to make a page.
  function spacerHeights(html, o, dummy) {
    const midWidth = o.width * o.mainWidth - 2 * o.padH;    // the Gemara's column
    const topWidth = o.width * o.halfway - o.padH;          // each commentary, over the top
    const sideWidth = o.width * (1 - o.mainWidth) / 2;      // each commentary, at the side
    const sp = { start: 4.3 * o.lh.side, inner: 0, outer: 0, end: 0, exception: 0 };
    const topArea = 4 * o.lh.side * topWidth;               // the four lines over the top

    const text = (name, width, lh, area) => ({ name, width, lh, area });
    const main = text("main", midWidth, o.lh.main, areaOf(html.main, o.font.main, o.size.main, midWidth, o.lh.main, dummy));
    const outer = text("outer", sideWidth, o.lh.side, areaOf(html.outer, o.font.side, o.size.side, sideWidth, o.lh.side, dummy) - topArea);
    const inner = text("inner", sideWidth, o.lh.side, areaOf(html.inner, o.font.side, o.size.side, sideWidth, o.lh.side, dummy) - topArea);
    const texts = [main, outer, inner];
    for (const t of texts) {
      t.height = t.area / t.width;
      t.fullArea = t.area + topArea;
      t.fullHeight = t.fullArea / t.width;
    }
    const byHeight = texts.slice().sort((a, b) => a.height - b.height);

    if (inner.height <= 0 && outer.height <= 0) return null;                    // no commentary
    if (inner.height <= sp.start && outer.height <= sp.start) return null;      // not enough for four lines

    // One commentary is too short for its four lines: the other takes the whole top.
    if (inner.fullHeight <= sp.start) {
      sp.inner = inner.fullHeight;
      sp.outer = (outer.fullArea - o.width * 4 * o.lh.side) / sideWidth;
      sp.exception = 1;
      return sp;
    }
    if (outer.fullHeight <= sp.start) {
      sp.outer = outer.fullHeight;
      sp.inner = (inner.fullArea - o.width * 4 * o.lh.side) / sideWidth;
      sp.exception = 2;
      return sp;
    }

    // "Double-wrap": the Gemara is shortest, and both commentaries wrap under it.
    if (byHeight[0] === main) {
      sp.inner = sp.outer = main.area / midWidth;
      const sideArea = sp.inner * sideWidth + sideWidth * o.padV;
      sp.end = (byHeight[1].area - sideArea) / topWidth;
      return sp;
    }
    // "Stairs": the Gemara and the shorter commentary form a block; the longer
    // commentary (the stair) runs under it.
    const blockArea = main.area + byHeight[0].area;
    const blockWidth = midWidth + sideWidth;
    const blockHeight = blockArea / blockWidth;
    const stair = byHeight[1] === main ? byHeight[2] : byHeight[1];
    if (blockHeight < stair.area / stair.width) {
      const smallest = byHeight[0];
      sp[smallest.name] = smallest.height;
      sp[stair.name] = (blockArea - o.padH * (blockHeight - sp[smallest.name])) / blockWidth;
      return sp;
    }
    // "Double-extend": the Gemara is longest and runs under both commentaries.
    sp.inner = inner.height;
    sp.outer = outer.height;
    return sp;
  }

  const div = (cls, parent) => { const d = document.createElement("div"); d.className = cls; parent.append(d); return d; };
  const htmlOf = node => { const d = document.createElement("div"); d.append(node.cloneNode(true)); return d.innerHTML; };

  // Lay out {main, inner, outer} (DOM nodes) in root. Returns false when the texts can't
  // make a page (too little commentary); root is then left empty.
  function render(root, nodes, amudB, o) {
    root.replaceChildren();
    root.classList.add("dr-root");
    const layers = {};
    for (const name of ["outer", "inner", "main"]) {
      const layer = div("dr-" + name, root);
      const spacers = name === "main" ? ["start", "innerMid", "outerMid"] : ["start", "mid", "end"];
      for (const s of spacers) div("dr-spacer dr-" + s, layer);
      layers[name] = document.createElement("span");
      div("dr-text", layer).append(layers[name]);
    }
    const dummy = div("dr-dummy", root);

    const set = (key, value) => root.style.setProperty("--" + key, value);
    set("contentWidth", o.width + "px");
    set("mainWidth", o.mainWidth * 100 + "%");
    set("halfway", o.halfway * 100 + "%");
    set("padding-horizontal", o.padH + "px");
    set("padding-vertical", o.padV + "px");
    set("fontFamily-main", o.font.main);
    set("fontFamily-side", o.font.side);
    set("fontSize-main", o.size.main + "px");
    set("fontSize-side", o.size.side + "px");
    set("lineHeight-main", o.lh.main + "px");
    set("lineHeight-side", o.lh.side + "px");
    // Rashi sits toward the binding: on the right of amud a, the left of amud b
    set("innerFloat", amudB ? "right" : "left");
    set("outerFloat", amudB ? "left" : "right");

    const sp = spacerHeights({ main: htmlOf(nodes.main), inner: htmlOf(nodes.inner), outer: htmlOf(nodes.outer) }, o, dummy);
    dummy.remove();
    if (!sp) { root.replaceChildren(); root.classList.remove("dr-root"); return false; }

    for (const k of ["start", "inner", "outer", "end"]) set("spacerHeights-" + k, Math.max(0, sp[k]) + "px");
    const pad = o.sidePad + "px";
    const edge = {
      0: { hasInnerStartGap: "0", hasOuterStartGap: "0", innerStartWidth: "50%", outerStartWidth: "50%", innerPadding: pad, outerPadding: pad },
      1: { hasInnerStartGap: "1", hasOuterStartGap: "0", innerStartWidth: "100%", outerStartWidth: "0%", innerPadding: "0px", outerPadding: "0px" },
      2: { hasInnerStartGap: "0", hasOuterStartGap: "1", innerStartWidth: "0%", outerStartWidth: "100%", innerPadding: "0px", outerPadding: "0px" },
    }[sp.exception];
    for (const [k, v] of Object.entries(edge)) set(k, v);

    layers.main.append(nodes.main);
    layers.inner.append(nodes.inner);
    layers.outer.append(nodes.outer);
    root.style.height = Math.max(...[...root.children].map(c => c.offsetHeight)) + "px";
    return true;
  }

  return { render };
})();
