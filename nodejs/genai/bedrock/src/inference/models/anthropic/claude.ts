import type { ModelApiAdapter } from '../../inference-api.js'

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
 */
export interface ClaudeContentBlock {
  type: string
  text?: string
  image?: unknown
  id?: string
  name?: string
  input?: unknown
}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content:
    | { type: 'text'; text: string }[]
    | {
        type: 'image'
        source: {
          type: 'base64'
          media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
          data: string
        }
      }[]
}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
 */
export interface ClaudeTool {
  type: 'custom' | 'computer_20241022' | 'bash_20241022' | 'text_editor_20241022'
  name: string
  description?: string
  input_schema?: unknown
  display_height_px?: number
  display_width_px?: number
  display_number?: number
}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
 */
export interface ClaudeMessagesRequest {
  anthropic_version: 'bedrock-2023-05-31'
  anthropic_beta?: string[]
  max_tokens: number
  system?: string
  messages: ClaudeMessage[]
  temperature?: number
  top_p?: number
  top_k?: number
  tools?: ClaudeTool[]
  tool_choice?: {
    type: string
    name?: string
  }
  stop_sequences?: string[]
}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
 */
export type ClaudeStopReason =
  | 'end_turn' // The model reached a natural stopping point
  | 'max_tokens' // The generated text exceeded the value of the max_tokens input field or exceeded the maximum number of tokens that the model supports.
  | 'stop_sequence' // The model generated one of the stop sequences that you specified in the stop_sequences input field.
  | 'refusal' // Claude refuses to generate a response due to safety concerns
  | 'tool_use' // Claude is calling a tool and expects you to execute it
  | 'model_context_window_exceeded' // The model stopped generation due to hitting the context window limit.

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
 */
export interface ClaudeMessagesResponse {
  id: string
  model: string
  type: 'message'
  role: 'assistant'
  content: ClaudeContentBlock[]
  stop_reason: ClaudeStopReason
  stop_sequence?: string
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export const adapter: ModelApiAdapter<ClaudeMessagesRequest> = {
  createRequest: (request) => {
    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens ?? 1024,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: request.prompt }],
        },
      ],
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseResponse: (response: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const content = response.content as ClaudeContentBlock[] | undefined
    const textBlock = content?.find((block) => block.type === 'text')
    return {
      content: textBlock?.text,
    }
  },
}
