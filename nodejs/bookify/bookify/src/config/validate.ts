import { Ajv, type JSONSchemaType } from 'ajv'
import type { BookifyProjectConfig } from './model.js'

const ajv = new Ajv()

const bookifyProjectConfigSchema = {
  type: 'object',
  properties: {
    assetPaths: {
      anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }, { type: 'null' }],
      description:
        'Optional path(s) to the asset root(s) from which images and other data files will be loaded. This is relative to the project file. Can be a single path string or an array of paths.',
    },
    css: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Optional list of declared CSS entries',
    },
    inputs: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Declared input files',
    },
    pdf: {
      type: 'object',
      properties: {
        renderer: {
          type: 'string',
          enum: ['euro-pdf'],
          nullable: true,
          description: 'Name of the renderer to use.',
        },
        rendererOptions: {
          type: 'object',
          additionalProperties: { type: 'string' },
          nullable: true,
          required: [],
          description:
            "Optional arguments to pass to the renderer implementation. Default values will be set from environment variables. The value of the `renderer` property will be converted to all-caps snakecase (e.g., 'euro-pdf' becomes 'EURO_PDF'), and then similarly cased option names may be appended (separated by an underscore). For example, if the renderer name is 'euro-pdf', the following are some example renderer options that will be set from the environment: EURO_PDF_API_KEY, EURO_PDF_TEST_MODE. Similar logic is applied to other renderers and/or option names.",
        },
      },
      nullable: true,
      required: [],
      description: 'Options for configuring how PDFs are rendered.',
    },
  },
  required: ['inputs'],
  additionalProperties: false,
} as const satisfies JSONSchemaType<BookifyProjectConfig> extends infer _T ? object : never

export const validateConfig = ajv.compile<BookifyProjectConfig>(bookifyProjectConfigSchema)
