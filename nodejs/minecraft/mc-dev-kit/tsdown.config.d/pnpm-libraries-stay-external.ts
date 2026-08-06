// pnpm's workspace enumeration libraries reach a native `.node` binding through @pnpm/create-cafs-store,
// which no bundler can inline. They are declared dependencies and install with the package, so they
// stay external; everything else, workspace sources included, still bundles.
export default {
  noExternal: (id: string) => !id.startsWith('@pnpm/'),
}
