---
'@thrashplay/music': minor
---

Sound picker: drum kits are selectable as a third family row, and oversized families use a packed layout.

- The family selector spans three rows (screen rows 7–5), with Drum Kit in the 17th slot; the instrument area shrinks to five rows (4–0).
- Drum Kit and Sound Effect instruments are packed in data order (left-to-right, filling rows downward) instead of being positioned by patch column and bank-LSB row, which had scattered sparse drum-kit patches off-grid and made the deepest four Sound Effect rows unreachable. Train, Jetplane, and Starship are reachable for the first time; Burst Noise is dropped to fit the 40-slot area.
- Sound selection sends the instrument's bank MSB (120 for drum kits) before the program change instead of hardcoding the GM2 melodic bank (121).
