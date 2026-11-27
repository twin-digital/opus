# Spec Delta

## REMOVED Requirements

### Requirement: A snapshot holds the definitions and the authored state

**Reason**: The model in a construct is the part `store` of the joined state. The store gives that part, with the keys `definitions` and `entities`.

**Migration**: See the requirement "The store is a model subsystem that holds one model" of `wishem/core/store`. Read the model with `port.read().store`.

### Requirement: A core gives the current snapshot on request

**Reason**: The hub gives the joined state to each port, and a read changes nothing.

**Migration**: Use `read()` of a port. See "The joined state has one part for each model subsystem" of `wishem/hub/construct`, and "A remote port has the behavior of a port" of `wishem/hub/link` for a different process.

### Requirement: A core sends each new snapshot

**Reason**: The hub sends one `applied` event after each accepted input. The store keeps the same part object for an equal model, so a reader compares the part by identity.

**Migration**: Register a listener with `subscribe` of a port. On each `applied` event, read the part `store`, and draw only when it is a different object. See "The hub sends the events of the construct" of `wishem/hub/construct` and "An input replaces the model" of `wishem/core/store`.

### Requirement: A core holds only a correct model

**Reason**: The store checks its first model and each input with the rules of `wishem/core/model`.

**Migration**: See "A store starts from a correct model or from an empty model" and "The store refuses an input that makes the model incorrect" of `wishem/core/store`.

### Requirement: A core runs with no Node.js API

**Reason**: The package has no core. The rule moves to the store, which runs in a web browser and in Node.js.

**Migration**: See "The store runs with no Node.js API" of `wishem/core/store`.

### Requirement: The checks of the repository keep Node.js APIs out of the core

**Reason**: The package has no core. The check stays for the package `@thrashplay/wishem-core`, and the rule moves to `wishem/core/store`.

**Migration**: See "The checks of the repository keep Node.js APIs out of the core package" of `wishem/core/store`.

### Requirement: The read operations of a core are an interface of their own

**Reason**: A port has the read operations, and a remote port gives the same operations in a different process. The renderer declares the small interface that it reads.

**Migration**: Code that only reads attaches an output subsystem and uses `read` and `subscribe` of its port. See "An I/O subsystem attaches to a hub and gets a port" of `wishem/hub/construct`.
