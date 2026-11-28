---
'@thrashplay/wishem-workbench': patch
'@thrashplay/wishem-workbench-app': patch
'@thrashplay/wishem-host-nodejs': patch
---

Ctrl+C on the `start` scripts of the workbench and of the workbench app ends with exit code 0. The scripts use `exec`, and the signal handlers stay in place for a second signal.
