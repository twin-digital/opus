---
'@thrashplay/fw-chronicler': minor
'@thrashplay/farwatch': patch
---

chronicler: a per-adventure diversity palette to break setting mode-collapse.

Left to its own devices each model collapses every adventure onto one prototype setting (an ossuary, a drowned vault) however varied the facts. `derivePalette(adventure)` rolls a hint — a biome, a scale, its inhabitants, and an _adventure type_ (heist / hunt / mystery / rescue / …) derived from the goal kind or dominant approach — deterministically from the adventure (a stable hash, so a seed always yields the same palette), drawn from an editable `palette.yaml`. The **framing-and-texture** treatment is given the palette as raw material to react to, de-clustering the settings it authors. How hard the hint is imposed is itself an A/B axis: the new `grounding` snippet (`strict` hard-anchors onto the palette and resists reverting to the prototype, `loose` offers it as a suggestion). The inspector supplies the palette as a standard input, so any pipeline can bind it.
