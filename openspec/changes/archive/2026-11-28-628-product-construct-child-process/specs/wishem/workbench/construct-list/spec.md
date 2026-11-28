## ADDED Requirements

### Requirement: A report of an earlier start changes nothing

The input `constructs/report` SHALL be able to hold the start number of the start that the report is about. When the start number of the report is not the start number of the entry, the construct list SHALL keep the same part. A report with no start number SHALL apply to the entry as before.

#### Scenario: A report of a start that a stop and a start replaced

- **WHEN** `play` has the start number `7`, an input subsystem sends `constructs/stop` and then `constructs/start` with `play` so that `play` has the start number `9`, and the construct manager sends `constructs/report` with `play`, the status `failed`, and the start number `7`
- **THEN** the part is the same object as before, and `play` has the status `pending` and the start number `9`

#### Scenario: A report of the current start

- **WHEN** `play` has the start number `9`, and the construct manager sends `constructs/report` with `play`, the status `failed`, and the start number `9`
- **THEN** the part holds `play` with the status `failed`
