import React, { useState } from 'react'
import { useApp, useInput } from 'ink'
import { type Delve } from '@twin-digital/dolmenwood'
import { ActivityHeader } from './activity-header.js'
import { InputHelpLine } from './input-help-line.js'
import { DelveScreeen } from '../delve-screen/delve-screen.js'
import { useScreenSize } from 'fullscreen-ink'
import { StoreProvider, useStore } from '../../store/store-context.js'
import { InputProvider } from '../../input/input-provider.js'
import { createRootStore } from '../../store/root-store.js'
import { FooterProvider } from '../footer.js'
import { Panel } from '../panel.js'

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

  return (
    <Panel width='100%' height='100%' flexDirection='column'>
      <ActivityHeader activity={delve} />
      <FooterProvider>
        <DelveScreeen delve={delve} rows={bodyHeight} />
      </FooterProvider>
      <InputHelpLine />
    </Panel>
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
