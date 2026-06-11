/* ════════════════════════════════════════════════════════════════════════════════════════════
   Farwatch — DOCUMENT MODEL (data + resolver)
   The entity libraries as DATA (not CSS classes) plus the composer. This is the executable form of
   docs/farwatch/document-styling.md:  document = author × occasion × paper × ink.

   - SCHEMA[entity].params : the tunable params for an entity (key + dropdown options) — the UI renders from this
   - PRESETS[entity]       : built-in named option-sets (a value per param)
   - compose(vals)         : resolve the four entities → { cssVars, occasion } (occasion = the ink-cycle P or null)

   Rendering stays CSS: compose() emits custom properties; paper.css + ink.css render from them; the ink cycle
   (ink-cycle.js) renders the text from `occasion`. Derived values (bleed = absorbency × flow) live HERE, in
   script, not in CSS calc().
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const DocModel = (function () {
  const SCHEMA = {
    paper: { label: 'Paper', params: [
      { key: 'fill', label: 'fill', opts: [['#ece4cb', 'vellum · pale'], ['#e2d1a3', 'parchment'], ['#d9cca6', 'rag · cream'], ['#cfc3a0', 'dun · cheap'], ['#d2bf90', 'amber'], ['#ece6d2', 'cream · cool']] },
      { key: 'grain', label: 'grain', opts: [['var(--grain-fine)', 'fine'], ['var(--grain-soft)', 'soft'], ['none', 'none']] },
      { key: 'laid', label: 'laid lines', opts: [['var(--laid-fibre)', 'fibre'], ['var(--laid-faint)', 'faint'], ['none', 'none']] },
      { key: 'chain', label: 'chain lines', opts: [['0', 'none'], ['0.04', 'faint'], ['0.06', 'normal'], ['0.09', 'bold']] },
      { key: 'chainGap', label: 'chain spacing', opts: [['40px', 'close · 40'], ['55px', '55'], ['75px', 'wide · 75']] },
      { key: 'glow', label: 'glow', opts: [['var(--glow-candle)', 'candle'], ['var(--glow-candle-soft)', 'candle-soft'], ['none', 'none']] },
      { key: 'tear', label: 'edge', opts: [['var(--tear-torn)', 'deckle'], ['var(--tear-deep)', 'frayed'], ['none', 'trimmed']] },
      { key: 'absorbency', label: 'absorbency (sizing)', opts: [['0.1', 'vellum · 0.10'], ['0.2', 'hard-sized · 0.20'], ['0.35', 'sized · 0.35'], ['0.5', '0.50'], ['0.65', 'soft · 0.65'], ['0.8', 'unsized · 0.80'], ['1', 'blotter · 1.0']] },
    ] },
    // colour is the SETTLED ink; ageing (fade → brown) is the Condition layer, applied only if `fades`.
    ink: { label: 'Ink', params: [
      { key: 'color', label: 'colour', opts: [['#2c2012', 'iron-gall · brown-black'], ['#201f18', 'carbon · near-black'], ['#7a2f25', 'rubric · red'], ['#1e2530', 'just-inked · blue-black (wet)']] },
      { key: 'bleedHue', label: 'bleed hue', opts: [['48 22 8', 'brown-black'], ['20 20 14', 'soot'], ['90 40 30', 'red'], ['30 37 48', 'blue-black']] },
      { key: 'flow', label: 'flow', opts: [['0.2', 'stiff · 0.2'], ['0.35', 'carbon · 0.35'], ['0.5', '0.50'], ['0.6', 'iron-gall · 0.6'], ['0.8', 'watery · 0.8']] },
      { key: 'fades', label: 'fades with age', opts: [['1', 'yes — iron gall'], ['0', 'no — carbon / pigment']] },
    ] },
    author: { label: 'Author', params: [
      { key: 'face', label: 'face', opts: [['var(--face-garamond)', 'EB Garamond'], ['var(--face-cormorant)', 'Cormorant Garamond'], ['var(--face-newsreader)', 'Newsreader'], ['var(--face-fraunces)', 'Fraunces'], ['var(--face-crimson)', 'Crimson Pro'], ['var(--face-spectral)', 'Spectral']] },
      { key: 'weight', label: 'weight', opts: [['200', '200'], ['300', '300'], ['400', '400'], ['500', '500'], ['600', '600'], ['700', '700']] },
      { key: 'size', label: 'size', opts: [['0.95rem', '0.95rem'], ['1rem', '1.0rem'], ['1.05rem', '1.05rem'], ['1.1rem', '1.1rem'], ['1.2rem', '1.2rem'], ['1.35rem', '1.35rem']] },
    ] },
    occasion: { label: 'Occasion', params: [
      { key: 'cycle', label: 'ink cycle', opts: [['on', 'on'], ['off', 'off (clean)']] },
      { key: 'dip', label: 'dip length', opts: [['30-55', 'short · 30–55'], ['45-80', 'medium · 45–80'], ['60-100', 'long · 60–100'], ['100-160', 'very long']] },
      { key: 'floor', label: 'floor', opts: [['0.2', '0.20 — dry'], ['0.3', '0.30'], ['0.42', '0.42'], ['0.55', '0.55'], ['0.7', '0.70 — wet']] },
      { key: 'stroke', label: 'weight range', opts: [['0', '0'], ['0.18', '0.18'], ['0.22', '0.22'], ['0.3', '0.30'], ['0.4', '0.40']] },
      { key: 'opacity', label: 'darkness floor', opts: [['0.7', '0.70'], ['0.8', '0.80'], ['0.9', '0.90'], ['0.96', '0.96']] },
      { key: 'blobPara', label: 'para blob', opts: [['0', '0'], ['0.16', '0.16'], ['0.25', '0.25'], ['0.35', '0.35']] },
      { key: 'blobDip', label: 'dip blob', opts: [['0', '0'], ['0.06', '0.06'], ['0.12', '0.12']] },
      { key: 'walk', label: 'walk', opts: [['0', '0'], ['0.03', '0.03'], ['0.05', '0.05'], ['0.08', '0.08'], ['0.12', '0.12']] },
    ] },
    // CONDITION — the second layer: not an ingredient, a modifier applied AFTER composition (see weather()).
    // age is NON-LINEAR in time — iron-gall degradation front-loads, so a few centuries already shows "a lot".
    condition: { label: 'Condition', params: [
      { key: 'age', label: 'age', opts: [['0', 'fresh'], ['0.12', 'a few years'], ['0.38', 'decades · ~75y'], ['0.72', 'centuries · ~350y'], ['1', 'ancient · 1000y+']] },
    ] },
  };

  const PRESETS = {
    // historically grounded: skin (vellum, no laid, low absorbency) vs sized laid rag (everyday) vs cheap/aged.
    // See docs/farwatch/document-styling.md → "Paper" and the paper-history discussion.
    paper: {
      'charter (vellum)': { fill: '#ece4cb', grain: 'var(--grain-soft)', laid: 'none', chain: '0', chainGap: '55px', glow: 'var(--glow-candle-soft)', tear: 'none', absorbency: '0.1' },        // skin — no mould, no laid/chain; the writ/charter
      'chronicle (laid rag)': { fill: '#e2d1a3', grain: 'var(--grain-fine)', laid: 'var(--laid-fibre)', chain: '0.06', chainGap: '55px', glow: 'var(--glow-candle-soft)', tear: 'var(--tear-torn)', absorbency: '0.35' }, // good sized rag — full mould grid
      'ledger (hard rag)': { fill: '#d9cca6', grain: 'var(--grain-fine)', laid: 'var(--laid-fibre)', chain: '0.06', chainGap: '55px', glow: 'var(--glow-candle-soft)', tear: 'var(--tear-torn)', absorbency: '0.2' },     // hard-sized so numbers stay crisp
      'field (cheap rag)': { fill: '#cfc3a0', grain: 'var(--grain-fine)', laid: 'var(--laid-fibre)', chain: '0.06', chainGap: '40px', glow: 'none', tear: 'var(--tear-deep)', absorbency: '0.8' },      // poor/unsized — coarse close mould; a hasty report
      'cabinet (cool)': { fill: '#ece6d2', grain: 'var(--grain-soft)', laid: 'none', chain: '0', chainGap: '55px', glow: 'none', tear: 'var(--tear-torn)', absorbency: '0.35' },                     // a cool, refined fine stock — the cabinet wildcard
    },
    // each ink is ONE ink — its colour is the settled, as-used colour. Ageing (iron-gall fading to brown) is the
    // Condition layer, not a variant. (The transient blue-black "just-inked" state is a future *wet* condition.)
    ink: {
      'iron-gall': { color: '#2c2012', bleedHue: '48 22 8', flow: '0.5', fades: '1' },              // settled brown-black; the canonical document ink — age fades it to brown
      'carbon (lampblack)': { color: '#201f18', bleedHue: '20 20 14', flow: '0.35', fades: '0' },   // dense matte black; pigment — colour-stable, low feather
      'rubric (red)': { color: '#7a2f25', bleedHue: '90 40 30', flow: '0.5', fades: '0' },          // vermilion/red-lead — headings & emphasis (the accent tradition)
    },
    author: {
      'steward': { face: 'var(--face-garamond)', weight: '400', size: '1.1rem' },
      'scribe': { face: 'var(--face-cormorant)', weight: '300', size: '1.2rem' },
      'clerk': { face: 'var(--face-newsreader)', weight: '400', size: '1rem' },
      'monk': { face: 'var(--face-spectral)', weight: '400', size: '1.05rem' },
      'scholar': { face: 'var(--face-crimson)', weight: '400', size: '1.1rem' },
    },
    occasion: {
      'measured': { cycle: 'on', dip: '45-80', floor: '0.3', stroke: '0.3', opacity: '0.9', blobPara: '0.16', blobDip: '0', walk: '0.03' },
      'heavy': { cycle: 'on', dip: '45-80', floor: '0.3', stroke: '0.22', opacity: '0.9', blobPara: '0.35', blobDip: '0', walk: '0.03' },
      'calm': { cycle: 'on', dip: '60-100', floor: '0.55', stroke: '0.22', opacity: '0.96', blobPara: '0.16', blobDip: '0', walk: '0.03' },
      'hasty': { cycle: 'on', dip: '30-55', floor: '0.2', stroke: '0.22', opacity: '0.8', blobPara: '0.35', blobDip: '0.06', walk: '0.08' },
      'clean (no cycle)': { cycle: 'off', dip: '45-80', floor: '0.3', stroke: '0.22', opacity: '0.9', blobPara: '0.16', blobDip: '0', walk: '0.03' },
    },
    condition: {
      'fresh': { age: '0' },
      'a few years': { age: '0.12' },
      'decades': { age: '0.38' },
      'centuries': { age: '0.72' },
      'ancient': { age: '1' },
    },
  };

  // ── colour helpers (the weathering maths lives in script, not CSS) ──
  const hexToRgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const rgbToHex = (r) => '#' + r.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpHex = (hex, rgb2, k) => { const a = hexToRgb(hex); return rgbToHex([lerp(a[0], rgb2[0], k), lerp(a[1], rgb2[1], k), lerp(a[2], rgb2[2], k)]); };
  const lerpChan = (str, rgb2, k) => { const a = str.split(' ').map(Number); return [lerp(a[0], rgb2[0], k), lerp(a[1], rgb2[1], k), lerp(a[2], rgb2[2], k)].map((x) => Math.round(x)).join(' '); };
  const PAPER_BROWN = [162, 110, 56];  // where paper drifts with age — an amber-orange (foxed/oxidised)
  const INK_BROWN = [120, 92, 56];     // where fade-prone iron-gall drifts — a clear mid-brown (not near-black)

  // resolve composition → CSS vars + ink-cycle params, THEN weather by the Condition layer (age).
  // Age is a modifier applied AFTER composition; its effect is conditional on the materials
  // (iron-gall fades, carbon doesn't; sizing degrades so absorbency creeps up; the edge frays).
  function compose(vals) {
    const age = parseFloat((vals.condition && vals.condition.age) || '0');   // age = time SINCE WRITTEN
    const fades = vals.ink.fades === '1';
    // weather the materials. NOTE on absorbency: feathering is locked in at WRITE-TIME (the ink fed into the
    // paper as it was then), so age does NOT raise it — an old document feathered on then-fresh paper. (Writing
    // *new* ink on already-old paper is a separate scenario — a future "paper age at writing" control.)
    const fill = lerpHex(vals.paper.fill, PAPER_BROWN, age * 0.5);                 // paper oranges over time
    const inkColor = fades ? lerpHex(vals.ink.color, INK_BROWN, age * 0.7) : vals.ink.color;  // iron-gall fades to brown
    const bleedHue = fades ? lerpChan(vals.ink.bleedHue, INK_BROWN, age * 0.7) : vals.ink.bleedHue;
    const tear = (age >= 0.65 && vals.paper.tear !== 'none') ? 'var(--tear-deep)' : vals.paper.tear; // frays by centuries
    const bleed = Math.max(0, parseFloat(vals.paper.absorbency) * parseFloat(vals.ink.flow));  // ceiling = absorbency × flow (write-time)
    // INK BURN — acidic iron-gall corroding its own page: a rusty halo bleeding from the strokes. Gated on
    // fades × ADVANCED age (carbon never burns; corrosion is a long-timescale process). Eating-through
    // (cracks/holes) is not yet modelled — this is the stain halo only.
    const burnK = fades ? Math.max(0, Math.min(1, (age - 0.25) / 0.75)) : 0;  // faint by decades, strong by centuries
    // a DIFFUSE stain over the inked region — no tight inner ring (which would trace each glyph); large soft
    // radii merge between strokes into a brown haze. The ink fill stays sharp (text-shadow doesn't touch it).
    const burn = burnK <= 0 ? '0 0 0 transparent'
      : '0 0 ' + (5 + burnK * 5).toFixed(1) + 'px rgba(80,44,20,' + (burnK * 0.65).toFixed(2) + '), '
        + '0 0 ' + (12 + burnK * 12).toFixed(1) + 'px rgba(88,54,28,' + (burnK * 0.45).toFixed(2) + '), '
        + '0 0 ' + (24 + burnK * 22).toFixed(1) + 'px rgba(94,60,34,' + (burnK * 0.26).toFixed(2) + ')';
    const cssVars = {
      '--paper-color': fill,
      '--paper-grain': vals.paper.grain,
      '--paper-laid': vals.paper.laid,
      '--paper-chain-alpha': vals.paper.chain || '0',          // chain is its own layer, independent of laid
      '--paper-chain-gap': vals.paper.chainGap || '55px',
      '--paper-glow': vals.paper.glow,
      '--paper-tear': tear,
      '--paper-ink': inkColor,
      '--ink-bleed-hue': bleedHue,
      '--ink-bloom-blur': (bleed * 1.6).toFixed(2) + 'px',
      '--ink-bloom-alpha': (bleed * 0.9).toFixed(3),
      '--ink-burn': burn,
      '--ink-family': vals.author.face,
      '--ink-weight': vals.author.weight,
      '--ink-size': vals.author.size,
    };
    const o = vals.occasion;
    const occasion = (o.cycle === 'off') ? null : {
      dipMin: parseFloat(o.dip.split('-')[0]), dipMax: parseFloat(o.dip.split('-')[1]),
      floor: parseFloat(o.floor), strokeMax: parseFloat(o.stroke), opacityMin: parseFloat(o.opacity),
      blobPara: parseFloat(o.blobPara), blobDip: parseFloat(o.blobDip), walk: parseFloat(o.walk),
    };
    return { cssVars, occasion, bleed, age };
  }

  // ════════════════ CATEGORIES — a category is a DISTRIBUTION; a preset is just a width-0 one ════════════════
  // The uniform library model: where PRESETS pin one value per param, a CATEGORY gives each param a SAMPLER, and
  // sample(entity, category, seed) draws a concrete option-set (the same shape compose() eats). This is the
  // SEPARATE STAGE in front of the resolver — sampling (category + seed → spec) then compose(spec) → CSS, both
  // unchanged. A "pinned" param is just a constant sampler, so presets are the degenerate case of categories.
  //
  // A param's sampler is, by shape:
  //   constant            → used as-is (a pinned axis)
  //   { range:[a,b], unit?, dp? } → CONTINUOUS float (absorbency, chain alpha/gap) — formatted to a string
  //   { pick:{ value: weight, … } }   → DISCRETE weighted choice (grain/laid/tear) — keys are the CSS values
  //   { color:'#hex', h?, s?, l? }    → fill jittered in HSL by ±h/±s/±l (tone wander, hue ~stable — NOT raw-RGB
  //                                      jitter, which drifts muddy/green)
  // Same seed → same draw: an FNV-1a hash seeds mulberry32, and params are drawn IN KEY ORDER, so a document's id
  // as the seed makes that document look identical every open while no two in the world match.
  const CATEGORIES = {
    paper: {
      // ~one artisan-batch of hard-sized ledger stock: the 'ledger (hard rag)' preset opened into a band.
      'ledger (hard rag)': {
        fill: { color: '#d9cca6', h: 0.012, s: 0.05, l: 0.05 },   // small tone wander; hue near-fixed (warm cream)
        grain: { pick: { 'var(--grain-fine)': 0.7, 'var(--grain-soft)': 0.3 } },
        laid: { pick: { 'var(--laid-fibre)': 0.7, 'var(--laid-faint)': 0.3 } },
        chain: { range: [0.04, 0.07], dp: 3 },
        chainGap: { range: [50, 60], unit: 'px', dp: 0 },
        glow: 'var(--glow-candle-soft)',
        tear: { pick: { 'var(--tear-torn)': 0.8, 'var(--tear-deep)': 0.2 } },
        absorbency: { range: [0.15, 0.26], dp: 2 },
      },
    },
  };

  // ── seeded sampling machinery (mirrors ink-cycle.js: FNV-1a → mulberry32, deterministic per seed) ──
  const hashSeed = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const rgbToHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0, s = 0; const l = (mx + mn) / 2; if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; };
  const hslToRgb = ([h, s, l]) => { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const hk = (t) => { t = ((t % 1) + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; return [hk(h + 1 / 3) * 255, hk(h) * 255, hk(h - 1 / 3) * 255]; };
  const weightedPick = (obj, rng) => { const ks = Object.keys(obj); let tot = 0; for (const k of ks) tot += obj[k]; let r = rng() * tot; for (const k of ks) { r -= obj[k]; if (r <= 0) return k; } return ks[ks.length - 1]; };
  function drawParam(spec, rng) {
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      if ('range' in spec) { const [a, b] = spec.range; const v = a + (b - a) * rng(); return spec.unit ? v.toFixed(spec.dp ?? 2) + spec.unit : v.toFixed(spec.dp ?? 2); }
      if ('pick' in spec) return weightedPick(spec.pick, rng);
      if ('color' in spec) { const c = rgbToHsl(hexToRgb(spec.color)); const j = (r) => (rng() * 2 - 1) * (r || 0); return rgbToHex(hslToRgb([c[0] + j(spec.h), clamp01(c[1] + j(spec.s)), clamp01(c[2] + j(spec.l))])); }
    }
    return spec; // constant → a pinned axis
  }
  // sample(entity, categoryName, seed) → a concrete option-set for that entity (or null if no such category).
  function sample(entity, name, seed) {
    const cat = CATEGORIES[entity] && CATEGORIES[entity][name];
    if (!cat) return null;
    const rng = mulberry32(hashSeed(entity + '/' + name + '/' + seed));
    const out = {};
    for (const key of Object.keys(cat)) out[key] = drawParam(cat[key], rng); // key order = stable draw order
    return out;
  }

  // a sensible starting document (one preset per entity), deep-copied
  function defaultSpec() {
    return {
      paper: Object.assign({}, PRESETS.paper['chronicle (laid rag)']),
      ink: Object.assign({}, PRESETS.ink['iron-gall']),
      author: Object.assign({}, PRESETS.author['steward']),
      occasion: Object.assign({}, PRESETS.occasion['measured']),
      condition: Object.assign({}, PRESETS.condition['fresh']),
    };
  }

  return { SCHEMA, PRESETS, CATEGORIES, compose, sample, defaultSpec };
})();
