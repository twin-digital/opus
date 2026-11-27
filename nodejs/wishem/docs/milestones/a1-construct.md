# Test guide: milestone A1 "Construct"

This guide is the test plan of the milestone A1. It lists each new feature. It shows each feature in steps that one person does alone.

The milestone A1 delivered a construct that runs in a Node.js process and a workbench page that shows its model. It has these features:

1. The `wishem` command.
2. The model folder and the follow of changes.
3. The link (the protocol of the construct).
4. The hub, the ports, and the record.
5. The store.
6. The write of `state.json` and the hold of that write.
7. The workbench and its page.
8. The time subsystem and the clock.

## How to read this guide

- A step has a command or an action. After it, the guide gives the result that you see.
- The writer of this guide did each step in a terminal, on the `main` branch. The writer copied the results from the real output.
- The writer used other ports than the ones in this guide (4801 to 4814 and 5908 to 5913). The guide uses the default ports 4747 and 5173. The port number in a line is the only difference.
- A line that starts with `...` in a result means that the line continues. The guide cuts a long line.
- The writer cannot see a web browser. A step with "(not checked by the writer of this guide in a browser)" has a result on the page. The writer checked the parts of that step that can be checked from outside, and says which.
- "Terminal 1" runs a long process. "Terminal 2" runs the commands that talk to it.
- Run each command from the root of the repository, unless the guide says other.

## What you need

- A Linux or macOS computer with Node.js 24 and pnpm 11. The file `.nvmrc` of the repository gives the version of Node.js.
- A new checkout of the repository.
- A web browser, for section 7.
- On macOS, write `sed -i ''` where the guide writes `sed -i`.
- The programs in `nodejs/wishem/docs/milestones/a1-construct/`. They need only the built packages. The guide gives the command of each one.

### Install and build

```sh
pnpm install
pnpm build --filter "@thrashplay/wishem-*"
```

- The install time depends on your network. The writer did not measure it, because the worktree of the writer already had its packages.
- The build took 3 seconds for the writer. Turbo took 6 of the 9 tasks from its cache. A build with an empty cache takes longer. The writer did not measure it.
- The build ends with `Tasks:    9 successful, 9 total`.
- The programs of this guide import the built files (`dist/`). Do the build before the first program.

### A copy of the model

Each step that changes a model file uses a copy of the model. The copy keeps the files of the repository unchanged.

```sh
rm -rf /tmp/a1-model
cp -r nodejs/wishem/workbench/model /tmp/a1-model
```

Result: the folder `/tmp/a1-model` has `state.json` and `definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json`.

To put the copy back to the first state, run the two commands again.

### How long a start takes

- The `wishem` command prints its three lines in less than 1 second.
- The workbench prints its three lines in about 1 second.

## 1. The `wishem` command

The `wishem` command reads a model folder, runs one construct, and serves the link on a port.

### 1.1 Start the construct

Put the copy back (see "A copy of the model"). In terminal 1, run:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a1-model
```

Result in terminal 1:

```text
wishem: model /tmp/a1-model
wishem: 1 component type, 1 entity
wishem: link at ws://127.0.0.1:4747/link
```

The command stays in the foreground and prints no more lines.

### 1.2 Stop with Ctrl+C

In terminal 1, press Ctrl+C.

Result: the command stops and the terminal shows the prompt again. The command prints no line. The exit code is 0 (the writer checked the code when the writer ran the file `bin/wishem.js` directly with Node.js, not through pnpm).

If a client was connected, its link closes. Section 3 shows that.

### 1.3 Start on a different port

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a1-model --port 4801
```

Result: the third line is `wishem: link at ws://127.0.0.1:4801/link`. Press Ctrl+C to stop.

### 1.4 Cases of failure

Do each command in terminal 1. Each one stops with a non-zero exit code. Because of `pnpm exec`, pnpm adds lines after the output of `wishem`: `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code N: ...`. The pnpm command itself exits with code 1. The exit codes below are the codes in that message.

