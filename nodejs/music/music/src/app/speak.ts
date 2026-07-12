import { isBrowser } from './is-browser.js'

export const speak = (text: string) => {
  if (isBrowser()) {
    console.warn(`Unable to 'speak' text from browser: ${text}`)
  } else {
    void import('node:child_process').then(({ exec }) => {
      exec(`say ${JSON.stringify(text)}`)
    })
  }
}
