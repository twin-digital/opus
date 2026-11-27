# Test guide: milestone A2 "Time"

This guide is the test plan of the milestone A2. It lists each new feature. It shows each feature in steps that one person does alone.

The milestone A2 delivered the time subsystem with the clock, and the rewind and the replay of the hub. It has these features:

1. The clock runs, and the time advances.
2. Pause.
3. Step by one tick.
4. Run again.
5. A rewind in a hub with time.
6. A rewind that the hub refuses.
7. The record with a limit.
8. A replay of a record in a new hub.
9. A replay that fails.
10. The reserved ID `hub`.
11. A rewind through the link.
12. A rewind past a change of a definition.

## How to read this guide

- The rules of "How to read this guide" in `a1-construct.md` apply here. Read that section first.
- The writer of this guide did each step on the `main` branch. The writer copied the results from the real output.
- The writer ran the steps of sections 11 and 12 with a script that starts the `wishem` process, runs the commands one after the other, prints the output, and stops the process. The writer used the ports 4861 to 4863 and a copy of the model folder. The guide uses the default port 4747 and the folder `/tmp/a2-model`. The port number and the folder name in a line are the only difference.
- A time in a result can differ by one tick on your computer. The guide says where. The writer ran each program of sections 1 to 6 two or three times and saw the differences that the guide names.
- "Terminal 1" runs a long process. "Terminal 2" runs the commands that talk to it. "Terminal 3" runs a listener.
- Run each command from the root of the repository.

## What you need

- The same computer, the same checkout, and the same build as in "What you need" and "Install and build" of `a1-construct.md`.
- A web browser is not necessary. This milestone has no page.
- The programs in `nodejs/wishem/docs/milestones/a2-time/`. They need only the built packages. The guide gives the command of each one.
- For sections 11 and 12, the programs `link-client.mjs` of `a1-construct/` and `rewind-client.mjs` of `a2-time/`.

If you did not build the packages yet:

```sh
pnpm install
pnpm build --filter "@thrashplay/wishem-*"
```

The build ends with `Tasks:    9 successful, 9 total`.

### A copy of the model

Sections 11 and 12 change a model folder. Use a copy:

```sh
rm -rf /tmp/a2-model
cp -r nodejs/wishem/workbench/model /tmp/a2-model
```

Result: the folder `/tmp/a2-model` has `state.json` and `definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json`.

To put the copy back to the first state, run the two commands again.

## 1. The clock runs, and the time advances

The clock is an input subsystem. While the construct runs, it sends the input `time/advance` for each step of real time. The time subsystem holds the part `time` with `now`, `ticks`, and `running`.

The program `clock-controls.mjs` makes a hub with the time subsystem and a clock with a step of 100 ms. It runs for about 3 seconds. Sections 1 to 4 show the lines of its output. Run it one time:

```sh
node nodejs/wishem/docs/milestones/a2-time/clock-controls.mjs
```

Result, the first two lines:

```text
start: {"now":0,"ticks":0,"running":true} seq 0
after 1 s of running: {"now":1000,"ticks":10,"running":true} seq 10
```

What the lines show:

- At the start, the time is 0, no tick came, and `running` is `true`.
- After 1 second, the clock sent 10 ticks of 100 ms. Each tick is one input, so `seq` is 10.
- The number of ticks can be 9 or 10 on a slow computer. `now` is always a multiple of 100.

## 2. Pause

The input `time/set-running` with the value `false` pauses the construct. While `running` is `false`, the clock sends no tick.

The next two lines of the same output:

```text
paused: {"now":1000,"ticks":10,"running":false} seq 11
after 1 s of pause: {"now":1000,"ticks":10,"running":false} seq 11
```

What the lines show:

- The pause is one input (`seq` goes from 10 to 11).
- After 1 second of pause, `now`, `ticks`, and `seq` did not change. The clock sent no tick.

## 3. Step by one tick

While the construct is paused, one input `time/advance` with a length of 100 advances the time by one step. The clock is not necessary.

The next three lines:

```text
step: {"ok":true,"seq":12}
after one step: {"now":1100,"ticks":11,"running":false} seq 12
after 0.5 s more of pause: {"now":1100,"ticks":11,"running":false} seq 12
```

What the lines show:

- The step applied as the input 12. The time went up by 100 and `ticks` by 1. `running` stays `false`.
- After 0.5 second more, nothing changed. The pause holds.

## 4. Run again

The input `time/set-running` with the value `true` ends the pause. The clock sends ticks again. The real time of the pause causes no extra ticks.

The last two lines of the output:

