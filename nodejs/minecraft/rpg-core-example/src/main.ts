import { system, world } from '@minecraft/server'

import { installAdventure } from './adventure.js'

// Module scope, so the subscription stands before the world loads. Only subscribing happens
// during early execution; the engine is first touched from the worldLoad handler.
installAdventure({ world, system })
