---
'@thrashplay/music': minor
---

Add the Play My Note game and in-screen game selection to Musical Exercise. Games live in a
registry (`games.ts`) with a name, identity color, and challenge factory; the right-edge column
lights one pad per game (identity color, green when active), pressing one abandons the current
challenge — including its queued audio — announces the game name via text-to-speech, and starts
the new game once the announcement finishes. The active game's identity color also lights the
playfield's four corners, recomposed every frame so feedback effects can't permanently cover
them.

Play My Note (the default game) wires up the existing `SingleNoteEarTraining` challenge: one
note plays (drawn from the natural notes of the octave starting at middle C), and only the exact
matching pitch is correct. Wrong answers get spoken feedback naming the played note and pointing
at the target — "C. My note is higher!" — via a new `getVerbalFeedback` hook on challenges: the
state machine records the last response, snapshots the phrase at judgment time, and gates the
next round on both the feedback audio and the speech finishing.
