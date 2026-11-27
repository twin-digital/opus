# Spec Delta

## ADDED Requirements

### Requirement: The clock sends no late ticks after a rewind

After the hub applies a rewind, the clock SHALL measure the real time again from the time of the rewind. The real time that passed before the rewind SHALL NOT cause ticks after it. While `running` is `true` after the rewind, the clock SHALL send the next tick one step length after the rewind.

#### Scenario: A rewind while the construct runs

- **WHEN** the step length is 50 milliseconds, the hub applies a rewind 120 milliseconds after the last tick, and the timer is called 20 milliseconds after the rewind
- **THEN** that call sends no tick, and a call 50 milliseconds after the rewind sends one tick

#### Scenario: A rewind to a pause

- **WHEN** `running` is `true`, and a rewind returns to a point at which `running` is `false`
- **THEN** the clock sends no tick until `running` becomes `true`
