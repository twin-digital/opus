# Spec Delta

## MODIFIED Requirements

### Requirement: The construct manager starts each construct that is wanted to run

For each construct of the list that is wanted to run and has no product construct, the construct manager SHALL start one product construct in the process of the workbench. When the product construct serves its link, the construct manager SHALL report the status `running` with the address of the link and the time state. When the start fails, it SHALL report the status `failed` with a message.

#### Scenario: A start

- **WHEN** an input subsystem sends `constructs/start` with the construct `play`
- **THEN** the part `constructs` holds `play` with the status `running` and an address `ws://127.0.0.1:<port>/link`, and a client of that address gets a `welcome` message

#### Scenario: Two constructs

- **WHEN** an input subsystem starts the constructs `play` and `check`
- **THEN** each one has its own address, and an input to one changes only that one

#### Scenario: A start that fails

- **WHEN** the list of behaviors of the product holds two behaviors with the same ID, and the construct manager makes the hub of `play`
- **THEN** the part holds `play` with the status `failed` and the text of the error, and the workbench continues

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
