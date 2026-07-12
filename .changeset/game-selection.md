---
'@thrashplay/music': minor
---

Add the Perfect Pitch game and in-screen game selection to Musical Exercise. Games live in a
registry (`games.ts`) with a name, identity color, and challenge factory; the right-edge column
lights one pad per game (identity color, green when active), pressing one abandons the current
challenge, announces the game name via text-to-speech, and starts the new game. The active game's
identity color also fills the playfield's top row, so the grid itself shows which game is running.
Perfect Pitch wires up the existing `SingleNoteEarTraining` challenge: one note plays, and only
the exact matching pitch is correct.
