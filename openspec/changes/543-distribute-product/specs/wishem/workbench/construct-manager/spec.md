# Spec Delta

## ADDED Requirements

### Requirement: A product construct can serve other requests on the port of its link

The function that starts a product construct SHALL take an optional request handler, and SHALL give it to the server of its link. The product construct SHALL give the HTTP address of that server. The construct manager SHALL start each product construct with no handler.

#### Scenario: A handler

- **WHEN** a program starts a product construct on port 0 with a handler that answers `GET /` with status 200
- **THEN** `GET /` at the HTTP address of the construct gets status 200, and the link at the same port gives `welcome`

#### Scenario: The construct manager

- **WHEN** the construct manager starts the construct `play`
- **THEN** `GET /` at the address of its link gets status 404
