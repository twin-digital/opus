import base from '@twin-digital/eslint-config'

const cdkImportBan = {
  paths: [
    {
      name: 'aws-cdk-lib',
      message: 'Runtime code (src/) must not import infrastructure libraries.',
    },
    {
      name: 'constructs',
      message: 'Runtime code (src/) must not import infrastructure libraries.',
    },
  ],
  patterns: ['aws-cdk-lib/*'],
}

export default [
  // cdk.out holds synthesized templates and the bundled Lambda — generated artifacts, not source.
  { ignores: ['cdk.out'] },
  ...base,
  // Enforce the one-directional boundary: infra/ may depend on src/, never the reverse.
  {
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', cdkImportBan] },
  },
]