**No folder.**

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem
```

Result (exit code 2):

```text
usage: wishem start <folder> [--port <number>]
```

**A port that is not a number.**

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a1-model --port abc
```

Result (exit code 2):

```text
wishem: the port must be a number from 0 to 65535, not "abc"
usage: wishem start <folder> [--port <number>]
```

**A folder that does not exist.**

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a1-no-such-model
```

Result (exit code 1):

```text
wishem: model /tmp/a1-no-such-model
wishem: problem in /tmp/a1-no-such-model: the model folder /tmp/a1-no-such-model does not exist
wishem: the model is not correct, so the hub did not start
```

**A model file that is not correct at the start.** First, break the definition file:

```sh
echo '{ nope' > /tmp/a1-model/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a1-model
```

Result (exit code 1):

```text
wishem: model /tmp/a1-model
wishem: problem in definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json: the text is not valid JSON (line 1)
wishem: the model is not correct, so the hub did not start
```

The writer did a similar check with a `state.json` that has an entity of a component type that does not exist. The result was two problem lines for `state.json` and the same last line. The exact lines were:

```text
wishem: problem in state.json: Entity e_1 has the ID "e_1", which is not "e_" and a UUID in lowercase
wishem: problem in state.json: Entity e_1 has a component of the type ct_unknown, which is not defined
```

Put the copy back before the next section.

**A second process on the same port.** In terminal 1, start the construct (step 1.1). In terminal 2, run the same command:

```sh
pnpm --filter @thrashplay/wishem-workbench exec wishem start /tmp/a1-model
```

Result in terminal 2 (exit code 1):

```text
wishem: model /tmp/a1-model
wishem: port 4747 is in use
```

Terminal 1 is not affected. Stop it with Ctrl+C.

## 2. The model folder and the follow of changes

The construct watches the model folder. After a change of a file, it reads the folder again. A client of the link sees the change. A restart is not necessary.

This section uses `link-client.mjs`. It opens a link, prints the model, and prints each change that it hears about.

Start:

1. Put the copy back (see "A copy of the model").
2. In terminal 1, start the construct (step 1.1).
3. In terminal 2, run:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs
```

Result in terminal 2:

```text
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}
```

The program stays open. Use terminal 3 for the commands of the next steps. Use terminal 2 for the results.

### 2.1 Change `state.json` by hand

In terminal 3:

```sh
sed -i 's/"Wishem"/"Hello"/' /tmp/a1-model/state.json
```

Result in terminal 2, in less than 1 second:

```text
applied #1 store/replace-model from files
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Hello"}
```

Terminal 1 prints no line for a correct change.

### 2.2 Save a file that is not correct

In terminal 3, add a comma after the value. The JSON is then not valid:

```sh
sed -i 's/"Hello"/"Hello",/' /tmp/a1-model/state.json
```

Result in terminal 1:

```text
wishem: problem in state.json: the text is not valid JSON (line 6)
wishem: the last correct model stays
```

Terminal 2 prints no new line. The model did not change.

### 2.3 Correct the file

In terminal 3:

```sh
sed -i 's/"Hello",/"Hello"/' /tmp/a1-model/state.json
```

Result in terminal 1:

```text
wishem: the model is correct: 1 component type, 1 entity
```

Terminal 2 prints no new line. The model equals the model before the fault.

### 2.4 Change a definition file

In terminal 3:

```sh
sed -i 's/"label": "AppBar"/"label": "Header"/' /tmp/a1-model/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
```

Result in terminal 2:

```text
applied #2 store/replace-model from files
state: types: Header | entities: e_c0d5e6f1 Header{title="Hello"}
```

To put it back, run the same command with the two labels swapped. Terminal 2 then prints `applied #3 ...` and `types: AppBar`.

Stop terminal 2 with Ctrl+C. Stop terminal 1 with Ctrl+C. Terminal 2 prints `link closed` when terminal 1 stops, or when you stop it.

Do not do a hand edit of `state.json` after section 6 wrote the file in the same run. See "Known faults".

## 3. The link

