/* ════════════════════════════════════════════════════════════════════════════════════════════
   Farwatch — INK CYCLE (shared model)
   A reservoir model of quill ink: fresh after a dip (dark + slightly heavy), depleting as you write
   (thin + pale), re-dipping at word boundaries. Per WORD only — so kerning is preserved. Maps onto two
   web knobs: text-stroke = weight, opacity = ink darkness.

   DETERMINISTIC: the RNG is seeded from the TEXT, so a given passage always inks the same way every
   render / reload — no more "the same document looks different each time."

   API:
     InkCycle.get(key)            → the params object for a preset ('light' | 'heavy'), or null
     InkCycle.block(html, P)      → ink one HTML block (inline tags preserved); fresh dip; seeded from its text
     InkCycle.paras(arr, P)       → ink an array of paragraph HTML strings as one reservoir (dip per paragraph)
   P is a params object (see PRESETS for the shape). Pass null/undefined to return the text unchanged.
   See docs/farwatch/ui-design.md → "Ink cycle".
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const InkCycle = (function () {
  const PRESETS = {
    light: { name: 'Light', dipMin: 45, dipMax: 80, floor: 0.30, strokeMax: 0.30, opacityMin: 0.90, blobPara: 0.16, blobDip: 0, walk: 0.03 },
    heavy: { name: 'Heavy', dipMin: 45, dipMax: 80, floor: 0.30, strokeMax: 0.22, opacityMin: 0.90, blobPara: 0.35, blobDip: 0, walk: 0.03 },
  };

  // FNV-1a string hash → 32-bit seed; deterministic per text
  const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // mulberry32 — small seeded PRNG
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  function makeCtx(P, seed) {
    const rng = mulberry32(seed);
    const rndCap = () => P.dipMin + rng() * (P.dipMax - P.dipMin);
    let used = 0, cap = rndCap(), freshBlob = P.blobPara, walk = 0;
    return {
      levelNow() {
        const frac = Math.min(1, used / cap);
        const lvl = 1 - frac * (1 - P.floor);
        walk = Math.max(-0.08, Math.min(0.08, walk + (rng() * 2 - 1) * P.walk));
        return lvl + walk + freshBlob;
      },
      styleFor(lvl) {
        const L = Math.max(0, Math.min(1.12, lvl));
        const stroke = (P.strokeMax * L).toFixed(3);                     // weight tracks the reservoir
        const op = (P.opacityMin + (1 - P.opacityMin) * Math.min(1, L)).toFixed(3); // darkness (also dims the halo's alpha)
        // bloom rides the reservoir too: halo BLUR = the ink-bleed dial's blur × level (the alpha tracks via opacity).
        // The bleed dial (--ink-bloom-blur/alpha) is the bloom at FULL ink; this scales it down for dry marks.
        const bloom = '0 0 calc(var(--ink-bloom-blur, 0.7px) * ' + L.toFixed(3) + ') rgb(var(--ink-bleed-hue, 48 22 8) / var(--ink-bloom-alpha, 0.5))';
        return '-webkit-text-stroke:' + stroke + 'px currentColor;opacity:' + op + ';text-shadow:' + bloom + ';';
      },
      deplete(n) { freshBlob = 0; used += n; },
      dip(blob) { used = 0; cap = rndCap(); freshBlob = blob; walk *= 0.4; },
      maybeDip() { if (used >= cap) this.dip(P.blobDip); },
    };
  }

  // ink an HTML string (inline tags passed through untouched); words wrapped in styled spans
  function inkHTML(html, ctx) {
    let out = '';
    for (const part of html.split(/(<[^>]+>)/)) {
      if (part === '') continue;
      if (part.charAt(0) === '<') { out += part; continue; }   // a tag — leave it
      for (const tok of part.split(/(\s+)/)) {
        if (tok === '') continue;
        if (/^\s+$/.test(tok)) { out += tok; continue; }        // a space — never inside a styled span
        out += '<span style="' + ctx.styleFor(ctx.levelNow()) + '">' + tok + '</span>';
        ctx.deplete(tok.length);
        ctx.maybeDip();                                          // dips land only at word boundaries
      }
    }
    return out;
  }

  function block(html, P) {
    if (!P) return html;
    const ctx = makeCtx(P, hashStr(html));
    ctx.dip(P.blobPara);
    return inkHTML(html, ctx);
  }
  function paras(arr, P) {
    if (!P) return arr.slice();
    const ctx = makeCtx(P, hashStr(arr.join('')));
    return arr.map((html) => { ctx.dip(P.blobPara); return inkHTML(html, ctx); }); // fresh dip per paragraph
  }

  return { PRESETS, get: (k) => PRESETS[k] || null, block, paras };
})();