```text
running again: {"now":1100,"ticks":11,"running":true} seq 13
after 0.5 s of running: {"now":1600,"ticks":16,"running":true} seq 18
```

What the lines show:

- The time stays at 1100 when `running` becomes `true`. The 1.5 seconds of pause did not cause 15 ticks.
- After 0.5 second, 5 ticks came. The number can be 4 or 5 on your computer.

Open `clock-controls.mjs` to see the API. It uses `createTime()`, `startClock(port, { stepMs })`, and `timeInputs.setRunning(...)` and `timeInputs.advance(...)`. `nodejs/wishem/clock/README.md` has the full text.

## 5. A rewind in a hub with time

The input `hub/rewind` with a number `seq` returns the joined state to the state after the input with that number. The rewind is one more input of the record. The clock continues from the new time, and it sends no late ticks for the real time before the rewind.

The program `rewind-demo.mjs` runs a hub with time and a clock with a step of 100 ms. It runs for about 1 second. It rewinds to the input 3 after 850 ms. Run it:

```sh
node nodejs/wishem/docs/milestones/a2-time/rewind-demo.mjs
```

Result, the first five lines:

```text
before the rewind: {"now":800,"ticks":8,"running":true} seq 8
event applied #9 hub/rewind {"seq":3}
rewind to 3: {"ok":true,"seq":9}
right after the rewind: {"now":300,"ticks":3,"running":true} seq 9
250 ms after the rewind: {"now":400,"ticks":4,"running":true} seq 10
```

What the lines show:

- Before the rewind, the time is 800 and 8 ticks came. The last input is 8.
- The rewind is the input 9. The hub sends one `applied` event for it, and its type is `hub/rewind`.
- Directly after the rewind, `now` is 300 and `ticks` is 3. These are the values after the input 3.
- The sequence number does not go back. The record keeps inputs 4 to 8 and adds the rewind as the input 9.
- 250 ms later, `ticks` is 4 or 5. The clock sends one tick for each 100 ms from the rewind. A clock with late ticks would show 8 or more here, because 850 ms of real time came before the rewind.

## 6. A rewind that the hub refuses

The hub refuses a target that is not an integer, that is after the last input, or that is before the start of the record. A refused rewind changes nothing.

The rest of the output of `rewind-demo.mjs` (section 5):

```text
after the present: {"ok":false,"reason":"invalid","problems":[{"message":"The target must be an integer from 0 to 10.","path":["payload","seq"]}]}
not an integer: {"ok":false,"reason":"invalid","problems":[{"message":"The target must be an integer from 0 to 10.","path":["payload","seq"]}]}
record start: 0
before the start: {"ok":false,"reason":"invalid","problems":[{"message":"The target must be an integer from 0 to 10.","path":["payload","seq"]}]}
seq is still true
```

What the lines show:

- A target after the present (11 here) gets the reason `invalid`. The problem has the path `["payload","seq"]`. The text gives the allowed range.
- The target 1.5 gets the same rejection.
- The start of the record is 0 in this hub, so `-1` is before it and gets the same rejection.
- `seq is still true`: the last sequence number did not change after the three rejections.

A target that is before the start of a record that has moved is in section 7.

## 7. The record with a limit

The option `recordLimit` is the largest number of inputs after the start of the record. When the record is longer, the hub moves the start to a checkpoint. `hub.record()` returns the inputs after the start. `hub.recordStart()` returns the start.

The program `record-limit.mjs` makes a hub with `checkpointInterval: 2` and `recordLimit: 4`. It sends 7 inputs. Run it:

```sh
node nodejs/wishem/docs/milestones/a2-time/record-limit.mjs
```

Result:

```text
seq 0: start 0 (count 0), record []
seq 1: start 0 (count 0), record [1]
seq 2: start 0 (count 0), record [1, 2]
seq 3: start 0 (count 0), record [1, 2, 3]
seq 4: start 0 (count 0), record [1, 2, 3, 4]
seq 5: start 2 (count 2), record [3, 4, 5]
seq 6: start 2 (count 2), record [3, 4, 5, 6]
seq 7: start 4 (count 4), record [5, 6, 7]
rewind to 3: {"ok":false,"reason":"invalid","problems":[{"message":"The target must be an integer from 4 to 7.","path":["payload","seq"]}]}
rewind to 4: {"ok":true,"seq":8}
count now 4
seq 8: start 4 (count 4), record [5, 6, 7, 8]
```

What the lines show:

- Up to the input 4, the record holds all inputs, and the start is 0.
- The input 5 makes the record longer than 4. The start moves to the checkpoint at the input 2. The record then holds inputs 3 to 5.
- The input 7 moves the start to the checkpoint at the input 4. The record holds 5 to 7.
- The target 3 is before the start now. The hub refuses it, and the text says that the range is 4 to 7.
- The target 4 is the start. The hub accepts it and gives the state after the input 4 (count 4). The rewind is the input 8.

## 8. A replay of a record in a new hub

`createHub({ subsystems, record })` makes a hub from a record. It applies each input of the record again. The new hub has the same state, the same `seq`, and the same record. A rewind in the record applies again as it applied the first time.

The program `replay-demo.mjs` does sections 8 to 10. Run it:

```sh
node nodejs/wishem/docs/milestones/a2-time/replay-demo.mjs
```

Result, the first five lines:

```text
record: 1 counter/add, 2 counter/add, 3 counter/add, 4 hub/rewind, 5 counter/add
first hub: {"counter":{"count":3}} seq 5
replayed hub: {"counter":{"count":3}} seq 5 created
same record: true
next input: {"ok":true,"seq":6}
```

What the lines show:

- The first hub got three adds (1, 5, and 5), a rewind to the input 1, and an add of 2. The count is 1 + 2 = 3.
- The replayed hub has the same state `{"counter":{"count":3}}`, the same `seq` 5, and the status `created`. It sent no event during the replay.
- `same record: true`: the record of the new hub equals the record of the first hub, with the rewind in it.
- The next input of the new hub gets the number 6.

## 9. A replay that fails

`createHub` throws a `ReplayError` when a model subsystem refuses an input of the record. The error has the sequence number and the problems.

The sixth line of the output of `replay-demo.mjs`:

```text
replay failed: true at seq 2 [{"message":"The number is larger than 4.","path":["payload","by"]}]
```

What the line shows:

- The program replays the same record in a hub whose subsystem refuses a number larger than 4.
- The input 2 has the number 5, so the replay fails there. `true` means that the error is a `ReplayError`.

## 10. The reserved ID `hub`

The ID `hub` and the input types that start with `hub/` belong to the hub.

The last four lines of the output of `replay-demo.mjs`:

```text
subsystem with the ID hub: true - The subsystem ID "hub" is reserved for the hub.
subsystem with a hub/ type: true - The input type "hub/extra" of "extra" is reserved for the hub.
attach with the ID hub: true - The subsystem ID "hub" is reserved for the hub.
hub/other: {"ok":false,"reason":"unknown-type","problems":[]}
```

What the lines show:

- A model subsystem with the ID `hub` is refused with a `HubConfigurationError` (`true`).
- A model subsystem that declares the type `hub/extra` is refused in the same way.
- An attach with the ID `hub` is refused in the same way.
- An input of an unknown type `hub/other` gets the reason `unknown-type`.

Through the link, a `hello` with the ID `hub` gets `refused`. Start the construct in terminal 1:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a2-model
```

In terminal 2:

```sh
node -e '
const s = new WebSocket("ws://127.0.0.1:4747/link")
s.onopen = () => s.send(JSON.stringify({ t: "hello", protocol: 1, subsystems: [{ id: "hub", kind: "input" }] }))
s.onmessage = (e) => console.log(e.data)
s.onclose = () => console.log("closed")
'
```

Result:

```text
{"t":"refused","reason":"id-in-use","message":"A subsystem ID is in use."}
closed
```

Stop terminal 1 with Ctrl+C.

## 11. A rewind through the link

A client of protocol version 1 sends `hub/rewind` like each other input. Each client of the link gets one `applied` message for it. The process that `wishem start` runs has the store and no clock, so the rewind returns the title. The process writes the old title to `state.json`.

Put the copy back (see "A copy of the model"). In terminal 1, start the construct:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a2-model
```

Result in terminal 1:

```text
wishem: model /tmp/a2-model
wishem: 1 component type, 1 entity
wishem: link at ws://127.0.0.1:4747/link
```

In terminal 3, start a listener. It only listens:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs
```

Result in terminal 3:

```text
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}
```

### 11.1 Set the title two times

In terminal 2:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title First
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title Second
```

Result of the first command (the number in `sender-` is different each time):

```text
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}
applied #1 store/set-field from sender-12345
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="First"}
result: {"ok":true,"seq":1}
link closed
```

Result of the second command: the same lines, with `applied #2`, the titles `First` and `Second`, and `"seq":2`.

The file `state.json` has the title `Second`:

```sh
cat /tmp/a2-model/state.json
```

Result: the JSON of A1 section 6.1, with the value `"Second"`.

### 11.2 Rewind to the first title