The link is a protocol of JSON messages on a WebSocket at `ws://127.0.0.1:4747/link`. The file `nodejs/wishem/hub/LINK.md` defines it. `raw-link.mjs` is a client with no library. It shows each message.

Put the copy back, and start the construct in terminal 1 (step 1.1).

### 3.1 Open a link and read the model

In terminal 2:

```sh
node nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs --once
```

Result in terminal 2 (the second line is long, and this guide cuts it):

```text
sent: {"t":"hello","protocol":1,"subsystems":[{"id":"raw-12345","kind":"input"}]}
received: {"t":"welcome","protocol":1,"status":"running","seq":0,"state":{"store":{"definitions":[{"id":"ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34","label":"AppBar", ...
closed: code 1005
```

The number in `raw-12345` is the number of the process. It is different each time.

### 3.2 Send an input that the hub accepts

```sh
node nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs --once --send '{"type":"store/add-entity","payload":{"entity":{"id":"e_11111111-1111-4111-8111-111111111111","components":{"ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34":{"fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62":"Second"}}}}}'
```

Result: the program prints the line that it sent, and then two received lines. The first starts with `received: {"t":"applied","input":{"seq":1,"source":"raw-` and holds the whole new model in `parts`. The second is:

```text
received: {"t":"result","request":1,"result":{"ok":true,"seq":1}}
```

The `applied` line comes before the `result` line.

To put it back, stop terminal 1 and start the construct again from a fresh copy. The entity is in the file `state.json` now (section 6).

### 3.3 Send an input that the hub rejects

```sh
node nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs --once --send '{"type":"nope"}'
```

Result: the last received line is:

```text
received: {"t":"result","request":1,"result":{"ok":false,"reason":"unknown-type","problems":[]}}
```

### 3.4 A hello that the hub refuses

A protocol version that the hub does not support:

```sh
node -e '
const s = new WebSocket("ws://127.0.0.1:4747/link")
s.onopen = () => s.send(JSON.stringify({ t: "hello", protocol: 2, subsystems: [{ id: "x", kind: "output" }] }))
s.onmessage = (e) => console.log(e.data)
s.onclose = () => console.log("closed")
'
```

Result:

```text
{"t":"refused","reason":"version","message":"The hub supports protocol version 1, not 2.","supported":[1]}
closed
```

A subsystem of the kind `model`: replace `protocol: 2` with `protocol: 1` and `kind: "output"` with `kind: "model"`. Result:

```text
{"t":"refused","reason":"unsupported","message":"A subsystem of the kind model is not supported."}
closed
```

The writer ran the second command with the same code, except for these two values.

### 3.5 Two links with the same subsystem ID

Run this command. It opens two links with the ID `x`:

```sh
node -e '
const open = (n) => { const s = new WebSocket("ws://127.0.0.1:4747/link"); s.onopen = () => s.send(JSON.stringify({ t: "hello", protocol: 1, subsystems: [{ id: "x", kind: "output" }] })); s.onmessage = (e) => console.log(n, e.data.slice(0, 60)); return s }
open("first"); setTimeout(() => open("second"), 300); setTimeout(() => process.exit(0), 800)
'
```

Result:

```text
first {"t":"welcome","protocol":1,"status":"running","seq":2,"stat
second {"t":"refused","reason":"id-in-use","message":"A subsystem I
```

The number after `"seq":` depends on the inputs that you sent before.

### 3.6 A page of a different site opens the link

A page of a different site cannot open the link. The server checks the `Origin` header. Run this command, which sends the header of a different site:

```sh
curl -si --max-time 3 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://example.com' http://127.0.0.1:4747/link
```

Result:

```text
HTTP/1.1 403 Forbidden
Connection: close
Content-Length: 0
```

Change the header to `Origin: http://localhost:5173`. Result: the first line is `HTTP/1.1 101 Switching Protocols`. A request with no `Origin` header (as in 3.1) also works.

The writer did these steps with `curl`. The writer did not test a real page of a different site in a browser.

### 3.7 Other requests

```sh
curl -si http://127.0.0.1:4747/other
```

