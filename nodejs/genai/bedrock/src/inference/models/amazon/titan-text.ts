import type { ModelApiAdapter } from '../../inference-api.js'

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-text.html
 */
export interface TitanTextRequest {
  inputText: string
  textGenerationConfig?: {
    temperature?: number
    topP?: number
    maxTokenCount?: number
    stopSequences?: [string]
  }
}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-text.html
 */
export type TitanTextCompletionReason =
  | 'FINISHED' // The response was fully generated.
  | 'LENGTH' // The response was truncated because of the response length you set.
  | 'STOP_CRITERIA_MET' // The response was truncated because the stop criteria was reached.
  | 'RAG_QUERY_WHEN_RAG_DISABLED' // The feature is disabled and cannot complete the query.
  | 'CONTENT_FILTERED' // The contents were filtered or removed by the content filter applied.

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-text.html
 */
export interface TitanTextResponse {
  inputTextTokenCount: number
  results: [
    {
      tokenCount: number
      outputText: string
      completionReason: TitanTextCompletionReason
    },
  ]
}

export const adapter: ModelApiAdapter<TitanTextRequest> = {
  createRequest: (request) => {
    return {
      inputText: request.prompt,
      textGenerationConfig:
        request.maxTokens === undefined ?
          undefined
        : {
            maxTokenCount: request.maxTokens,
          },
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseResponse: (response: any) => {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      content: response.results?.[0]?.outputText as string | undefined,
    }
  },
}
