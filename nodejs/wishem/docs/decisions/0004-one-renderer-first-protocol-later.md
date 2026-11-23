# 0004. One renderer first, protocol later

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

A game uses one renderer behind an adapter. The game model imports nothing from the renderer, and a simulation runs with no window. No wire protocol between the model and the renderer is built now.

If a renderer in another engine is wanted later, a protocol is extracted along the line between the model and the adapter.

## Reason

This keeps every benefit for the agent: rerun, fast tests with no window, and a model that the agent can read. It drops the most expensive part of the starting notes. The owner accepted this option.

## Rejected alternatives

- **A wire protocol from the first day, with a second client to keep it honest.** This keeps Unity and Godot clients possible at once. It delays every part that makes Wishem different.
- **One renderer with no intention of a later protocol.** Rule R1 already keeps the later protocol possible, so nothing is saved.

## Consequences

- The study of client levels, latency, and bandwidth in the starting notes is input for the parked roadmap project 7.
- Export of a game to a native project in another engine is a separate, later idea.
