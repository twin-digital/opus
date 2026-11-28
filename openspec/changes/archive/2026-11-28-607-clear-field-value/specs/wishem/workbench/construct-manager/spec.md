# Spec Delta

## MODIFIED Requirements

### Requirement: The construct manager sends each change of the product model

After each input that makes the part `product` of the workbench a different object, the construct manager SHALL send the change to each running product construct, with the source `construct-manager`. When only values of components that the two models both hold differ, it SHALL send one `store/set-field` for each changed or added value and one `store/clear-field` for each removed value. Each other value SHALL keep its live value. For each other change, it SHALL send one `store/replace-model`.

#### Scenario: A hand edit of a value

- **WHEN** a construct of the sample product runs with a count of `25`, and a person changes the color in the `state.json` of the product folder to `#b91c1c`
- **THEN** the store of the construct holds `#b91c1c`, its record holds one `store/set-field` with the source `construct-manager`, and the count continues from its live value

#### Scenario: An input to the product

- **WHEN** a construct runs, and an input subsystem sends `product/set-field` that sets the count to `100` in the workbench
- **THEN** the store of the construct holds the count `100` or a count that the ticks added to `100`

#### Scenario: A cleared value

- **WHEN** a construct of the sample product is paused with a count of `25`, and an input subsystem sends `product/clear-field` for the color in the workbench
- **THEN** the construct gets one `store/clear-field` for the color with the source `construct-manager`, its store holds no color, and it still holds the count `25`

#### Scenario: A hand edit removes a value

- **WHEN** a construct of the sample product runs, and a person removes the color from the `Color` component in the `state.json` of the product folder and keeps the empty component
- **THEN** the construct gets one `store/clear-field` for the color, and no `store/replace-model`

#### Scenario: A hand edit removes a component

- **WHEN** a construct runs, and a person removes the `Color` component of the sample entity in the `state.json` of the product folder
- **THEN** the construct gets one `store/replace-model` with the product model

#### Scenario: A change of a definition

- **WHEN** a construct runs, and the label of a component type of the product model changes
- **THEN** the construct gets one `store/replace-model` with the product model, and its entities are the entities of the product model

#### Scenario: A rewind of the workbench

- **WHEN** an input changed a value of the product, and `hub/rewind` of the workbench returns the part `product` to the value before that input
- **THEN** the construct gets one `store/set-field` with the earlier value, and its record holds no rewind

#### Scenario: A rewind of the workbench after a clear

- **WHEN** an input cleared a value of the product, and `hub/rewind` of the workbench returns the part `product` to the value before that input
- **THEN** the construct gets one `store/set-field` with the earlier value

#### Scenario: A rewind of the workbench after a set of a new value

- **WHEN** an input set a value for a field that had no value, and `hub/rewind` of the workbench returns the part `product` to the state before that input
- **THEN** the construct gets one `store/clear-field` for that field

#### Scenario: A change that the construct refuses

- **WHEN** the construct refuses an input of a change
- **THEN** the construct manager reports the message of the refusal for that construct, and it sends the next change
