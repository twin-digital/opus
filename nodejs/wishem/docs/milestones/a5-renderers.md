# Test guide: milestone A5 "Renderers"

This guide is the test plan of the milestone A5. It lists each new feature. It shows each feature in steps that one person does alone.

The milestone A5 delivered three renderers. Each one draws a construct through its link. The three draw one sample construct together. The milestone has these features:

1. The sample construct and its command.
2. The React page.
3. The PixiJS page.
4. The Godot application.
5. The three renderers on one construct.
6. A step from a client of the link.
7. The clock runs and stops.
8. The keys of the PixiJS page: pause and step.
9. A stop and a start of the construct.
10. The hub refuses a binary message.
11. A field with an empty name.
12. The automatic tests that need Docker.

## How to read this guide

- The rules of "How to read this guide" in `a1-construct.md` apply here. Read that section first.
- The writer of this guide did each step on the `main` branch (commit `f90da5b7`) with real processes: `pnpm` commands, a real Godot container, and the real `main` code.
- The writer cannot open a web browser. A script did each step of a page in a real Chromium: the Playwright image that the tests of the packages use, in Docker. The script opened the pages, pressed the keys with the keyboard of Playwright, read the text of the status line and the console of the browser, and took the pictures of the color box (React) and of the canvas (PixiJS) with `screenshot()`. It decoded each picture and read its colors. A step that says "blue" means that each pixel of the picture has the color `#1d4ed8`.
- The writer started and stopped each process in the foreground. The script ended each process with SIGINT, as Ctrl+C does.
- The writer used the default ports. The link of the sample construct is 4750. The PixiJS page is 5174. The React page is 5175.
- The colors of the sample construct change in this order: blue `#1d4ed8`, red `#b91c1c`, green `#15803d`, amber `#a16207`, and then blue again.
- A line that starts with `...` in a result means that the line continues.
- "Terminal 1" runs the sample construct. "Terminal 2" runs the React page. "Terminal 3" runs the PixiJS page. "Terminal 4" runs the Godot application. "Terminal 5" runs the other commands.
- Run each command from the root of the repository.

## What you need

- A Linux or macOS computer with Node.js 24 and pnpm 11. The file `.nvmrc` of the repository gives the version of Node.js.
- A new checkout of the repository.
- A web browser on the same computer, for sections 2, 3, and 5 to 9.
- Docker, local or remote through `DOCKER_HOST`, for the Godot application and for section 12. You do not install Godot. The Godot application runs in a container.
- The program `nodejs/wishem/docs/milestones/a5-renderers/time-client.mjs`. It needs only the built packages. Section 6 gives its commands.
- A GNU `sed`, for section 11. On macOS, write `sed -i ''` in place of `sed -i`.

### Install and build

```sh
pnpm install
pnpm build --filter "@thrashplay/wishem-three-renderers..."
```

The build ends with no error. It also makes `nodejs/wishem/hub/dist/` and `nodejs/wishem/clock/dist/`, which `time-client.mjs` uses. The writer got `Tasks:    19 successful, 19 total`. Turbo took each task from its cache. A build with an empty cache takes longer.

### The image of Godot

```sh
pnpm --filter @thrashplay/wishem-renderer-godot godot:image
```

Result: `wishem-godot: image wishem-godot:4.7.2-833918f15432 is ready`. The 12 characters at the end can be different on your computer. The first run builds the image and takes longer.

## 1. The sample construct and its command

The sample construct is the construct of the sample product. It runs in a Node.js process of its own. It has the clock and a color behavior that sets a color at each tick. The renderers draw it.

Terminal 1:

```sh
pnpm --filter @thrashplay/wishem-three-renderers construct --paused
```

Result:

```text
$ exec node scripts/construct.ts --paused
wishem: the time of the construct starts paused
wishem: link at ws://127.0.0.1:4750/link
```

The command keeps running. Without `--paused`, the clock runs from the start and the first line is not printed. The option `--hub-port <number>` selects a different port.

Keep the construct running for sections 2 to 8. If you stop it, start it again with the same command.

## 2. The React page

Do this section with no construct running. Terminal 2:

```sh
pnpm --filter @thrashplay/wishem-three-renderers react-page
```

Result:

