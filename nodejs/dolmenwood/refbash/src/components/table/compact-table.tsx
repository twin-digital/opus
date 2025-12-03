import React, { type ReactElement } from 'react'
import { Box, Text, useInput, type BoxProps, type TextProps } from 'ink'
import get from 'lodash-es/get.js'
import type { ColorToken } from '../../theme/style-types.js'
import { StyledText } from '../styled-text.js'
import { Panel } from '../panel.js'
import { useTheme } from '../../store/hooks.js'
import type { TextStyle } from '../../theme/text.js'
import { useTableSelection } from './use-table-selection.js'
import noop from 'lodash-es/noop.js'

export interface ColumnDefinition {
  /**
   * How to align this column.
   */
  justify?: 'left' | 'center' | 'right'

  /**
   * Name of the data property to display for this column.
   */
  property: string

  /**
   * Options used to style and layout this column.
   */
  style?: Pick<
    BoxProps,
    | 'flexBasis'
    | 'flexDirection'
    | 'flexGrow'
    | 'flexShrink'
    | 'flexWrap'
    | 'paddingLeft'
    | 'paddingRight'
    | 'paddingX'
    | 'width'
  >

  /**
   * Column title, to displaay in the header.
   * @defaultValue use the property name
   */
  title?: string
}

export type CellStyle = TextStyle & { backgroundColor?: ColorToken }

/**
 * Enumerated list of 'borderStyle' options, with the addition of 'none'.
 */
export type BorderStyle = BoxProps['borderStyle'] | 'none'

export interface CompactTableProps {
  /**
   * Color to use for the borders between cells.
   */
  cellDividerColor?: TextProps['color']

  /**
   * Style to use for the borders between cells.
   * @defaultValue 'single'
   */
  cellDividerStyle?: BorderStyle

  /**
   * Amount of (horizontal) padding to include in each cell.
   * @default 1
   */
  cellPadding?: number

  /**
   * Style to apply to cells by default. May be overridden by {@link headerStyle} or the value returned by
   * {@link getRowStyle()}.
   */
  cellStyle?: CellStyle

  /**
   * Columns to render, specified either as a simple property name or a complete configuration with options such as
   * width and label. Default value is to display all properties of the data in natural order.
   */
  columns?: readonly (string | ColumnDefinition)[]

  /**
   * Data to render into this list
   */
  data: readonly object[]

  /**
   * Element to render if there is no data.
   * @default Display a default message.
   */
  emptyContent?: string | ReactElement

  /**
   * Optional function to extract a unique identifier from a data item. IDs are used to provide stable selection if the
   * underlying data changes. If not using selection (i.e. `onSelectRow` is undefined), then this will not be used. If
   * not provided, will use 'id', then 'iid', then fall back to array index.
   *
   * @param item The data item
   * @param index The index of the item in the data array
   * @returns A unique identifier for the item
   */
  getItemId?: (item: object, index: number) => string | number

  /**
   * Determines a row-specific style to use. May return undefined, in which case {@link cellStyle} (or a default style)
   * will be used.
   *
   * @param rowIndex Zero-based index of the row
   * @param data Data for the row
   * @returns The TextStyle to use for the row, if an override is required
   */
  getRowStyle?: (rowIndex: number, data: object) => TextStyle | undefined

  /**
   * Style overrides to apply to header cells.
   * @default use `cellStyle` values
   */
  headerStyle?: CellStyle

  /**
   * Optional callback which will be invoked when the user selects a row in this table. If set, then the table's UI may
   * be altered to include selection controls. These controls will not be displayed if this callback is undefined.
   */
  onSelectRow?: (rowIndex: number, data: object) => void
}

const defaultGetItemId = (item: object, index: number): string | number => {
  return get(item, 'id', get(item, 'iid', index))
}

const enumerateProperties = (data: readonly object[]) => Array.from(new Set(data.flatMap((item) => Object.keys(item))))

/**
 * Normalize the `columns` property so that any 'string' entries are specified as a full ColumnDefinition.
 */
const toColumnDefinitions = (columns: readonly (string | ColumnDefinition)[]): ColumnDefinition[] =>
  columns.map((c) =>
    typeof c === 'string' ?
      {
        property: c,
      }
    : c,
  )

/**
 * Returns an element which renders the specified 'value' with the supplied style. If a width is specified, the value
 * will be padded with spaces. The spaces are added before and/or after the value, as determined by the `alignment`
 * parameter.
 */
const makePaddedText = ({
  justify = 'left',
  style,
  value,
  width,
}: {
  justify?: 'left' | 'center' | 'right'
  style?: TextProps
  value: string
  width?: number
}) => {
  const padding = width === undefined ? 0 : width - value.length
  if (padding <= 0) {
    return <Text {...style}>{value}</Text>
  }

  let prePadding = ''
  let postPadding = ''

  if (justify === 'left') {
    postPadding = ' '.repeat(padding)
  } else if (justify === 'right') {
    prePadding = ' '.repeat(padding)
  } else {
    const leftPad = Math.floor(padding / 2)
    const rightPad = padding - leftPad
    prePadding = ' '.repeat(leftPad)
    postPadding = ' '.repeat(rightPad)
  }

  return (
    <>
      {prePadding.length > 0 ?
        <Text>{prePadding}</Text>
      : null}
      <Text {...style}>{value}</Text>
      {postPadding.length > 0 ?
        <Text>{postPadding}</Text>
      : null}
    </>
  )
}

