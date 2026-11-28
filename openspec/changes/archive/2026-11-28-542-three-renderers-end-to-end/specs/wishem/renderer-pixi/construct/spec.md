# Spec Delta

## REMOVED Requirements

### Requirement: The construct runs in a Node.js process

**Reason**: The PixiJS page draws the sample construct, which the three renderers share (`wishem/renderers/sample-construct`). The package `pixi-page` holds no construct.

**Migration**: Start the sample construct with `pnpm --filter @thrashplay/wishem-three-renderers construct`. Its link is at `ws://127.0.0.1:4750/link`.

### Requirement: The model of the construct has one clear-color entity

**Reason**: The sample construct starts from the model folder of the sample product. Its entity has a `Color` component.

**Migration**: Use the component type `Color` (`COLOR_TYPE` of `@thrashplay/wishem-sample-product`) in place of `Clear color`.

### Requirement: The color rule follows the count of ticks

**Reason**: The color behavior of the sample product sets the color at each tick (`wishem/sample-product/model`). One set of tests covers it.

**Migration**: Use the export `behaviors` of `@thrashplay/wishem-sample-product`. The colors and their order are the same.

### Requirement: The clock of the construct

**Reason**: The clock of the sample construct has the same step of 500 milliseconds (`wishem/renderers/sample-construct`).

**Migration**: None. A client of the link sends `time/set-running` to the sample construct.

### Requirement: A command starts the construct and the page server

**Reason**: The command of the PixiJS page starts only the page server (`wishem/renderer-pixi/page`). The command of the sample construct starts the construct.

**Migration**: Start the sample construct first, then `pnpm --filter @thrashplay/wishem-pixi-page start`.

### Requirement: The construct can start paused

**Reason**: The command of the sample construct has the option `--paused`.

**Migration**: Use `pnpm --filter @thrashplay/wishem-three-renderers construct --paused`.

### Requirement: The command stops the construct and the page server together

**Reason**: The construct and the page server are in different processes. Each command stops its own process.

**Migration**: Stop each command with Ctrl+C.
