import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: 'src/**/*.ts',
  fixedExtension: false,
  hash: false,
  inputOptions: {
    resolve: {
      conditionNames: ['source'],
    },
  },
  noExternal: () => true,
  shims: true,
  unbundle: false,
})
