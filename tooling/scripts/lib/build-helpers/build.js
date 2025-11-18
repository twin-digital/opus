import { getBuildStrategy } from './detect.js'

export const makeBuilder = async () => {
  const builders = await getBuildStrategy()

  return {
    build: () => Promise.all(builders.map((builder) => builder.build())),
  }
}
