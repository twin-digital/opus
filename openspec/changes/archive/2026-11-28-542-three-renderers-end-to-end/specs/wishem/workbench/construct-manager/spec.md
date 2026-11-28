# Spec Delta

## ADDED Requirements

### Requirement: A product construct can serve its link on a given port

The function that starts a product construct SHALL take an optional port for its link. With no port, or with 0, the system SHALL select the port. The construct manager SHALL start each product construct with no port. When the port is in use, the start SHALL fail with the error of the server, and no hub, no clock, and no port SHALL stay.

#### Scenario: A given port

- **WHEN** a program starts a product construct with the port 4750 and that port is free
- **THEN** the address of the link is `ws://127.0.0.1:4750/link`

#### Scenario: The port is in use

- **WHEN** a program starts a product construct with a port that a different program uses
- **THEN** the start rejects with an error with the code `EADDRINUSE`, and no timer of the clock runs

#### Scenario: The construct manager

- **WHEN** an input subsystem starts the constructs `play` and `check`
- **THEN** the system selects the port of each one, and the two addresses are different
