# Spec Delta

## MODIFIED Requirements

### Requirement: The construct manager starts each construct that is wanted to run

For each construct of the list that is wanted to run and has no product construct, the construct manager SHALL start one product construct in a Node.js child process of its own, the product construct process. When the product construct serves its link, the construct manager SHALL report the status `running` with the address of the link and the time state. When the start fails, it SHALL report the status `failed` with a message, and no process of the start SHALL stay.

#### Scenario: A start

- **WHEN** an input subsystem sends `constructs/start` with the construct `play`
- **THEN** the part `constructs` holds `play` with the status `running` and an address `ws://127.0.0.1:<port>/link`, and a client of that address gets a `welcome` message

#### Scenario: Two constructs

- **WHEN** an input subsystem starts the constructs `play` and `check`
- **THEN** each one has its own address, and an input to one changes only that one

#### Scenario: A start that fails

- **WHEN** the list of behaviors of the product holds two behaviors with the same ID, and the construct manager makes the hub of `play`
- **THEN** the part holds `play` with the status `failed` and the text of the error, the process of `play` ended, and the workbench continues

#### Scenario: A process of its own

- **WHEN** an input subsystem starts the constructs `play` and `check`
- **THEN** each one runs in a different process, and neither process is the process of the workbench

### Requirement: A product construct holds the product and no storage

A product construct SHALL have the model subsystems `time` and `store`, in this order. The model subsystem `store` SHALL be the update subsystem of a store that starts from the product model at the start, with the behaviors of the product, or with no behavior when the workbench has no product code. A product construct SHALL have a clock and SHALL have no storage subsystem. A product construct SHALL write no file.

#### Scenario: The sample product with its rules

- **WHEN** the workbench has the product code of the sample product, a construct runs for 500 milliseconds of real time, and a client reads it
- **THEN** the part `store` holds the entity of the product with a count larger than `0`, and the part `time` has `running` set to `true`

#### Scenario: A product with no rules

- **WHEN** the workbench has no product code, and a construct runs for 500 milliseconds
- **THEN** the part `time` has more than 0 ticks, and the count is the count of the product model

#### Scenario: A behavior that throws

- **WHEN** the product code has a behavior that throws, and an input subsystem sends `constructs/send` with `time/advance` to `play`
- **THEN** the part `constructs` holds the result of the pass with `"ok":false` and the reason `invalid`, and a problem names the behavior

#### Scenario: No file changes

- **WHEN** a construct runs, gets inputs, and is rewound
- **THEN** the `state.json` of the product folder does not change

#### Scenario: The code runs in the product construct process

- **WHEN** the product code writes the ID of its process to a file when it loads, and an input subsystem starts `play`
- **THEN** the file holds the ID of the process of `play`, and not the ID of the process of the workbench

### Requirement: The construct manager stops a construct that is not wanted

When a construct of the list is not wanted to run and has a product construct, the construct manager SHALL stop its clock and its hub, close its link, release its port, end its product construct process, and report the status `stopped`. A new start of the same ID SHALL start a new product construct from the product model at that time, with a new record. This SHALL also be true when the workbench hub applies the stop and the new start before the construct manager handles the stop.

#### Scenario: A stop

- **WHEN** `play` runs, and an input subsystem sends `constructs/stop` with `play`
- **THEN** each client of the link of `play` gets the `stopping` event, the address of `play` accepts no connection, the process of `play` ended, and the part holds `play` with the status `stopped`

#### Scenario: A stop and a start

- **WHEN** `play` ran with ticks and was stopped, and an input subsystem sends `constructs/start` with `play`
- **THEN** the store of the new `play` starts from the product model, its record starts at the sequence number 0, and it runs in a new process

#### Scenario: A stop and a start in one pass

- **WHEN** `play` runs with ticks, and the workbench hub applies `constructs/stop` with `play` and then `constructs/start` with `play` and `running` set to `false` before the construct manager handles the stop
- **THEN** each client of the old link gets the `stopping` event, the old address accepts no connection, the terminal shows the line of the stop and then a line of a start, and the part holds `play` with the status `running`, a new address, and the time state `paused`, and the new `play` has 0 ticks and a record that starts at the sequence number 0

### Requirement: The product constructs stop with the workbench

When the workbench stops, the construct manager SHALL stop each product construct before the workbench hub stops, and SHALL close its two ports. The product constructs and the construct list SHALL NOT be kept. A new start of the workbench SHALL have no product construct. When the process of the workbench ends for each other cause, each product construct process SHALL end in at most 2 seconds.

#### Scenario: The person stops the workbench

- **WHEN** `play` runs, and the person sends an interrupt signal to the `start` script of the workbench page
- **THEN** a client of the link of `play` gets the `stopping` event, the address of `play` accepts no connection, the process of `play` ended, and `node scripts/start.ts` stops with exit code 0

#### Scenario: The process of the workbench is killed

- **WHEN** `play` runs, and the process of the workbench gets `SIGKILL`
- **THEN** the process of `play` ended at most 2 seconds later, and the address of `play` accepts no connection

## ADDED Requirements

### Requirement: The construct manager reaches each product construct through a link

