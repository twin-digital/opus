import React, { useState } from 'react'
import { Box, useApp, useInput } from 'ink'
import { type Delve } from '@twin-digital/dolmenwood'
import { ActivityHeader } from './components/activity-header.js'
import { Footer } from './components/footer.js'
import { DelveScreeen } from './components/delve-screen/delve-screen.js'
import { useScreenSize } from 'fullscreen-ink'
import { StoreProvider, useStore } from './store/store-context.js'
import { InputProvider } from './input/input-provider.js'
import { createRootStore } from './store/root-store.js'

interface Props {
  name: string | undefined
}

const AppContent = () => {
  const { exit: _exit } = useApp()
  const store = useStore()

  const [delve] = useState<Delve>(() => {
    return store.delves.list()[0] ?? store.delves.create()
  })

  // Calculate how many events can fit in the available space
  // height - 3 (header + borders) - 3 (footer + borders)
  const { height } = useScreenSize()
  const bodyHeight = height - 6

  useInput((_input, _key) => {
    // if (input === 'q') {
    //   exit()
    //   return
    // }
  })

  // const renderModeScreen = () => {
  //   switch (gameMode.name) {
  //     case 'Dungeon':
  //       return <DungeonScreen rows={bodyHeight} />
  //     case 'Travel':
  //       return <TravelScreen />
  //     case 'Camping':
  //       return <CampingScreen />
  //     case 'Settlement':
  //       return <SettlementScreen />
  //     case 'Encounter':
  //       return <EncounterScreen />
  //     case 'Combat':
  //       return <CombatScreen />
  //     default:
  //       return <Box></Box>
  //   }
  // }

  return (
    <Box width='100%' height='100%' backgroundColor='black' flexDirection='column'>
      <ActivityHeader activity={delve} />
      <Box flexDirection='column' flexGrow={1}>
        {/* {renderModeScreen()} */}
        <DelveScreeen delve={delve} rows={bodyHeight} />
      </Box>
      <Footer />
    </Box>
  )
}

export default function App({ name: _name = 'Stranger' }: Props) {
  return (
    <StoreProvider store={createRootStore()}>
      <InputProvider>
        <AppContent />
      </InputProvider>
    </StoreProvider>
  )
}
