// https://github.com/zirkelc/serverless-esm-ts
// https://github.com/serverless/serverless/issues/11039#issuecomment-1935514544

const { createJiti } = require('jiti')
const jiti = createJiti(null, { interopDefault: true })

module.exports = jiti.import(`${__dirname}/serverless.ts`, { default: true })
