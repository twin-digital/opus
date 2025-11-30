import { TitledBox, type TitledBoxProps } from '@mishieck/ink-titled-box'
import { CompactTable, type CompactTableProps } from './compact-table.js'

export type TitledCompactTableProps = CompactTableProps &
  Pick<TitledBoxProps, 'titleJustify'> & {
    /**
     * Additional properties used to configure the table's outside container.
     */
    containerStyle?: Omit<
      TitledBoxProps,
      | 'borderBottom'
      | 'borderBottomColor'
      | 'borderBottomDimColor'
      | 'borderLeft'
      | 'borderLeftColor'
      | 'borderLeftDimColor'
      | 'borderRight'
      | 'borderRightColor'
      | 'borderRightDimColor'
      | 'borderStyle'
      | 'borderTop'
      | 'borderTopColor'
      | 'borderTopDimColor'
      | 'children'
      | 'flexDirection'
      | 'titleJustify'
      | 'titles'
      | 'titleStyles'
    > & {
      /**
       * Style to use for the container's border.
       * @defaultValue single
       */
      borderStyle?: TitledBoxProps['borderStyle']
    }

    /**
     * Title to use for the table
     */
    title: string
  }

export const TitledCompactTable = ({
  containerStyle,
  title,
  titleJustify,
  ...compactTableProps
}: TitledCompactTableProps) => {
  return (
    <TitledBox
      flexDirection='column'
      titleJustify={titleJustify}
      titles={[title]}
      borderStyle={containerStyle?.borderStyle ?? 'single'}
      {...containerStyle}
    >
      <CompactTable {...compactTableProps} />
    </TitledBox>
  )
}
