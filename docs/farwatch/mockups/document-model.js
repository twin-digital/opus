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
      { key: 'fill', label: 'fill', opts: [['#e2d1a3', 'parchment'], ['#d9cca6', 'ledger'], ['#e5d1a0', 'amber'], ['#e8d6a4', 'bright'], ['#d3c59e', 'card'], ['#ece6d2', 'cream']] },
      { key: 'grain', label: 'grain', opts: [['var(--grain-fine)', 'fine'], ['var(--grain-soft)', 'soft'], ['none', 'none']] },
      { key: 'laid', label: 'laid', opts: [['var(--laid-fibre)', 'fibre'], ['none', 'none']] },
      { key: 'glow', label: 'glow', opts: [['var(--glow-candle)', 'candle'], ['var(--glow-candle-soft)', 'candle-soft'], ['none', 'none']] },
      { key: 'tear', label: 'tear', opts: [['var(--tear-torn)', 'torn'], ['var(--tear-deep)', 'deep'], ['none', 'none']] },
      { key: 'absorbency', label: 'absorbency', opts: [['0.15', 'sized · 0.15'], ['0.4', '0.40'], ['0.6', '0.60'], ['0.8', '0.80'], ['1', 'blotter · 1.0']] },
    ] },
    ink: { label: 'Ink', params: [
      { key: 'color', label: 'colour', opts: [['#2c2012', 'sepia'], ['#201f18', 'soot'], ['#5a4a30', 'faded']] },
      { key: 'bleedHue', label: 'bleed hue', opts: [['48 22 8', 'sepia (48 22 8)'], ['20 20 14', 'soot (20 20 14)'], ['60 44 24', 'faded (60 44 24)']] },
      { key: 'flow', label: 'flow', opts: [['0.2', 'stiff · 0.2'], ['0.35', '0.35'], ['0.5', '0.50'], ['0.65', '0.65'], ['0.8', 'watery · 0.8']] },
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
  };

  const PRESETS = {
    paper: {
      'worn-bright': { fill: '#e2d1a3', grain: 'var(--grain-fine)', laid: 'var(--laid-fibre)', glow: 'var(--glow-candle-soft)', tear: 'var(--tear-torn)', absorbency: '0.6' },
      'ledger': { fill: '#d9cca6', grain: 'var(--grain-fine)', laid: 'var(--laid-fibre)', glow: 'var(--glow-candle)', tear: 'var(--tear-deep)', absorbency: '0.8' },
      'card': { fill: '#d3c59e', grain: 'var(--grain-fine)', laid: 'none', glow: 'none', tear: 'var(--tear-torn)', absorbency: '0.4' },
      'cabinet-cream': { fill: '#ece6d2', grain: 'var(--grain-soft)', laid: 'none', glow: 'none', tear: 'var(--tear-torn)', absorbency: '0.4' },
      'clean': { fill: '#e2d1a3', grain: 'none', laid: 'none', glow: 'none', tear: 'none', absorbency: '0.4' },
    },
    ink: {
      'sepia': { color: '#2c2012', bleedHue: '48 22 8', flow: '0.5' },
      'soot': { color: '#201f18', bleedHue: '20 20 14', flow: '0.35' },
      'faded': { color: '#5a4a30', bleedHue: '60 44 24', flow: '0.65' },
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
  };

  // resolve the four entity value-maps → CSS custom properties + the ink-cycle params (or null)
  function compose(vals) {
    const absorb = parseFloat(vals.paper.absorbency), flow = parseFloat(vals.ink.flow);
    const bleed = Math.max(0, absorb * flow);                 // DERIVED: bleed ceiling = absorbency × flow
    const cssVars = {
      '--paper-color': vals.paper.fill,
      '--paper-grain': vals.paper.grain,
      '--paper-laid': vals.paper.laid,
      '--paper-glow': vals.paper.glow,
      '--paper-tear': vals.paper.tear,
      '--paper-ink': vals.ink.color,
      '--ink-bleed-hue': vals.ink.bleedHue,
      '--ink-bloom-blur': (bleed * 1.6).toFixed(2) + 'px',    // ceiling → blur
      '--ink-bloom-alpha': (bleed * 0.9).toFixed(3),          // ceiling → alpha
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
    return { cssVars, occasion, bleed };
  }

  // a sensible starting document (one preset per entity), deep-copied
  function defaultSpec() {
    return {
      paper: Object.assign({}, PRESETS.paper['worn-bright']),
      ink: Object.assign({}, PRESETS.ink['sepia']),
      author: Object.assign({}, PRESETS.author['steward']),
      occasion: Object.assign({}, PRESETS.occasion['measured']),
    };
  }

  return { SCHEMA, PRESETS, compose, defaultSpec };
})();
