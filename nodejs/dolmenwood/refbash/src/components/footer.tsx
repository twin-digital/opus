import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { Panel } from './panel.js'
import { randomUUID } from 'node:crypto'

type FooterContent = React.ReactNode | null

interface FooterController {
  /**
   * Sets the content to display in the footer.
   *
   * @param content New footer content
   * @param owner Unique id of the content's owner
   */
  setContent(content: FooterContent, owner?: string): void

  /**
   * Clears the footer content set by the specified owner.
   *
   * @param owner Owner whose content should be cleared.
   */
  clearContent(owner?: string): void

  /**
   * ID of the component currently in control of the footer's content.
   */
  currentOwner: string | null
}

const FooterContext = createContext<FooterController | null>(null)

export const useFooterController = () => {
  const ctx = useContext(FooterContext)
  if (!ctx) {
    throw new Error('useFooterController must be used inside <FooterProvider>')
  }

  return ctx
}

export const useFooter = (createContent: () => ReactNode, dependencies: DependencyList = []) => {
  const footer = useFooterController()
  const owner = useRef(randomUUID())

  useEffect(() => {
    const content = createContent()
    if (content === null) {
      footer.clearContent(owner.current)
    } else {
      footer.setContent(content, owner.current)
    }

    return () => {
      footer.clearContent(owner.current)
    }
  }, [createContent, footer, owner, ...dependencies])
}

export const FooterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [content, setContent] = useState<FooterContent>(null)
  const [owner, setOwner] = useState<string | null>(null)

  const controller = useMemo<FooterController>(
    () => ({
      setContent(next, nextOwner) {
        // naive single-owner version; can get fancier later with priorities/stack
        setContent(next)
        if (nextOwner) {
          setOwner(nextOwner)
        }
      },
      clearContent(callerOwner) {
        // If no owner specified or caller matches current owner, clear
        if (!callerOwner || callerOwner === owner) {
          setContent(null)
          setOwner(null)
        }
      },
      currentOwner: owner,
    }),
    [owner],
  )

  return (
    <FooterContext.Provider value={controller}>
      {/* content is exposed via another context or direct render in App */}
      <Panel flexDirection='column' flexGrow={1}>
        {children}
      </Panel>

      {/* footer host lives here */}
      {content && (
        <Panel minHeight={1} padding={1}>
          {content}
        </Panel>
      )}
    </FooterContext.Provider>
  )
}