Result:

```text
HTTP/1.1 404 Not Found
Content-Type: application/json
...

{"error":"No such path: /other"}
```

A WebSocket request for a path that is not `/link` also gets `404 Not Found`, with an empty body.

### 3.8 The end of a link

Stop terminal 1 with Ctrl+C while the program of section 2 (`link-client.mjs`) is open in terminal 2.

Result in terminal 2: `link closed`. The program ends.

## 4. The hub, the ports, and the record

The hub joins the model subsystems into the joined state. A port is the way for a subsystem to send inputs and read. This feature is a library. `hub-demo.mjs` is the shortest program that shows it.

```sh
node nodejs/wishem/docs/milestones/a1-construct/hub-demo.mjs
```

Result:

```text
before start: {"ok":false,"reason":"not-running","problems":[]}
event: started
event: applied {"counter":{"count":2}}
accepted: {"ok":true,"seq":1}
from an output port: {"ok":false,"reason":"not-permitted","problems":[]}
unknown type: {"ok":false,"reason":"unknown-type","problems":[]}
invalid: {"ok":false,"reason":"invalid","problems":[{"message":"The number is negative or missing.","path":["payload","by"]}]}
record: [{"seq":1,"source":"buttons","type":"counter/add","payload":{"by":2}}]
event: stopping
```

What each line shows:

- `not-running`: the hub accepts no input before `start()`.
- `started`, `applied`, `stopping`: the events that the output port hears.
- `accepted`: the input of an input port gets a sequence number. The event `applied` comes before the result.
- `not-permitted`: an output port cannot send an input.
- `unknown-type`: no model subsystem applies the type.
- `invalid`: a model subsystem refused the input, and the problem says why.
- `record`: the hub keeps only the accepted input.

The file `nodejs/wishem/hub/README.md` has the same examples with a client through the link.

## 5. The store

The store is the model subsystem that holds the definitions and the entities of a model. It applies four inputs: `store/replace-model`, `store/add-entity`, `store/remove-entity`, and `store/set-field`. The construct of section 1 has a store with the ID `store`.

Put the copy back, and start the construct in terminal 1 (step 1.1). The steps use `raw-link.mjs` in terminal 2. Each result line below is the `received` line for the `result` message. Other lines are cut.

Use these IDs:

- Component type: `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`.
- Field: `fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62`.
- Entity: `e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2`.

### 5.1 Set a field (`store/set-field`)

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title "A new title"
```

Result:

```text
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}
applied #1 store/set-field from sender-12345
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="A new title"}
result: {"ok":true,"seq":1}
link closed
```

### 5.2 Set a field with a wrong type

```sh
node nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs --once --send '{"type":"store/set-field","payload":{"entity":"e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2","componentType":"ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34","field":"fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62","value":7}}'
```

Result (the message is on one line):

```text
received: {"t":"result","request":1,"result":{"ok":false,"reason":"invalid","problems":[{"message":"Entity e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2 has the value 7 for the field \"title\" of \"AppBar\", but the type of the field is \"string\"","path":["entities",0,"components","ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34","fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62"]}]}}
```

The model did not change.

### 5.3 Add an entity (`store/add-entity`)

Use the command of step 3.2. Result: `"ok":true,"seq":...`. Run it a second time. Result:

```text
received: {"t":"result","request":1,"result":{"ok":false,"reason":"invalid","problems":[{"message":"An entity has the ID \"e_11111111-1111-4111-8111-111111111111\"","path":["payload","entity","id"]}]}}
```

An input with an empty payload:

```sh
node nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs --once --send '{"type":"store/add-entity","payload":{}}'
```

Result:

```text
received: {"t":"result","request":1,"result":{"ok":false,"reason":"invalid","problems":[{"message":"The payload has no \"entity\" object","path":["payload","entity"]}]}}
```

### 5.4 Remove an entity (`store/remove-entity`)

```sh
node nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs --once --send '{"type":"store/remove-entity","payload":{"entity":"e_11111111-1111-4111-8111-111111111111"}}'
```

Result: an `applied` line, and `received: {"t":"result","request":1,"result":{"ok":true,"seq":...}}`. The same command again gives:

```text
received: {"t":"result","request":1,"result":{"ok":false,"reason":"invalid","problems":[{"message":"No entity has the ID \"e_11111111-1111-4111-8111-111111111111\"","path":["payload","entity"]}]}}
```

### 5.5 Replace the model (`store/replace-model`)

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --label Header
```

