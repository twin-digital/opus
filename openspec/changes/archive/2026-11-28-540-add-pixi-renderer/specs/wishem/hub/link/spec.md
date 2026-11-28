# Spec Delta

## ADDED Requirements

### Requirement: A client connects again after a link ends

The package `@thrashplay/wishem-hub` SHALL give a client that opens a link with a list of subsystems and, after each end of a link, opens a new link until the client is closed. Each link SHALL use new subsystem IDs. The client SHALL wait 500 milliseconds before the first new attempt, double the wait after each failed attempt up to 5 seconds, and wait 500 milliseconds again after a `welcome`. It SHALL send no input again after a link ends.

#### Scenario: The hub side stops and starts

- **WHEN** a client has a link, the hub side stops, and a new hub side starts at the same address
- **THEN** the client opens a new link with new IDs and gives the remote ports of the new link

#### Scenario: The waits

- **WHEN** the hub side is not reachable
- **THEN** the client tries again after 500 milliseconds, 1 second, 2 seconds, 4 seconds, and then each 5 seconds

#### Scenario: One report for each loss

- **WHEN** the link ends and three attempts fail
- **THEN** the client reports the loss one time

#### Scenario: The client is closed

- **WHEN** the client is closed during a wait, while a socket opens, or before the `welcome`
- **THEN** the client closes each open socket, opens no new link, and gives no port and no report of a loss
