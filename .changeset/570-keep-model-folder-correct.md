---
'@thrashplay/wishem-host-nodejs': patch
---

The process does not write `state.json` while the definitions of the store differ from the files in `definitions`. A model folder that the process writes always starts again.
