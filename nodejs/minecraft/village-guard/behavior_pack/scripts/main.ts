import { world } from '@minecraft/server'

import { installProtection } from '../../src/protection.js'

// Module scope, so the subscriptions stand before anything in the world can be hurt. Subscribing is
// allowed during early execution; nothing else here touches the engine.
installProtection({ world })
