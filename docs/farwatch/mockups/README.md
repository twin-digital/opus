# Farwatch — UI mockups

Visual mockups of the Farwatch player interface — standalone HTML, rendered in real tokens (type, colour,
spacing) so candidate **moods** can be compared as *renderings*, not prose. They realise the surfaces
specified in [../ui-design.md](../ui-design.md); the look-and-feel they explore is the parked brief at the
end of that doc.

There will be several. Each file renders the same surface(s) in a different candidate mood so the choice
is made from real comparison.

## The first canvas

The **Desk + a Missive** (the reading crux) — the richest, most mood-revealing pair, since paced prose
arriving like correspondence is the whole look-and-feel question.

## Candidate moods to compare

- **austere / monastic** — cold stone, severe
- **warm / romantic** — candlelit, illuminated-manuscript
- **starker** — than either

**Render as apprehension, not a room.** The desk is the patron's perception
([../metaphysics.md](../metaphysics.md)), so every mood must evoke its materials — parchment, ink,
candlelight — *without asserting photoreal, solid furniture*. Photoreal solidity would smuggle back the
body the metaphysics deliberately leaves open; materials should read as luminous, coalescing
apprehension that assembles on waking and dissolves on sealing.

## Viewing

```
./serve.sh            # serves this dir on :8173, bound 0.0.0.0
./serve.sh 9000       # or pick a port
```

Then open the forwarded port (VS Code Dev Containers usually auto-forwards it) and browse to
`index.html`, which links the three moods. Each file is self-contained, so you can also just open the
`.html` directly.

## Conventions

- One self-contained `.html` per mockup (inline CSS, system fonts; no build step).
- Name by surface + mood, e.g. `desk-missive.austere.html`.
- `index.html` is the landing page; `serve.sh` serves the dir.
- Mockups are throwaway exploration; the **spec** is `ui-design.md`, not these files.