The construct manager SHALL attach the subsystems `construct-manager` and `construct-manager-reader` to the hub of a product construct through a link with the link protocol, on the IPC channel of the product construct process. The IDs `construct-manager` and `construct-manager-reader` SHALL be in use for the full life of the process, so a client of the WebSocket link gets `id-in-use` for them. The clock SHALL start only after this link is open.

#### Scenario: The first ticks are in the history

- **WHEN** `play` runs with its clock for 1 second, is paused with `n` ticks, and an input subsystem sends `constructs/rewind` with `play` and `ticks` set to `n - 1`
- **THEN** the part `time` of `play` has 1 tick

#### Scenario: A client with the ID of the construct manager

- **WHEN** `play` runs, and a client of the link of `play` sends `hello` with the input subsystem `construct-manager`
- **THEN** the client gets `refused` with the reason `id-in-use`, and no link opens

#### Scenario: A step back across the processes

- **WHEN** `play` is paused after 12 ticks, an input subsystem sends `product/set-field` that sets the color to `#b91c1c`, and then `constructs/rewind` with `ticks` set to `1`
- **THEN** the part `time` of `play` has 11 ticks, the store of `play` holds `#b91c1c`, and the record of `play` has no `time/advance` between the `hub/rewind` and the `store/set-field` of the step back

### Requirement: A product construct process that ends is a failed construct

When a product construct process ends while its construct is wanted to run, the construct manager SHALL report the status `failed` with the message `The process of the construct ended with the exit code <code>.` or `The process of the construct ended with the signal <signal>.` The workbench SHALL continue. The construct SHALL stay `failed` until a client sends `constructs/stop` and then `constructs/start`.

#### Scenario: A behavior that ends the process

- **WHEN** a behavior of `play` calls `process.exit(3)` at a tick
- **THEN** the part holds `play` with the status `failed` and the message `The process of the construct ended with the exit code 3.`, the address of `play` accepts no connection, and a client of the workbench link still gets a `welcome` message

#### Scenario: A start after the failure

- **WHEN** `play` failed, and an input subsystem sends `constructs/stop` and then `constructs/start` with `play`
- **THEN** `play` runs in a new process with the status `running`

### Requirement: A product construct process that does not answer is a failed construct

The construct manager SHALL end a product construct process with `SIGKILL` and report the status `failed` when the process does not start its link in 10 seconds, or does not answer a check or an input in 5 seconds. The message SHALL be `The construct did not start in 10 seconds.` or `The construct did not answer in 5 seconds.` Each other construct and the workbench SHALL continue.

#### Scenario: A behavior that does not end

- **WHEN** a behavior of `play` does not end at a tick
- **THEN** at most 7 seconds later the part holds `play` with the status `failed` and the message `The construct did not answer in 5 seconds.`, the process of `play` ended, and an input to `check` gives its result

#### Scenario: The workbench answers during the fault

- **WHEN** a behavior of `play` does not end at a tick, and a client of the workbench link sends `product/set-field`
- **THEN** the client gets the result in less than 1 second

### Requirement: Each product construct process loads the product code

Each product construct process SHALL load the product code from its file when it starts, and the process of the workbench SHALL NOT load it. A change of the file SHALL change no product construct that runs. A product construct that starts after the change SHALL run the changed code. When the module cannot be loaded or has no correct list `behaviors`, the start SHALL fail with the reason.

#### Scenario: A new version of the code

- **WHEN** `play` runs the product code, a person changes the count behavior in the file to add `10` at each tick, and an input subsystem sends `constructs/stop` and then `constructs/start` with `play`
- **THEN** the count of the new `play` grows by `10` at each tick

#### Scenario: A running construct keeps its code

- **WHEN** `play` runs the product code, and a person changes the count behavior in the file
- **THEN** the count of `play` still grows by `1` at each tick

#### Scenario: Code that cannot be loaded

- **WHEN** a person changes the file of the product code to a text that is not correct JavaScript, and an input subsystem starts `play`
- **THEN** the part holds `play` with the status `failed` and a message that names the error, and the workbench continues

### Requirement: A product construct process that does not end at a stop

When a product construct process does not end in 2 seconds after the construct manager tells it to stop, the construct manager SHALL end it with `SIGKILL` and SHALL report the status `stopped`.

#### Scenario: A process that does not end

- **WHEN** a behavior of `play` does not end, and an input subsystem sends `constructs/stop` with `play` before the construct manager finds that `play` does not answer
- **THEN** the process of `play` ended at most 3 seconds later, and the part holds `play` with the status `stopped`

### Requirement: The terminal shows the process and the output of each product construct

The construct manager SHALL print `wishem: construct <id> runs in the process <pid>` when a product construct process starts, before the line of its link. It SHALL print each line that the process writes to its standard output or its standard error, after the text `wishem: construct <id>: `.

#### Scenario: The line of the process

- **WHEN** an input subsystem starts `play`
- **THEN** the terminal shows `wishem: construct play runs in the process <pid>` and then `wishem: construct play runs, link at ws://127.0.0.1:<port>/link`, and `<pid>` is the ID of the process of `play`

#### Scenario: A line of the product code

- **WHEN** a behavior of `play` writes `hello` with `console.log`
- **THEN** the terminal shows `wishem: construct play: hello`
