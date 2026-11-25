export interface AppBarProps {
  /** The identity of the application. Drawn in lowercase. */
  title: string
}

/** The bar at the top of the workbench. It shows the title, with a full stop in the maker color. */
export const AppBar = ({ title }: AppBarProps) => (
  <header className='flex h-12 items-center border-b border-line bg-night px-4 text-on-night'>
    <h1 className='min-w-0 truncate font-display text-xl font-extrabold tracking-[-0.02em] lowercase'>
      {title}
      <span aria-hidden='true' className='text-maker'>
        .
      </span>
    </h1>
  </header>
)
