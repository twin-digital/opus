import type { RgbColor } from '../../../ui/color.js'

const getRandomInt = (max: number) => {
  return Math.floor(Math.random() * max)
}

export const fireworks = () => {
  const startX = 400 // getRandomInt(800)
  const starty = 400 //getRandomInt(800)
  const sparks = Array.from({ length: getRandomInt(4) + 4 }, () => ({
    x: startX,
    y: starty,
    vx: 1000 - getRandomInt(2000),
    vy: 1000 - getRandomInt(2000),
  }))

  return () => ({
    draw: () => {
      // const energy = (expireAt - currentTimeMillis()) / 2000
      // const rgb = Math.round(127 * energy)
      console.log(JSON.stringify(sparks, null, 2))
      return sparks.map(({ x, y }) => ({
        x: Math.round(x / 100),
        y: Math.round(y / 100),
        value: [0, 127, 0] as RgbColor,
      }))
    },
    tick: (elapsedSeconds: number) => {
      sparks.forEach((spark) => {
        // spark.vy -= 80 * elapsedSeconds
        spark.vx = spark.vx * (1 - elapsedSeconds * 2)
        spark.vy = spark.vy * (1 - elapsedSeconds * 2)
        spark.x -= spark.vx * elapsedSeconds
        spark.y -= spark.vy * elapsedSeconds

        if (spark.x < 0) {
          spark.x = 800
        }
        if (spark.y < 0) {
          spark.y = 800
        }
        if (spark.x > 800) {
          spark.x = 0
        }
        if (spark.y > 800) {
          spark.y = 0
        }
      })
    },
  })
}
