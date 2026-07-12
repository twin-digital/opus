---
'@thrashplay/music': minor
'@thrashplay/launchpad-sim': minor
'@twin-digital/opus-scripts': minor
---

Import the music project (Launchpad Mini Mk3 music-learning games) as `nodejs/music`:
`@thrashplay/music` (MIDI device layer, Launchpad driver, program engine, and game programs) and
`@thrashplay/launchpad-sim` (browser-based hardware simulator). `@thrashplay/music` is published
with a `music` bin, so the studio machine runs it via `npx @thrashplay/music@latest` instead of
checking out the monorepo. opus-scripts gains a vite builder: `build` dispatches to `vite build`
for packages with a `vite.config.*`, ahead of the tsc fallback.
