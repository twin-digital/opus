---
'@thrashplay/music': patch
---

Fix the sound picker's initial instrument selection never reaching the piano, and give channels an
identity that does not depend on MIDI.

`Channel.id` returned the channel's MIDI channel number, so the first channel's id was 3 rather
than 0 — the MIDI channels backing the controller are neither zero-based nor contiguous, since 9 is
skipped as the General MIDI percussion channel. The picker's setup addressed channels by their
position in the channel list, which meant `channelById` matched nothing: the opening program change
was silently dropped, and the selected family and instrument were recorded under a key that nothing
ever read.

A channel's id is now its position in the channel list, which is what the UI already assumed and
what `ChannelState` — the view model the grid components consume — was always shaped for. The MIDI
channel stays inside `Channel`, as the transport detail it is, and is no longer part of the view
model, which nothing was reading anyway. This also lets a channel exist without a meaningful MIDI
channel at all.

`ChannelId` is branded, so the confusion that caused the bug is now a compile error rather than a
silent mismatch: a raw number, such as an array index, can no longer be passed where a channel id
is expected. Channel logs carry both numbers (`[CHANNEL#0 midi=3]`), since the MIDI channel is
still what appears on the wire.
