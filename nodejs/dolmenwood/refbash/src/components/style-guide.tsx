import { Text } from 'ink'
import { Palette } from '../theme/colors.js'
import { StyledText } from './styled-text.js'
import { Panel } from './panel.js'

// Convert camelCase → "Capitalized Words 300"
const formatName = (key: string): string => {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2') // insert space before capitals
    .replace(/(\d+)/g, ' $1') // ensure numeric shade separated
    .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize first letter of each word
}

export const PalettePreview = () => {
  return (
    <Panel flexDirection='column'>
      <StyledText type='h1'>PALETTE</StyledText>
      {Object.entries(Palette).map(([key, hex]) => (
        <Text key={key} color={hex as string}>
          {formatName(key)}
        </Text>
      ))}
    </Panel>
  )
}

export const TextPreview = () => {
  return (
    <Panel flexDirection='column'>
      <StyledText type='h1'>TEXT TYPES</StyledText>
      <StyledText type={'h1'}>Heading1 Text</StyledText>
      <StyledText type={'h2'}>Heading2 Text</StyledText>
      <StyledText type={'strong'}>Strong Text</StyledText>
      <StyledText type={'body'}>Body Text</StyledText>
      <StyledText type={'bodySecondary'}>Secondary Text</StyledText>
      <StyledText type={'disabled'}>Disabled Text</StyledText>
      <StyledText type={'label'}>Label Text</StyledText>
      <StyledText type={'destructive'}>Destructive Text</StyledText>
      <StyledText type={'error'}>Error Text</StyledText>
      <StyledText type={'success'}>Success Text</StyledText>
      <StyledText type={'warning'}>Warning Text</StyledText>
      <StyledText type={'info'}>Info Text</StyledText>
    </Panel>
  )
}

export const BorderPreview = () => {
  return (
    <>
      <Panel flexDirection='column'>
        <StyledText type='h1'>BORDERS</StyledText>

        <Panel type='default'>
          <StyledText>Default Panel</StyledText>
        </Panel>
        <Panel type='box'>
          <StyledText>Box Panel</StyledText>
        </Panel>
        <Panel type='surface'>
          <StyledText>Surface Panel</StyledText>
        </Panel>
        <Panel title='Title' type='titled'>
          <StyledText>Titled Panel</StyledText>
        </Panel>
      </Panel>

      <Panel flexDirection='column'>
        <StyledText type='h1'>STATES</StyledText>
        <Panel state='current' title='Current' type='titled'>
          <StyledText>Current Panel</StyledText>
        </Panel>
        <Panel state='disabled' type='box'>
          <StyledText state='disabled'>Disabled</StyledText>
        </Panel>
        <Panel state='focus' type='box'>
          <StyledText state='focus'>Focus</StyledText>
        </Panel>
        <Panel state='error' type='box'>
          <StyledText state='error'>Error</StyledText>
        </Panel>
        <Panel state='info' type='box'>
          <StyledText state='info'>Info</StyledText>
        </Panel>
        <Panel state='success' type='box'>
          <StyledText state='success'>Success</StyledText>
        </Panel>
        <Panel state='warning' type='box'>
          <StyledText state='warning'>Warning</StyledText>
        </Panel>
      </Panel>
    </>
  )
}

export const StyleGuide = () => {
  return (
    <Panel flexDirection='row' gap={3}>
      <Panel flexDirection='column' gap={1}>
        <PalettePreview />
        <TextPreview />
      </Panel>
      <Panel flexDirection='column' gap={1}>
        <BorderPreview />
      </Panel>
    </Panel>
  )
}
