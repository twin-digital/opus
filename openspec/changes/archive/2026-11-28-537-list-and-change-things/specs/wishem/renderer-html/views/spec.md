# Spec Delta

## MODIFIED Requirements

### Requirement: Each input of a view has one outcome

Each call of `setField` and of `submit` SHALL give a promise that resolves to one outcome and never rejects. The outcome SHALL be the result of the hub, `unknown` when the link ends before the result, or `failed` when the hub fails to apply the input. Each rejection SHALL hold a reason and a list of problems. The package SHALL export the same rule as a function that sends one input through an input port, for a part of a page that is not a view.

#### Scenario: The hub accepts the input

- **WHEN** the hub accepts the input with the sequence number 4
- **THEN** the outcome is `{ ok: true, seq: 4 }`

#### Scenario: The hub refuses the input

- **WHEN** the store refuses the input with a problem
- **THEN** the outcome has the reason `invalid` and that problem

#### Scenario: The link ends before the result

- **WHEN** a view sends an input, and the link ends before its `result` message
- **THEN** the outcome has the reason `unknown`, and the renderer does not send the input again

#### Scenario: The link ended before the call

- **WHEN** the link of the input port ended, and a view calls `wishem.setField`
- **THEN** the outcome has the reason `not-running`

#### Scenario: Two calls

- **WHEN** a view calls `wishem.setField` two times before the first outcome
- **THEN** the hub gets two inputs in the order of the calls, and each call gets its own outcome

#### Scenario: A part of a page that is not a view

- **WHEN** the product panel sends an input with the exported function, and the link ends before its `result` message
- **THEN** the function gives the outcome with the reason `unknown`, and it does not reject

#### Scenario: No input port

- **WHEN** a part of a page calls the exported function with no input port
- **THEN** the outcome has the reason `not-permitted`, and no input is sent
