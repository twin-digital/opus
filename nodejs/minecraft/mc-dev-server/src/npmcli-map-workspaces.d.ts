// The kit ships this ambient declaration inside its own `src`, where it does not reach a package
// compiling the kit through the `source` condition. Repeated here so this package typechecks; it
// belongs in the kit.
declare module '@npmcli/map-workspaces'