Result:

```text
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}
applied #1 store/replace-model from sender-12345
state: types: Header | entities: e_c0d5e6f1 Header{title="Wishem"}
result: {"ok":true,"seq":1}
link closed
```

The number in `#1` and in `sender-12345` depends on your earlier steps and on the process.

Stop terminal 1 with Ctrl+C. Section 6 explains what the store change does to the files.

## 6. The write of `state.json` and the hold of that write

When a client changes an entity, the construct writes `state.json`. The construct does not write `state.json` while the definitions of the store differ from the files in `definitions`. The construct never writes a definition file.

Put the copy back, and start the construct in terminal 1 (step 1.1).

### 6.1 A change through the link is in the file

In terminal 2:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title Hello
cat /tmp/a1-model/state.json
```

Result of the `cat` command:

```json
{
  "entities": [
    {
      "id": "e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2",
      "components": {
        "ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34": {
          "fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62": "Hello"
        }
      }
    }
  ]
}
```

The write replaces the whole file, and the layout of the file changes to this one.

### 6.2 A definition change through the link holds the write

Do the three commands, one after the other:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --label Header
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title Second
cat /tmp/a1-model/state.json
```

Result in terminal 1, after the first command:

```text
wishem: the definitions of the store differ from the files in definitions, so state.json is not written
```

Terminal 1 prints this line one time. It does not print it again after the second command.

Result of the `cat` command: the file still has `"Hello"`. The title `Second` is only in the construct. A new client sees `Second`.

The definition file is unchanged:

```sh
grep label /tmp/a1-model/definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json
```

Result: `"label": "AppBar"` (the first match).

### 6.3 Release the hold

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --label AppBar
cat /tmp/a1-model/state.json
```

Result in terminal 1:

```text
wishem: the definitions of the store are equal to the files in definitions again
```

Result of the `cat` command: the file has `"Second"`. The construct wrote the held change.

### 6.4 Stop with a hold

After 6.3, run the `--label Header` command of 6.2 again. Terminal 1 prints the line of the hold again. Then press Ctrl+C in terminal 1.

Result in terminal 1, as the last line:

```text
wishem: the process stops, and the model folder does not hold the last changes of the store
```

The command stops. The file `state.json` has the last value that the construct wrote.

## 7. The workbench and its page

The workbench is one command that starts the construct and the page server. The page draws the model that it reads through the link. It follows each change. It connects again after the process stops and starts.

### 7.1 Start the workbench

Put the copy back. In terminal 1:

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --model /tmp/a1-model
```

Result in terminal 1 (the first line, which starts with `$`, is from pnpm):

```text
$ node scripts/start.ts --model /tmp/a1-model
wishem: model /tmp/a1-model
wishem: link at ws://127.0.0.1:4747/link
wishem: workbench at http://127.0.0.1:5173/
```

The writer also started the workbench with no option. The model then is the first model of the workbench, in the repository.

The command writes no file in the repository. The writer checked with `git status`.

### 7.2 Look at the page

Open `http://127.0.0.1:5173/` in a web browser. (not checked by the writer of this guide in a browser)

Expected result (from the specification of the page):

- A bar at the top shows `wishem` in lowercase letters, with a full stop after the text.
- The space below the bar shows the label `Workbench` and the text `Nothing to show yet.`
- The browser console has no error.

The writer checked from outside:

```sh
curl -s http://127.0.0.1:5173/ | grep -E "<title>|root|main.tsx"
```

Result: `<title>Wishem workbench</title>`, the element `<div id="root"></div>`, and the script `/src/main.tsx`. The writer also checked that Vite serves `/src/main.tsx` and `/src/views/AppBar.tsx` with status 200.

