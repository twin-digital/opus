import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: 'src/*.ts',
  noExternal: [/^@twin-digital\//],
  shims: true,
})
