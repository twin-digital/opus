// village-guard is a single-file Bedrock script pack: bundle to one main.js,
// no .d.ts. @minecraft/server stays external (runtime-provided); mc-pack-core
// is inlined via the `source` condition from the base config.
export default { entry: 'src/main.ts', dts: false }
