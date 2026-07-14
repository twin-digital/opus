---
'@thrashplay/music': minor
---

Split keyboard: two zones with a fixed split point at C4, each playing its own instrument.

The split toggle sits at the top of the sound picker's side column. Turning it on keeps the current
sound in the right hand and puts the GM standard drum kit in the left — B3 keeps the entire GM
standard drum map in reach of the left hand — with the left hand taking the selection, ready for a
kit change; both hands start unmuted at the volume the whole keyboard had. Turning it off collapses
the keyboard to the currently selected side's sound. The side pads below the toggle select which hand the picker edits, ordered
bottom-up to match low-to-high on the piano, and the levels screen orders its fader rows the same
way so each side pad labels its own fader row.

A side wears the family color of its selected instrument, and motion carries split state: with
split on the selected side breathes, the unselected side holds steady, and the toggle cycles left
color → black → right color → black; with split off everything holds steady. Side selection and
the toggle announce themselves ("left hand" / "right hand", "two instruments" / "one instrument");
all spoken feedback shares one `speech` option (previously `speakInstrumentNames`, which now gated
more than names).

Routing lives in `LaunchpadController` as a keyboard route table — `{ key range → channel }`
entries applied to incoming keyboard notes, with whole-keyboard play expressed as a single
full-range route. `Channel` remains a pure mixer strip and plays whatever it is told, so
programmatically fed notes are never range-filtered.

The launcher exposes a program to the render loop only between `initialize()` and `shutdown()`,
so a program switch no longer draws or updates a program that has not finished initializing.
