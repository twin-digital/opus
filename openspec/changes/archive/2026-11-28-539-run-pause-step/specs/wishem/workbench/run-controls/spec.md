# Spec Delta

## Purpose

Defines the run controls of the workbench page: the controls that start, stop, pause, resume, step, and step back the product construct `play`, the inputs that each control sends to the workbench construct, the state that the controls show, and the result of a control.

## ADDED Requirements

### Requirement: The page shows the run controls with a construct list

When the output port of the workbench page reads a part `constructs`, the page SHALL show the run controls for the product construct with the ID `play`. With no part `constructs`, the page SHALL show no run controls.

#### Scenario: A workbench with a mounted product

- **WHEN** the workbench runs with `--product`, and a web browser opens the page
- **THEN** the page shows a toolbar with the name `Product controls` and a button `Run`

#### Scenario: A workbench with no product

- **WHEN** the workbench runs with no product, and a web browser opens the page
- **THEN** the page shows no toolbar `Product controls`

### Requirement: Run and Stop start and stop the product construct

When `play` is not in the list, or is wanted to stop, the button `Run` SHALL send `constructs/start` with `play`. When `play` failed, `Run` SHALL send `constructs/stop` and then `constructs/start` with `play`. While `play` is wanted to run, the button in the same place SHALL be `Stop`, and it SHALL send `constructs/stop` with `play`. Each input SHALL go through the input port of the page.

#### Scenario: Run

- **WHEN** `play` is not in the list, and the designer presses `Run`
- **THEN** the workbench record holds `constructs/start` with `play` from the source `page-<hex>-input`, and the controls show the status `Running` within 5 seconds

#### Scenario: Stop

- **WHEN** `play` runs, and the designer presses `Stop`
- **THEN** the workbench record holds `constructs/stop` with `play`, and the controls show the status `Stopped` and the button `Run`

#### Scenario: Run after a failure

- **WHEN** `play` has the status `failed`, and the designer presses `Run`
- **THEN** the page sends `constructs/stop` and then `constructs/start` with `play`

### Requirement: Pause and Resume set the time state

While `play` runs and its time state is `running`, the button `Pause` SHALL send `constructs/send` with `play` and `time/set-running` with `false`. While its time state is `paused`, the button in the same place SHALL be `Resume`, and it SHALL send `time/set-running` with `true` in the same way.

#### Scenario: Pause

- **WHEN** `play` runs, and the designer presses `Pause`
- **THEN** the controls show the status `Paused` and the button `Resume`, and the tick that the controls show does not change for 2 seconds

#### Scenario: Resume

- **WHEN** `play` is paused, and the designer presses `Resume`
- **THEN** the controls show the status `Running`, and the tick increases

### Requirement: Step sends one tick of the step length

While `play` is paused, the button `Step` SHALL send `constructs/send` with `play` and `time/advance` whose length is the `stepMs` of the part `time` of `play`, or 50 when the part has no `stepMs`. While `play` runs or has no part `time` on the stage link, `Step` SHALL be disabled.

#### Scenario: A step

- **WHEN** `play` of the sample product with its product code is paused at the tick `t`, and the designer presses `Step`
- **THEN** the controls show the tick `t + 1`, the time increases by 50 milliseconds, and the count on the stage is one more than before

#### Scenario: Step while the construct runs

- **WHEN** `play` runs with the time state `running`
- **THEN** the button `Step` is disabled

### Requirement: Step back rewinds one tick

While `play` is paused and its part `time` has a count of ticks larger than 0, the button `Step back` SHALL send `constructs/rewind` with `play` and `ticks` set to `1`. Otherwise `Step back` SHALL be disabled.

#### Scenario: A step back

- **WHEN** `play` is paused at the tick `t` larger than 0, and the designer presses `Step back`
- **THEN** the controls show the tick `t - 1` and the status `Paused`

#### Scenario: At the start

- **WHEN** `play` is paused at the tick 0
- **THEN** the button `Step back` is disabled

### Requirement: The controls show the state of the product construct

The controls SHALL show one status: `Not running` with no entry, `Starting` for the status `pending`, `Running` or `Paused` for the status `running` and its time state, `Stopped`, and `Failed` with the message of the entry. While the stage link has a part `time`, the controls SHALL show the tick and the time in seconds with two decimals.

#### Scenario: The readout

- **WHEN** `play` is paused with 42 ticks of 50 milliseconds
- **THEN** the controls show `Tick 42` and `2.10 s`

#### Scenario: A start that fails

- **WHEN** the product code has two behaviors with the same ID, and the designer presses `Run`
- **THEN** the controls show the status `Failed` and the message of the entry in an element with the role `alert`, and the button `Run`

### Requirement: A control shows a refusal

When the workbench hub refuses the input of a control, or when the result of the pass of that input in the entry has `"ok":false`, the controls SHALL show a line in an element with the role `alert` that names the control and the reason. The next accepted control SHALL remove the line. With no input port, each control SHALL be disabled.

#### Scenario: The workbench stopped

- **WHEN** the workbench process stopped, and the designer presses a control
- **THEN** the controls show `Not done. The workbench does not run. Start it, and try again.`, or each control is disabled because the page has no link

#### Scenario: A refused pass

- **WHEN** the product construct refuses the input of a control
- **THEN** the controls show a line with the name of the control and the reason of the result
