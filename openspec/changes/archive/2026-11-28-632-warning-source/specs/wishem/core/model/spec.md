## MODIFIED Requirements

### Requirement: Component types with the same label

Two component types with the same label SHALL be a warning. A warning SHALL NOT make the model incorrect. Each warning SHALL name the definition of the later of the two component types in the list of definitions: its path SHALL be `definitions`, the index of that definition, and `label`. When three or more component types have one label, each component type after the first SHALL have one warning.

#### Scenario: Two component types with the label AppBar

- **WHEN** two component types with different IDs have the label `AppBar`
- **THEN** the model is correct, and a warning names the label and the two IDs

#### Scenario: The path of the warning names the later definition

- **WHEN** the definitions at the indexes 0 and 2 have the label `AppBar`, and the definition at the index 1 has a different label
- **THEN** the model is correct, and the warning has the path `["definitions", 2, "label"]`

#### Scenario: Three component types with one label

- **WHEN** the definitions at the indexes 0, 1, and 2 have the label `AppBar`
- **THEN** the model is correct, there are two warnings, one with the path `["definitions", 1, "label"]` and one with the path `["definitions", 2, "label"]`, and each warning names the ID of the definition at the index 0
