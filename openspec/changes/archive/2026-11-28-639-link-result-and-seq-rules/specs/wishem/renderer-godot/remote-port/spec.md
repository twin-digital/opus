## ADDED Requirements

### Requirement: The remote port closes the connection for a malformed message

The remote port SHALL close the connection and treat the link as ended for each malformed message that the document of the protocol names. It SHALL obey the same rule as the reference client of `hub` for a `welcome` with a status other than `created` or `running`, for a `result` with both keys `result` and `error`, for a `result` with no boolean `ok`, and for a number that is not an integer from 0 to 2^53 - 1.

#### Scenario: A result with two keys

- **WHEN** an input port waits for the request 1, and the remote port gets `result` with the request 1, the key `result` `{ "ok": true, "seq": 4 }`, and the key `error` `"It broke."`
- **THEN** the remote port closes the socket, the port gives the failure of a closed link for the request 1, and `down` comes one time

#### Scenario: A welcome with the status stopped

- **WHEN** the remote port gets a `welcome` with the status `stopped`
- **THEN** the remote port closes the socket, gives no `linked`, and waits for the next attempt

#### Scenario: A welcome with a negative sequence number

- **WHEN** the remote port gets a `welcome` with the `seq` -1
- **THEN** the remote port closes the socket and gives no `linked`

#### Scenario: A result with no ok

- **WHEN** the remote port gets `result` with the key `result` `{ "seq": 4 }`
- **THEN** the remote port closes the socket and `down` comes one time
