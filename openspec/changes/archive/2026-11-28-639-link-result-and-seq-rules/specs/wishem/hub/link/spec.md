## ADDED Requirements

### Requirement: A remote port closes the connection for a malformed message

A remote port SHALL close the connection and treat the link as ended when a message of the hub side is malformed. A `welcome` is malformed when its status is not `created` or `running`. A `result` is malformed when it has both keys `result` and `error` or neither, or when its `result` is not an object with a boolean `ok`. A number of `welcome`, of the input of `applied`, or `request` of `result` that is not an integer from 0 to 2^53 - 1 makes its message malformed.

#### Scenario: A result with two keys

- **WHEN** a remote port gets a `result` message with the key `result` `{ "ok": true, "seq": 4 }` and the key `error` `"It broke."`
- **THEN** the remote port closes the connection, the send of that request fails, and the code that opened the link learns that the link ended

#### Scenario: A welcome with a fractional sequence number

- **WHEN** a remote port gets a `welcome` message with the `seq` 3.5
- **THEN** the remote port closes the connection at once, and the code that opened the link gets a failure

#### Scenario: A welcome with a negative sequence number

- **WHEN** a remote port gets a `welcome` message with the `seq` -1
- **THEN** the remote port closes the connection, and the code that opened the link gets a failure

#### Scenario: A welcome with the status stopped

- **WHEN** a remote port gets a `welcome` message with the status `stopped`
- **THEN** the remote port closes the connection, and the code that opened the link gets a failure

#### Scenario: A result with a fractional request number

- **WHEN** a remote port gets a `result` message with the `request` 1.5
- **THEN** the remote port closes the connection and reports that the link ended

#### Scenario: A result with no ok

- **WHEN** a remote port gets a `result` message with the key `result` `{ "seq": 4 }`
- **THEN** the remote port closes the connection and reports that the link ended

#### Scenario: A whole number that a parser gives as a floating-point number

- **WHEN** a remote port gets a `welcome` message with the `seq` `3.0`
- **THEN** the link starts, and the next `applied` message has the sequence number 4
