import { Args, Command, Flags } from '@oclif/core'
import * as path from 'node:path'
import { createKnowledgeBase } from '../../app/knowledge-base.js'
import { askRulesQuestion } from '../../app/ask-rules-question.js'

export default class Ask extends Command {
  static override description =
    'Ask a question using RAG (Retrieval-Augmented Generation) with the ingested rulebook index'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %> "What are the rules for initiative?"',
    '<%= config.bin %> <%= command.id %> "How does spell casting work?" --index ./custom/index',
    '<%= config.bin %> <%= command.id %> "What are the character classes?" --results 10',
  ]

  static override args = {
    question: Args.string({
      description: 'The question to ask about the rulebooks',
      required: true,
    }),
  }

  static override flags = {
    index: Flags.string({
      char: 'i',
      description: 'Directory containing the vector store index',
      default: '.data/index',
    }),
    results: Flags.integer({
      char: 'k',
      description: 'Number of similar chunks to retrieve for context',
      default: 6,
    }),
    'max-tokens': Flags.integer({
      description: 'Maximum tokens for the LLM response',
      default: 400,
    }),
    region: Flags.string({
      description: 'AWS Bedrock region',
      default: 'us-east-1',
      env: 'BEDROCK_REGION',
    }),
    'embeddings-model': Flags.string({
      description: 'AWS Bedrock embeddings model ID',
      default: 'amazon.titan-embed-text-v1',
      env: 'BEDROCK_EMBEDDINGS_ID',
    }),
    'llm-model': Flags.string({
      description: 'AWS Bedrock LLM model ID',
      default: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      env: 'BEDROCK_LLM_ID',
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Ask)

    const indexPath = path.resolve(flags.index, 'vector_store')

    // Load the knowledge base
    this.log(`Loading vector store from ${indexPath}...`)
    let knowledgeBase
    try {
      knowledgeBase = await createKnowledgeBase(
        indexPath,
        flags['embeddings-model'],
      )
    } catch (error) {
      const err = error as Error
      this.error(
        `Failed to load vector store from ${indexPath}: ${err.message}`,
      )
    }

    // Ask the question using the shared function
    const answer = await askRulesQuestion({
      knowledgeBase,
      question: args.question,
      llmModelId: flags['llm-model'],
      resultCount: flags.results,
      maxTokens: flags['max-tokens'],
    })

    this.log('')
    this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    this.log('ANSWER:')
    this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    this.log('')
    this.log(answer)
    this.log('')
  }
}
