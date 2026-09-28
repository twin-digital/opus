# REAPER probe

Checks the REAPER behaviors the simulator models against a running REAPER, and records the ones it doesn't model.
Each line prints `PASS` or `FAIL` where the simulator models the behavior, and `INFO` where it only records it. Update
the simulator's README (and the simulator, where a check fails) with the results.

1. In REAPER, enable the web remote (Preferences > Control/OSC/web > Web browser interface).
2. Open a fresh project tab; the probe checks whether its writes mark the project changed.
3. Copy `reaper-probe.lua` to the REAPER machine, load it as an action (Actions > Show action list > New action >
   Load ReaScript) and run it.
4. From any machine with Node 24 that reaches the web remote, in `nodejs/music/reaper-sim`:
   `node probe/reaper-probe.ts http://<reaper host>:8080`. With a web remote username and password, put them in
   the URL: `http://user:password@<reaper host>:8080`.

The web remote checks run before the Lua half starts, so step 4 can come first.

Near the end, the Lua half saves the tab's project as `probe-saved.rpp` and replaces it by opening
`probe-other.rpp`, both beside the script; close that tab without saving and delete both files. It then clears its
keys and ends with a deliberate error, to learn whether `atexit` runs on one; dismiss the error REAPER shows. Last, the
Node half looks for the largest request REAPER answers, which leaves a few requests to time out.

The probe passes against the simulator itself, served with `ReaperSim.listen()` and the Lua half loaded by
`loadScriptFile`.