export const CompactTable = ({
  cellDividerStyle,
  cellDividerColor,
  cellPadding = 1,
  cellStyle,
  columns,
  data,
  emptyContent,
  getItemId = defaultGetItemId,
  getRowStyle,
  headerStyle,
  onSelectRow,
}: CompactTableProps) => {
  const isSelectionEnabled = onSelectRow !== undefined
  const theme = useTheme()

  // Use the extracted selection hook
  const selection = useTableSelection({
    data,
    getItemId,
    isEnabled: isSelectionEnabled,
    onSelectRow: onSelectRow ?? noop,
  })

  // Handle arrow key input
  useInput((_, key) => {
    selection.handleArrowKey(key.upArrow, key.downArrow)
  })

  const resolvedCellDividerColor = cellDividerColor ?? theme.border.default
  const resolvedCellDividerStyle = cellDividerStyle ?? 'single'
  const resolvedCellStyle = cellStyle ?? {
    color: theme.text.default,
  }
  const resolvedHeaderStyle = headerStyle ?? {
    color: theme.text.accent,
  }

  const emptyContentElement =
    emptyContent === undefined ? undefined
    : typeof emptyContent === 'string' ? undefined
    : emptyContent
  const resolvedEmptyContent = emptyContentElement ?? (
    <Panel padding={1}>
      <StyledText type='bodySecondary'>{emptyContent}</StyledText>
    </Panel>
  )
  const resolvedColumns = columns ?? enumerateProperties(data)
  const columnDefinitions = toColumnDefinitions(resolvedColumns)

  const rows = data.map((item) => columnDefinitions.map((column) => String(get(item, column.property))))
  const rowIds = data.map((item, index) => get(item, 'id', get(item, 'iid', index)) as string | number)

  const columnValueWidths = columnDefinitions.map((column, colIndex) =>
    Math.max(column.title?.length ?? column.property.length, ...rows.map((row) => row[colIndex].length)),
  )

  const getBorderProps = (columnIndex: number) => {
    return resolvedCellDividerStyle === 'none' ?
        {}
      : {
          borderBottom: false,
          borderColor: resolvedCellDividerColor,
          borderLeft: columnIndex !== 0,
          borderRight: false,
          borderStyle: resolvedCellDividerStyle,
          borderTop: false,
        }
  }

  const getColumnLayoutProps = ({ style }: ColumnDefinition, index: number) => {
    const { paddingX, paddingLeft, paddingRight, ...rest } = style ?? {}
    const resolvedPaddingLeft = paddingLeft ?? paddingX ?? 1
    const resolvedPaddingRight = paddingRight ?? paddingX ?? 1

    const borderProps = getBorderProps(index)

    return {
      paddingLeft: resolvedPaddingLeft,
      paddingRight: resolvedPaddingRight,
      ...borderProps,
      ...rest,
    }
  }

  const makeRow = (rowIndex: number | null, rowId: number | string, rowValues: string[], type: 'header' | 'data') => {
    const defaultStyle = type === 'header' ? resolvedHeaderStyle : resolvedCellStyle
    const rowStyle = type === 'header' || rowIndex === null ? undefined : getRowStyle?.(rowIndex, data[rowIndex])
    const style = rowStyle ?? defaultStyle
    const selectedColor =
      isSelectionEnabled && rowIndex === selection.selectedRow ? theme.state.selected.dark : undefined

    const cells = columnDefinitions.map((column, index) => (
      <Box
        backgroundColor={selectedColor ?? style.backgroundColor}
        key={index}
        paddingX={cellPadding}
        {...getColumnLayoutProps(column, index)}
      >
        {makePaddedText({
          justify: column.justify,
          style,
          value: rowValues[index],
          width: columnValueWidths[index],
        })}
      </Box>
    ))

    const borderProps =
      resolvedCellDividerStyle === 'none' ?
        {}
      : {
          borderBottom: type === 'header',
          borderColor: resolvedCellDividerColor,
          borderLeft: false,
          borderRight: false,
          borderStyle: resolvedCellDividerStyle,
          borderTop: false,
        }

    return (
      <Box flexDirection='row' key={rowId} width='100%' {...borderProps}>
        {cells}
      </Box>
    )
  }

  return data.length === 0 ?
      resolvedEmptyContent
    : <Box flexDirection='column' width='100%'>
        {makeRow(
          null,
          'header',
          columnDefinitions.map((column) => column.title ?? column.property),
          'header',
        )}
        {rows.map((row, index) => makeRow(index, rowIds[index], row, 'data'))}
      </Box>
}
