import type { Id } from '@thrashplay/wishem-core'
import { ZeroState } from './ZeroState.js'

export interface EntityListItem {
  id: Id
  name: string
  shortId: string
}

export interface EntityListProps {
  items: readonly EntityListItem[]
  selected?: Id
  onSelect: (id: Id) => void
}

const label = 'font-mono text-label font-medium text-fg-muted uppercase'

/** A list of buttons, one for each entity. The selected item has `aria-current`. */
export const EntityList = ({ items, selected, onSelect }: EntityListProps) => (
  <nav aria-label='Entities' tabIndex={-1} className='min-w-0 focus:outline-none'>
    {items.length === 0 ?
      <div className='h-32'>
        <ZeroState label='Entities' message='No entities yet.' />
      </div>
    : <>
        <div className='flex items-center justify-between px-4 py-2'>
          <span className={label}>Entities</span>
          <span className={label}>{items.length}</span>
        </div>
        <ul>
          {items.map((item) => {
            const current = item.id === selected
            return (
              <li key={item.id}>
                <button
                  type='button'
                  aria-current={current ? 'true' : undefined}
                  onClick={() => {
                    onSelect(item.id)
                  }}
                  className={`grid w-full gap-0.5 border-s-2 px-4 py-2 text-start hover:bg-ground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${current ? 'border-accent' : 'border-transparent'}`}
                >
                  <span className={`text-ui break-words ${current ? 'text-accent-text' : 'text-fg'}`}>{item.name}</span>
                  <span className={label}>{item.shortId}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </>
    }
  </nav>
)
