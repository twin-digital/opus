import { Command, Flags } from '@oclif/core'
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js'
import * as path from 'node:path'
import { createKnowledgeBase } from '../../app/knowledge-base.js'
import { askRulesQuestion } from '../../app/ask-rules-question.js'

export default class Run extends Command {
  static override description = 'Run the Dolmenwood Discord bot'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --region us-west-2',
  ]

  static override flags = {
    token: Flags.string({
      description: 'Discord bot token',
      env: 'DISCORD_TOKEN',
      required: true,
    }),
    'app-id': Flags.string({
      description: 'Discord application ID',
      env: 'DISCORD_APP_ID',
      required: true,
    }),
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
    const { flags } = await this.parse(Run)

    this.log('Initializing Discord bot...')

    // Load vector store
    const indexPath = path.resolve(flags.index, 'vector_store')

    // Load the knowledge base
    this.log(`Loading vector store from ${indexPath}...`)
    let knowledgeBase
    try {
      knowledgeBase = await createKnowledgeBase(indexPath, flags['embeddings-model'])
      this.log('Vector store loaded successfully')
    } catch (error) {
      const err = error as Error
      this.error(`Failed to load vector store from ${indexPath}: ${err.message}`)
    }

    // Setup Discord bot
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
    const client = new Client({ intents: [GatewayIntentBits.Guilds] })

    const commands = [
      new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask a Dolmenwood rules question')
        .addStringOption((o: any) => o.setName('q').setDescription('Your question').setRequired(true)),
    ].map((c: any) => c.toJSON())

    // Register slash commands
    this.log('Registering slash commands...')
    const rest = new REST({ version: '10' }).setToken(flags.token)
    await rest.put(Routes.applicationCommands(flags['app-id']), {
      body: commands,
    })
    this.log('Slash commands registered')

    // Handle bot ready event
    client.on('ready', () => {
      this.log(`Bot logged in as ${client.user?.tag}`)
    })

    // Handle interactions
    client.on('interactionCreate', (interaction: any) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'ask') return

      void (async () => {
        const question = interaction.options.getString('q', true) as string
        await interaction.deferReply({ ephemeral: true })

        try {
          this.log(`Answering question: ${question}`)
          const answer = await askRulesQuestion({
            knowledgeBase,
            question,
            llmModelId: flags['llm-model'],
            resultCount: flags.results,
            maxTokens: flags['max-tokens'],
          })
          await interaction.editReply(answer)
        } catch (error) {
          this.log(`Error answering question: ${(error as Error).message}`)
          await interaction.editReply('Sorry—something went wrong retrieving that.')
        }
      })()
    })

    // Login to Discord
    this.log('Logging into Discord...')
    await client.login(flags.token)
  }
}
