import base from '@twin-digital/eslint-config'

const infraMessage = 'Runtime code (src/) must not import infrastructure libraries.'

const srcImportBans = {
  paths: [
    { name: 'aws-cdk-lib', message: infraMessage },
    { name: 'constructs', message: infraMessage },
  ],
  patterns: [
    { group: ['aws-cdk-lib/*'], message: infraMessage },
    {
      group: ['**/infra/**'],
      message: 'Runtime code (src/) must not import from infra/ — infra depends on src, never the reverse.',
    },
  ],
}

export default [
  // cdk.out holds synthesized templates and the bundled Lambda — generated artifacts, not source.
  { ignores: ['cdk.out'] },
  ...base,
  // Enforce the one-directional boundary: infra/ may depend on src/, never the reverse.
  {
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', srcImportBans] },
  },
]