### 7.3 The link through the page address

The page opens its link at `/link` on the address of the page. Run:

```sh
node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --url ws://127.0.0.1:5173/link --once
```

Result:

```text
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Wishem"}
link closed
```

### 7.4 The page follows a change of the model

Leave the page open. In terminal 2:

```sh
sed -i 's/"Wishem"/"Hello"/' /tmp/a1-model/state.json
```

Result on the page, with no reload: the bar shows `hello.` (not checked by the writer of this guide in a browser).

The writer checked the same change from outside. A client on `ws://127.0.0.1:5173/link` received:

```text
applied #1 store/replace-model from files
state: types: AppBar | entities: e_c0d5e6f1 AppBar{title="Hello"}
```

To put it back, run the same command with `"Hello"` and `"Wishem"` swapped.

### 7.5 A file that is not correct

In terminal 2:

```sh
sed -i 's/"Hello"/"Hello",/' /tmp/a1-model/state.json
```

Result: terminal 1 prints the problem lines (as in step 2.2). The page keeps the last picture and shows no message. (not checked by the writer of this guide in a browser)

The writer checked the lines of terminal 1 for the same fault with `wishem start`. The writer did not check them in the workbench. Put the file back:

```sh
sed -i 's/"Hello",/"Hello"/' /tmp/a1-model/state.json
```

### 7.6 The process stops and starts

1. Leave the page open. In terminal 1, press Ctrl+C.
2. Look at the browser console. Expected: one warning, `wishem: the hub is not reachable. The page tries again.` The picture stays. (not checked by the writer of this guide in a browser)
3. In terminal 1, run the command of step 7.1 again.
4. Expected: the page shows the model again within 5 seconds, with no reload. (not checked by the writer of this guide in a browser)

### 7.7 Two pages

Open the address in two tabs. Do step 7.4. Expected: each tab shows the new title. (not checked by the writer of this guide in a browser)

### 7.8 Cases of failure

**The port of the page is in use.** Keep the workbench of 7.1 running. In terminal 2:

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --model /tmp/a1-model --hub-port 4800
```

Result (exit code 1; pnpm adds more lines):

```text
wishem: model /tmp/a1-model
wishem: port 5173 is in use
```

**The port of the hub is in use.**

```sh
pnpm --filter @thrashplay/wishem-workbench-app start --model /tmp/a1-model --port 5200
```

Result (exit code 1):

```text
wishem: model /tmp/a1-model
wishem: port 4747 is in use
```

**A page of a different site.** The proxy of the page passes the `Origin` header of the request. Run the command of step 3.6 again, with the address `http://127.0.0.1:5173/link`. Result: `HTTP/1.1 403 Forbidden`. With the header `Origin: http://127.0.0.1:5173`, the first line is `HTTP/1.1 101 Switching Protocols`.

**A model that is not correct at the start.** Stop the workbench. Break the file and start again:

```sh
echo '{ nope' > /tmp/a1-model/state.json
pnpm --filter @thrashplay/wishem-workbench-app start --model /tmp/a1-model
```

The writer did not do this exact step. The specification says that the script prints each problem and stops with exit code 1. The writer did the same check with `wishem start` (step 1.4).

Stop the workbench with Ctrl+C. The writer stopped it with the interrupt signal, and no process stayed alive.

### 7.9 The base workbench command

The package `@thrashplay/wishem-workbench` has a `start` script that runs only the construct, with the first model:

```sh
pnpm --filter @thrashplay/wishem-workbench start --port 4811
```

Result:

```text
$ wishem start ./model --port 4811
wishem: model /workspace/.../nodejs/wishem/workbench/model
wishem: 1 component type, 1 entity
wishem: link at ws://127.0.0.1:4811/link
```

The first model has one component type, `AppBar`, and one entity with the title `Wishem`.

## 8. The time subsystem and the clock

The package `@thrashplay/wishem-clock` has the model subsystem `time` and a clock. No command starts a clock yet. `clock-demo.mjs` runs a hub with both.