The first title has the sequence number 1. In terminal 2:

```sh
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --seq 1
```

Result:

```text
result: {"ok":true,"seq":3}
title now: "First"
```

The rewind is the input 3. The program reads the state after the result, and the title is `First`.

Result in terminal 3 (the listener), the new lines:

```text
applied #3 hub/rewind from rewinder-12345
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="First"}
```

The listener gets exactly one `applied` message for the rewind. It needs no special code. Its earlier lines show the inputs 1 and 2.

Wait one second. Then, in terminal 2:

```sh
cat /tmp/a2-model/state.json
```

Result: the file has the value `"First"`. The construct wrote the file after the rewind. Terminal 1 prints no line.

### 11.3 A target that is not correct

```sh
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --seq 9
```

Result:

```text
result: {"ok":false,"reason":"invalid","problems":[{"message":"The target must be an integer from 0 to 3.","path":["payload","seq"]}]}
title now: "First"
```

The listener prints no line. The file does not change.

Stop terminal 3 and terminal 1 with Ctrl+C. To put things back, run the two commands of "A copy of the model".

## 12. A rewind past a change of a definition

The construct holds the write of `state.json` while the definitions of the store differ from the files in `definitions` (A1 section 6). A rewind can make them different, or equal again.

### 12.1 A rewind past a change by hand

Put the copy back. In terminal 1, start the construct (section 11). In terminal 2, change a definition file. The construct follows the change (A1 section 2.4):

```sh
sed -i 's/"label": "AppBar"/"label": "Header"/' /tmp/a2-model/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
```

Wait one second. Set the title. This input has the number 2, because the change of the file was the input 1:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title First
```

Result:

```text
state: types: Header | entities: e_c0d5e6f1 Header{title="Wishem"}
applied #2 store/set-field from sender-12345
state: types: Header | entities: e_c0d5e6f1 Header{title="First"}
result: {"ok":true,"seq":2}
link closed
```

The file `state.json` has the title `First`. Now rewind to the start, before the change of the definition:

```sh
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --seq 0
```

Result in terminal 2:

```text
result: {"ok":true,"seq":3}
title now: "Wishem"
```

Result in terminal 1:

```text
wishem: the definitions of the store differ from the files in definitions, so state.json is not written
```

The store has the label `AppBar` again, but the file in `definitions` has `Header`. The construct holds the write. The file `state.json` still has the title `First`. The title `Wishem` is only in the construct.

### 12.2 A rewind that releases the hold

Rewind to the input 2. The store then has the label `Header` and the title `First`:

```sh
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --seq 2
```

Result in terminal 2:

```text
result: {"ok":true,"seq":4}
title now: "First"
```

Result in terminal 1:

```text
wishem: the definitions of the store are equal to the files in definitions again
```

Stop terminal 1 with Ctrl+C. To put things back, run the two commands of "A copy of the model".

### 12.3 A rewind that releases a hold from the link

The hold of A1 section 6.2 also ends with a rewind. Put the copy back and start the construct. Then run:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --label Header
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title Second
node nodejs/wishem/docs/milestones/a2-time/rewind-client.mjs --seq 0
```

Result in terminal 1, in this order:

```text
wishem: the definitions of the store differ from the files in definitions, so state.json is not written
wishem: the definitions of the store are equal to the files in definitions again
```

The first line comes after the first command. The second line comes after the rewind. The file `state.json` has the title `Wishem`. The definition file is not changed by any of the commands. Stop terminal 1 with Ctrl+C.

## Known faults

The writer found no fault in the milestone.

## Not in this milestone

You will not find these:

- A clock in the process of `wishem start` or in the workbench. The process has the store and no `time` part. A client of the link cannot pause, step, or advance it. Sections 1 to 5 use a library program.
- A control on the page for pause, step, or rewind. The page sends no input.
- A way to start a rewind from a command. `rewind-client.mjs` in this guide is the only tool. It is not part of a package.
- A bookmark. A rewind uses a sequence number only.
- A record that is kept after the process stops. The record is in memory. A restart gives a new record that starts at 0.
- A replay in the `wishem` command, and a message of the link for the record or for a checkpoint. A client of the link cannot read the record. Replay is a function of the library.
- A record limit in the `wishem` command. The process uses the defaults (a checkpoint after each 100 inputs and a limit of 100000 inputs).
- A rewind of the definition files. The construct never writes a definition file. A rewind past a change of a definition holds the write of `state.json` (section 12).
- A rewind of a model subsystem that is in a client of the link. Version 1 has no such subsystem.
- A build to install. All packages are private, and the commands run from the repository.
