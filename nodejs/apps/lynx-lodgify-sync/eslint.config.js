import base from '@twin-digital/eslint-config'

// cdk.out holds synthesized templates and the bundled Lambda — generated artifacts, not source.
export default [{ ignores: ['cdk.out'] }, ...base]
