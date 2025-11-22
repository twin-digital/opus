import React, { useState } from 'react'
import { Box, useApp, useInput } from 'ink'
import { GameModes } from '@twin-digital/dolmenwood'
import { CampaignProvider } from './shared/game-context.js'
import { Header } from './shared/header.js'
import { Footer } from './shared/footer.js'
import { DungeonScreen } from './dungeon/dungeon-screen.js'
import { TravelScreen } from './travel/travel-screen.js'
import { CampingScreen } from './camping/camping-screen.js'
import { SettlementScreen } from './settlement/settlement-screen.js'
import { EncounterScreen } from './encounter/encounter-screen.js'
import { CombatScreen } from './combat/combat-screen.js'
import { useScreenSize } from 'fullscreen-ink'
import { campaignStore } from './store/game-state.js'

interface Props {
  name: string | undefined
}

const AppContent = () => {
  const { exit } = useApp()
  const [modeIndex, setModeIndex] = useState(2)

  // Calculate how many events can fit in the available space
  // height - 3 (header + borders) - 3 (footer + borders)
  const { height } = useScreenSize()
  const bodyHeight = height - 6

  const gameMode = GameModes[modeIndex]

  const adjustModeIndex = (adjustment = 1) => {
    setModeIndex((i) => {
      const newIndex = (i + adjustment + GameModes.length) % GameModes.length
      return newIndex
    })
  }

  useInput((input, _key) => {
    if (input === 'q') {
      exit()
      return
    }

    if (input === 'm') {
      adjustModeIndex(1)
    }

    if (input === 'M') {
      adjustModeIndex(-1)
    }
  })

  const renderModeScreen = () => {
    switch (gameMode.name) {
      case 'Dungeon':
        return <DungeonScreen rows={bodyHeight} />
      case 'Travel':
        return <TravelScreen />
      case 'Camping':
        return <CampingScreen />
      case 'Settlement':
        return <SettlementScreen />
      case 'Encounter':
        return <EncounterScreen />
      case 'Combat':
        return <CombatScreen />
      default:
        return <Box></Box>
    }
  }

  return (
    <Box flexDirection='column' flexGrow={1}>
      <Header />
      <Box flexDirection='column' flexGrow={1} paddingLeft={1} paddingRight={1}>
        {renderModeScreen()}
      </Box>
      <Footer />
    </Box>
  )
}

export default function App({ name: _name = 'Stranger' }: Props) {
  return (
    <CampaignProvider campaign={campaignStore.list()[0] ?? campaignStore.create()}>
      <AppContent />
    </CampaignProvider>
  )
}
