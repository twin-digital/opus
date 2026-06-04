import AnthropicBedrock from '@anthropic-ai/bedrock-sdk'

import type { Llm } from './chronicle.js'

/**
 * Bedrock model ID for Claude Haiku. Overridable via env: some accounts require a
 * region-scoped inference profile (e.g. `us.anthropic.claude-haiku-4-5`) rather than the
 * bare `anthropic.`-prefixed ID.
 */
const MODEL = process.env.CHRONICLER_MODEL ?? 'anthropic.claude-haiku-4-5'

/**
 * An {@link Llm} backed by Claude Haiku on Amazon Bedrock.
 *
 * `AnthropicBedrock()` resolves AWS credentials and region from the standard chain
 * (`AWS_REGION`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`, shared
 * profile, or instance role). One-shot, single user message — no thinking/effort (Haiku
 * does not accept the effort parameter).
 */
export const bedrock: Llm = async (prompt) => {
  const client = new AnthropicBedrock()
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
}