```text
$ exec node scripts/react-page.ts
wishem: React page at http://127.0.0.1:5175/
wishem: the page connects to ws://127.0.0.1:4750/link
```

Open `http://127.0.0.1:5175/`.

Result with no construct: the status line says "The construct is not reachable. The page tries again." The terminal 2 prints a Vite error with `ECONNREFUSED 127.0.0.1:4750` at each try of the page (see "Observed faults" at the end of this guide).

Start the construct of section 1 (terminal 1).

Result: in less than 5 seconds, the status line says "Connected (link 1)." and the box of 640 by 360 pixels is blue. The page does not reload.

## 3. The PixiJS page

Do this section with no construct running. Terminal 3:

```sh
pnpm --filter @thrashplay/wishem-pixi-page start
```

Result:

```text
$ exec node scripts/start.ts
wishem: PixiJS page at http://127.0.0.1:5174/
wishem: the page connects to ws://127.0.0.1:4750/link
```

Open `http://127.0.0.1:5174/` in a second tab.

Result with no construct: after a few seconds, the status line says "The construct is not reachable. The page tries again." In the first second it can say "Connecting to the construct."

Start the construct of section 1 (terminal 1).

Result: in less than 5 seconds, the status line says "Connected (link 1). Space: pause or run. Period: one step." The canvas of 640 by 360 pixels is blue.

## 4. The Godot application

Do this section with the construct stopped. Terminal 4:

```sh
pnpm --filter @thrashplay/wishem-renderer-godot godot
```

Result:

```text
$ exec node scripts/godot.ts run
wishem-godot: image wishem-godot:4.7.2-833918f15432 is ready
wishem-godot: container wishem-godot-<8 hex> started
Godot Engine v4.7.2.stable.official.ed1daf0bf - https://godotengine.org
...
wishem-godot: connecting to ws://127.0.0.1:4750/link
wishem-godot: the hub is not reachable. Godot tries again.
```

The lines about `V-Sync` and `libdbus-1.so.3` come from Godot in the container. Ignore them.

Start the construct of section 1 (terminal 1).

Result in terminal 4, in less than 5 seconds:

```text
wishem-godot: connected (link 1)
wishem-godot: shot 1 seq 0 color #1d4ed8 file <checkout>/nodejs/wishem/renderer-godot/shots/0001.png
```

Open the file `nodejs/wishem/renderer-godot/shots/0001.png`.

Result: an image of 640 by 360 pixels. Each pixel is blue. The writer decoded the file and read one color, `#1d4ed8`. The application writes a new numbered file for each picture it draws. Git ignores the folder `shots/`.

## 5. The three renderers on one construct

Keep the construct (paused) and the three renderers of sections 2 to 4 running.

Result: the React box, the PixiJS canvas, and the last shot of the Godot application are all blue. The React page says "Connected (link 1)." The PixiJS page says "Connected (link 1). Space: pause or run. Period: one step." Terminal 4 says `connected (link 1)`. The writer got this result 3 times from a cold start of the four processes.

Each picture is a copy of the state of the construct. The next sections change the state and show that the three pictures agree.

## 6. A step from a client of the link

Terminal 5:

```sh
node nodejs/wishem/docs/milestones/a5-renderers/time-client.mjs step
```

Result:

```text
result: {"ok":true,"seq":1}
```

In less than 2 seconds, the React box and the PixiJS canvas are red. Terminal 4 prints `wishem-godot: shot 2 seq 1 color #b91c1c file ...`.

Wait 5 seconds. Result: no picture changes. Terminal 4 prints no new shot. The construct is paused, so the time moves only on a step.

## 7. The clock runs and stops

Terminal 5:

```sh
node nodejs/wishem/docs/milestones/a5-renderers/time-client.mjs run
```

Result: `result: {"ok":true,"seq":2}`. The two pages change color two times each second, in the order green, amber, blue, red, and again. Terminal 4 prints a new shot two times each second, with the same colors (`seq 3 color #15803d`, `seq 4 color #a16207`, `seq 5 color #1d4ed8`, ...). The writer sampled the pages each 250 milliseconds for 4 seconds. The color of each page always came from the list, and each page followed the same order. The pages are not always at the same tick at the same moment, because each renderer draws at its own time. After a pause (below) the three pictures show the same color.

Terminal 5:

```sh
node nodejs/wishem/docs/milestones/a5-renderers/time-client.mjs pause
```

