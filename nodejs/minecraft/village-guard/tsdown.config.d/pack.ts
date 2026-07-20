// village-guard is a single-file Bedrock script pack. Bundle to scripts/main.js
// (the manifest's module entry), no .d.ts; @minecraft/server stays external
// (runtime-provided), mc-scripting-core is inlined via the `source` condition
// from the base config. onSuccess assembles the shippable manifest into dist/
// so dist/ is a complete, installable pack (dist/manifest.json + scripts/main.js)
// — published in the npm tarball and cp'd into the dev server by deploy.mjs.
export default { entry: { 'scripts/main': 'src/main.ts' }, dts: false, onSuccess: 'node build-pack.mjs' }
