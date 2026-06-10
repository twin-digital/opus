import { EmptyState, Page, PageHeader } from '../components/page.js'

/**
 * Shell-stage placeholder pages. Each renders a title + a one-line empty state;
 * the real per-area surfaces are separate later tasks.
 */

export function MetricsPage() {
  return (
    <Page>
      <PageHeader title='Metrics' />
      <EmptyState message='Cost and usage dashboards are deferred at MVP. Coming soon.' />
    </Page>
  )
}