Result: `result: {"ok":true,"seq":43}` (the number depends on how long the clock ran). The pictures stop. The writer waited 3 seconds: the React box and the PixiJS canvas stayed red, and the last shot of terminal 4 was red (`seq 42`). Terminal 4 printed no new shot.

## 8. The keys of the PixiJS page: pause and step

The construct is paused. Click the PixiJS tab so that it has the focus.

1. Press the period key. Result: the PixiJS canvas, the React box, and the next shot of terminal 4 change to the next color of the list. The writer got green (`shot 43 seq 44 color #15803d`) after red.
2. Press the space key. Result: the three pictures change two times each second.
3. Press the space key again. Result: the three pictures stop. The writer waited 3 seconds and got no change.

The keys of the PixiJS page send their inputs to the sample construct through the link. For this reason the keys change the pictures of the other two renderers.

The PixiJS page has no key for a rewind. The sample construct refuses a rewind from a client of the link. See "What the milestone did not build".

## 9. A stop and a start of the construct

1. Terminal 1: press Ctrl+C. Result: the command ends. `echo $?` gives `0`. In less than 5 seconds, the two pages keep their last color and say "The construct is not reachable. The page tries again." Terminal 4 prints `wishem-godot: the hub is not reachable. Godot tries again.` one time and no new shot.
2. Terminal 1: run the command of section 1 again. Result: in less than 10 seconds, the React page says "Connected (link 2).", the PixiJS page says "Connected (link 2). Space: pause or run. Period: one step.", and terminal 4 prints `connected (link 2)` and `shot ... seq 0 color #1d4ed8`. Each picture is blue again. Neither page reloaded. The writer put a marker in each page (`window.__marker`) before the stop, and read it after the start.
3. Terminal 5, with terminal 1 running:

   ```sh
   pnpm --filter @thrashplay/wishem-three-renderers construct
   ```

   Result: the command prints `wishem: port 4750 is in use` and ends with exit code 1. No picture changes.

4. Terminal 5: start the workbench on free ports.

   ```sh
   pnpm --filter @thrashplay/wishem-workbench-app start --port 0 --hub-port 0
   ```

   Result: the workbench starts. Its line `wishem: link at ws://127.0.0.1:<port>/link` has a port that is not 4750. The three pictures do not change. Press Ctrl+C. The command ends with exit code 0.

Godot takes about 3 seconds to connect again, because it tries again each few seconds.

## 10. The hub refuses a binary message

The hub side of each link refuses a message that is a binary WebSocket message. Keep the construct running. Terminal 5, for a binary message as the first message:

```sh
node -e "const s = new WebSocket('ws://127.0.0.1:4750/link'); s.onopen = () => { console.log('sent: 3 bytes as a binary message'); s.send(new Uint8Array([1, 2, 3])) }; s.onmessage = (e) => console.log('received:', e.data); s.onclose = (e) => console.log('closed: code', e.code); setTimeout(() => { console.log('no close after 2 s'); s.close() }, 2000).unref()"
```

Result, in less than 1 second:

```text
sent: 3 bytes as a binary message
received: {"t":"refused","reason":"malformed","message":"The message is binary. Send each message as a WebSocket text message."}
closed: code 1005
```

The line `no close after 2 s` does not occur. Terminal 5, for a binary message after the start of a link:

```sh
node -e "const s = new WebSocket('ws://127.0.0.1:4750/link'); s.onopen = () => s.send(JSON.stringify({ t: 'hello', protocol: 1, subsystems: [{ id: 'binary-check', kind: 'output' }] })); s.onmessage = (e) => { const m = JSON.parse(e.data); console.log('received:', m.t, m.reason ?? ''); if (m.t === 'welcome') { console.log('sent: 3 bytes as a binary message'); s.send(new Uint8Array([1, 2, 3])) } }; s.onclose = (e) => console.log('closed: code', e.code); setTimeout(() => { console.log('no close after 2 s'); s.close() }, 2000).unref()"
```

Result:

```text
received: welcome
sent: 3 bytes as a binary message
received: refused malformed
closed: code 1005
```

The pages and the Godot application stay connected and keep their pictures. The writer checked that the status lines still said "Connected (link 1)." after the two commands.

## 11. A field with an empty name

