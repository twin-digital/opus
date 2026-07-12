import type { Program } from '../engine/program.js'
import { logger } from '../logger.js'
import { group } from '../ui/components/group.js'
import type { NovationLaunchpadMiniMk3 } from '../vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'

const log = logger.child({}, { msgPrefix: '[PROGRAM] ' })

export const createLiveModeProgram = ({ launchpad }: { launchpad: NovationLaunchpadMiniMk3 }): Program => ({
  getDrawable: () => group(),
  initialize: async () => {
    log.info('Initializing "Live Mode" program.')
    await launchpad.sendCommand('select-mode', 'live')
  },
})
