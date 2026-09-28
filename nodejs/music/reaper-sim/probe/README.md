# REAPER probe

Checks the REAPER behaviors the simulator models against a running REAPER. Update the simulator's README (and the
simulator, where a check fails) with the results.

1. In REAPER, enable the web remote (Preferences > Control/OSC/web > Web browser interface).
2. Open a fresh project tab; the probe checks whether its writes mark the project changed.
3. Load `reaper-probe.lua` as an action (Actions > Show action list > New action > Load ReaScript) and run it.
4. From any machine that reaches the web remote: `node probe/reaper-probe.ts http://<reaper host>:8080`.

The web remote checks run before the Lua half starts, so step 4 can come first. The Lua half cleans up after itself
and then ends with a deliberate error, to learn whether `atexit` runs on one; dismiss the error REAPER shows.