A field with a label that gives an empty name (for example `???`) gives no prop to a view. The React page and the PixiJS page write one warning in the console of the browser. The Godot application gives no prop and writes no warning (see "What the milestone did not build").

1. Stop the construct (terminal 1: Ctrl+C). Keep the pages and the Godot application running.
2. Terminal 5: add a field to the type `Color` of the sample product.

   ```sh
   sed -i 's/"fields": \[{ "id": "fld_694d6cb2-97e8-444e-961e-aa76744837fb", "label": "color", "type": "string" }\]/"fields": [{ "id": "fld_694d6cb2-97e8-444e-961e-aa76744837fb", "label": "color", "type": "string" }, { "id": "fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f", "label": "???", "type": "string" }]/' nodejs/wishem/sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json
   git diff --stat
   ```

   Result: `git diff --stat` shows one file changed, with one line changed.

3. Terminal 1: start the construct again (section 1).
4. Open the developer tools of the React tab and of the PixiJS tab. Reload each tab.

   Result: the console of each page has this warning line one time for each load of the page (the page also writes it when it connects to the construct again):

   ```text
   wishem: the sidecar ClearColor.view.json: the label of the field fld_5d6e7f80-9a1b-4c2d-8e3f-4a5b6c7d8e9f of the component type ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512 gives an empty name. The view does not get the field.
   ```

   Each page connects and draws blue. Before the edit, the console has no line that starts with `wishem:`.

5. Click the PixiJS tab and press the period key two times.

   Result: the pictures change two times (red, green). The console gets no new line that starts with `wishem:`.

6. Remove the edit. Stop the construct first, then run:

   ```sh
   git checkout nodejs/wishem/sample-product/model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json
   git status --short
   ```

   Result: `git status --short` prints nothing.

## 12. The automatic tests that need Docker

Stop all processes of the sections before this one. The tests start their own processes and ports. Each test command starts a Playwright container, and removes it at the end.

```sh
pnpm --filter @thrashplay/wishem-three-renderers test:ui
```

Result: four tests pass (`the three renderers draw the state of the hub`, `the parts wait for the construct, survive its stop, and end on SIGINT`, and one test that checks the containers of Godot after each of them). The command takes about 75 seconds.

```sh
pnpm --filter @thrashplay/wishem-pixi-page test:ui
```

Result: `2 passed`. The tests use the baselines of `tests/__screenshots__/`. The command takes about 15 seconds.

```sh
pnpm --filter @thrashplay/wishem-renderer-godot test:ui
```

Result: the GDScript tests end with `wishem-godot tests: 128 passed, 0 failed`, and the screenshot test passes (`the Godot application draws the construct through the link`). Godot prints `WARNING: ... ObjectDB instances were leaked at exit` and `ERROR: 1 resources still in use at exit` at the end of the GDScript tests. These are messages of the Godot engine at exit. The test result is not affected.

After each command, `docker ps -a --filter name=wishem-godot` shows no container. `git status --short` shows no change.

## Observed faults

The writer did each step and found no step that fails to give its result. The writer found no new fault. One known fault shows in sections 2 and 3: the terminal of each page prints a Vite proxy stack trace at each retry while no construct runs. It is the issue [#735](https://github.com/twin-digital/opus/issues/735), in the milestone R1 Tech Debt. The page itself works.

A page server also prints `ECONNRESET` errors from the proxy when the construct stops (section 9, step 1). They are the same fault.

## What the milestone did not build

- A rewind of the sample construct from the PixiJS page (and from any other client of the link). The sample construct refuses it. Issue #694.
- A warning from the Godot application for a field whose label gives no prop. Issue #732.
- The prop types of the views as generated code for a package other than `workbench-app`. The React page declares its prop types by hand. Issue #733.
- One shared copy of the browser server code. Three packages have their own copy. Issue #734.
- A quiet terminal while no construct runs. Issue #735.
- Generated types of the props of a Godot view. Issue #612, moved to the milestone Later.
- An input subsystem in the Godot application. The application only draws. Issue #613, moved to the milestone Later.
- A single command that starts the construct and the three renderers. Each one has its own command.
- An input from the React page and the Godot application. Only the keys of the PixiJS page send inputs.
- A Godot construct. The Godot application draws a construct that runs in Node.js. The issue #662 is closed as replaced.
