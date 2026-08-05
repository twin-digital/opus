// The kit declares this module in `src/internal`, where nothing imports it, so a package compiling
// the kit through the `source` condition never sees the declaration and `tsc --noEmit` fails on the
// kit's own enumerator. Repeated here until the kit's declaration reaches a source-condition
// consumer, at which point this file goes.
declare module '@npmcli/map-workspaces'