```sh
node nodejs/wishem/docs/milestones/a1-construct/clock-demo.mjs
```

Result (the program runs for about 1 second):

```text
running for 350 ms
#1 time/advance from clock {"now":100,"ticks":1,"running":true}
#2 time/advance from clock {"now":200,"ticks":2,"running":true}
#3 time/advance from clock {"now":300,"ticks":3,"running":true}
pause
#4 time/set-running from controls {"now":300,"ticks":3,"running":false}
step once while paused
#5 time/advance from controls {"now":400,"ticks":4,"running":false}
resume
#6 time/set-running from controls {"now":400,"ticks":4,"running":true}
#7 time/advance from clock {"now":500,"ticks":5,"running":true}
#8 time/advance from clock {"now":600,"ticks":6,"running":true}
refused input: {"ok":false,"reason":"invalid","problems":[{"message":"The length must be a finite number larger than 0.","path":["ms"]}]}
stopped
```

What the lines show:

- The clock sends one tick of 100 ms for each 100 ms of real time. The time `now` goes up by 100 for each tick.
- While `running` is `false`, the clock sends no tick. A tick from `controls` still applies (the step).
- After the resume, the ticks continue. The time of the pause causes no extra ticks.
- A length that is not larger than 0 is refused.

The number of ticks before the pause can be 2 or 3 on a slow computer. The values of `now` stay multiples of 100.

## Known faults

### A change of `state.json` by hand is not followed after the construct wrote the file

Issue: [#579](https://github.com/twin-digital/opus/issues/579).

After the construct writes `state.json` (section 6), the construct no longer follows changes of `state.json`. The construct follows changes of the definition files.

Steps:

1. Put the copy back. Start the construct (step 1.1) in terminal 1.
2. In terminal 2, run `node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs` and leave it open.
3. In terminal 3, run `node nodejs/wishem/docs/milestones/a1-construct/link-client.mjs --once --title Hello`.
4. Terminal 2 prints the `applied #1 store/set-field` lines. The construct wrote `state.json`.
5. In terminal 3, run `sed -i 's/"Hello"/"By hand"/' /tmp/a1-model/state.json`.
6. Wait 2 seconds.

Expected result (from the specification): terminal 2 prints `applied #2 store/replace-model from files` and the title `By hand`.

Real result: terminal 2 prints no line. Terminal 1 prints no line. The construct keeps the title `Hello`. The writer repeated the edit three times with a write in place, with a wait of 2 seconds each, and one time with `sed -i`. No edit was followed. A new start of the construct reads the file again.

The same step with no earlier write through the link works (step 2.1). An edit of a definition file after the write also works. The writer did not find the cause. The specification of the model folder says that a person can change the files while the construct runs. The workbench uses the same construct, so it has the same fault. The writer did not check it in the workbench. The page sends no input, so a person meets the fault only with a program such as `link-client.mjs --title`.

The writer did not create an issue of the type `Bug`. The lead agent does that.

## Not in this milestone

You will not find these in the workbench or in the packages:

- An edit of the model from the page. The page only draws the model. It sends no input.
- A clock in the workbench. No command starts the clock, and the workbench has no `time` part.
- A rewind, a replay, or a save of the record. The hub keeps the record in memory. The record is lost when the process stops.
- A renderer for PixiJS or for Godot. The page is the only renderer. It draws the component type `AppBar` only.
- A build to install. All packages are private, and the commands run from the repository.
- A model subsystem in a client of the link. A hello with the kind `model` is refused.
- Messages of the link for a record or for a past state. A client gets the joined state and each later change only.
- A write of the definition files. The construct never writes them. A definition change through the link stays in the construct. It is lost at a stop (step 6.4).
- A message of a problem on the page. A model that is not correct shows only in the terminal.
- A control for the theme of the page. The theme follows the color scheme of the system.
- A link on an address other than `127.0.0.1`. The server listens only on the loopback address.
- A way to make or delete a component type from the page or from a command.
