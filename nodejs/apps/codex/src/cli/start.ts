import { Command, Flags } from '@oclif/core'
import type { OptionFlag } from '@oclif/core/interfaces'
import { runBot } from '../bot/bot.js'
import { makeDiceRollerBehavior } from '../bot/dice-roller/behavior.js'

export default class Start extends Command {
  static override description = 'Run the Codex Discord bot'

  static override examples: string[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --region us-west-2',
  ]

  static override flags: {
    'app-id': OptionFlag<string>
    diceChannelId: OptionFlag<string | undefined>
    token: OptionFlag<string>
  } = {
    diceChannelId: Flags.string({
      description:
        'ID of the Discord channel in which to respond to dice roll commands',
      env: 'CODEX_DICE_CHANNEL_ID',
      required: false,
    }),
    'app-id': Flags.string({
      description: 'Discord application ID',
      env: 'DISCORD_APP_ID',
      required: true,
    }),
    token: Flags.string({
      description: 'Discord bot token',
      env: 'DISCORD_TOKEN',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Start)

    const log = this.log.bind(this)

    const diceChannelId = flags.diceChannelId
    const behaviors =
      diceChannelId === undefined ?
        []
      : [
          makeDiceRollerBehavior({
            channelIds: [diceChannelId],
            log,
          }),
        ]

    // graceful shutdown helpers
    await runBot({
      appId: flags['app-id'],
      behaviors,
      log,
      token: flags.token,
    })

    // const commands = [
    //   new SlashCommandBuilder().setName('greet').setDescription('Greet Codex'),
    //   // .addStringOption((o: any) =>
    //   //   o.setName('q').setDescription('Your question').setRequired(true),
    //   // ),
    //   // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    // ].map((c: any) => c.toJSON())

    // Register slash commands
    // this.log('Registering slash commands...')
    // const rest = new REST({ version: '10' }).setToken(flags.token)
    // await rest.put(Routes.applicationCommands(flags['app-id']), {
    //   body: commands,
    // })
    // this.log('Slash commands registered')

    // Handle interactions
    // client.on('interactionCreate', (interaction: Interaction) => {
    //   if (
    //     !interaction.isChatInputCommand() ||
    //     interaction.commandName !== 'greet'
    //   ) {
    //     return
    //   }

    //   void (async () => {
    //     // const question = interaction.options.getString('q', true)
    //     await interaction.deferReply({ ephemeral: true })

    //     try {
    //       this.log('Sending a greeting')
    //       await interaction.editReply('Hello!')
    //     } catch (error) {
    //       this.log(`Error answering question: ${(error as Error).message}`)
    //       await interaction.editReply(
    //         'Sorry—something went wrong retrieving that.',
    //       )
    //     }
    //   })()
    // })
  }
}
