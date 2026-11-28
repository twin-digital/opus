# Spec Delta

## ADDED Requirements

### Requirement: The root entry exports the rules of the product as wrapStore

The root entry of the package SHALL export the function `wrapStore`. It SHALL be the count rule: it SHALL take a store and return the model subsystem that the count rule gives. It SHALL be the one export that a product construct needs from the code of the product. The export SHALL import nothing of the workbench.

#### Scenario: The construct manager loads the rules

- **WHEN** the workbench names `@thrashplay/wishem-sample-product` as the product code, and a product construct gets three ticks
- **THEN** the count of the sample entity is three more than the count at the start

#### Scenario: The same rule

- **WHEN** a test gives the same store to `wrapStore` and to `withCountRule`, and applies the same tick to each result
- **THEN** the two parts are equal
