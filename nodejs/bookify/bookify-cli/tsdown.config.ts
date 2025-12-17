import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: 'src/**/*.ts',
  fixedExtension: false,
  hash: false,
  // noExternal: [/^@twin-digital\//],
  shims: true,
  unbundle: true,
})
