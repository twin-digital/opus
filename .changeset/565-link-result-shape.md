---
'@thrashplay/wishem-hub': patch
---

The link client ends the link for a `result` message with a `result` that is not a valid submit result: `ok: true` needs a `seq` that is an integer from 0 to 2^53 - 1, and `ok: false` needs a known `reason` and a list `problems`. `LINK.md` lists these rules as malformed messages. A new rejection reason needs a new protocol version.
