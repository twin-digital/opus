import { Section } from '../Section.js'

const Code = ({ children }: { children: string }) => (
  <code className='rounded-sm bg-fg/10 px-1 font-mono text-[0.92em] font-medium'>{children}</code>
)

/** Layout, density, and tone conventions, as short prose. */
export const Principles = () => (
  <Section id='principles' title='Principles'>
    <p className='max-w-[70ch] text-ui'>
      The workbench is quiet and its surfaces are flat. Color says who acted. <Code>maker</Code> is the designer,{' '}
      <Code>spirit</Code> is Wishem, and <Code>accent</Code> belongs to no one.
    </p>
    <ul className='list-disc space-y-1 pl-5 text-ui'>
      <li>A status never uses the maker colors or the spirit colors.</li>
      <li>
        On a bright fill, text is always <Code>ink</Code>.
      </li>
      <li>A component uses roles only. It never uses a palette color or a color value.</li>
      <li>The theme follows the system. No control changes it.</li>
    </ul>
  </Section>
)
