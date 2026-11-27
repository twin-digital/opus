export interface PageShowTarget {
  addEventListener: (type: 'pageshow', listener: (event: PageTransitionEvent) => void) => void
}

/** Reloads the page when the browser restores it from the back/forward cache. */
export const reloadOnRestore = (target: PageShowTarget, reload: () => void): void => {
  target.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      reload()
    }
  })
}
