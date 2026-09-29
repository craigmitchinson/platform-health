import { Page, REFRESHED_ISO } from '../components/Page'
import { BarList, Card, HeaderLabLegend, LabChip, StatusPill } from '../components/primitives'
import { ACTIONS } from '../data/actions'
import { DOMAINS, domainById, systemsOf } from '../data/domains'
import { filteredTeams } from '../data/health'
import { TEAMS, labById } from '../data/labs'
import type { Action } from '../data/types'
import { useFilters } from '../filter-context'
import { useTheme } from '../theme-context'

const daysAfterRefresh = (n: number) => new Date(Date.parse(REFRESHED_ISO) + n * 86_400_000).toISOString().slice(0, 10)
const WEEK = daysAfterRefresh(7)
const SOON = daysAfterRefresh(30)
/** Rows that fit the table card at 1080, under the summary row. */
const MAX_ROWS = 17
const TEAM_BY_ID = new Map(TEAMS.map((tm) => [tm.id, tm]))
const CORE_SYSTEMS = systemsOf(DOMAINS.filter((d) => !d.proposed))

function severityRank(a: Action) {
  return a.severity === 'act' ? 0 : 1
}

export function ActionsPage() {
  const t = useTheme()
  const { labId, teamId } = useFilters()

  const scope = filteredTeams(labId, teamId)
  const scopeIds = scope.map((tm) => tm.id)
  const scopeName =
    (teamId ? scope[0]?.name : labId ? labById(labId)?.name : undefined) ?? 'the estate'

  const actions = ACTIONS.filter((a) => scopeIds.includes(a.teamId))
    .slice()
    .sort((a, b) => severityRank(a) - severityRank(b) || a.due.localeCompare(b.due))
  const pastDue = actions.filter((a) => a.due < REFRESHED_ISO).length
  const dueSoon = actions.filter((a) => a.due >= REFRESHED_ISO && a.due <= SOON).length
  const actSeverity = actions.filter((a) => a.severity === 'act').length
  const buckets = [
    { id: 'week', label: 'This week', count: actions.filter((a) => a.due >= REFRESHED_ISO && a.due <= WEEK).length, colour: t.amber },
    { id: 'next', label: 'Next 30 days', count: actions.filter((a) => a.due > WEEK && a.due <= SOON).length, colour: t.green },
    { id: 'later', label: 'Later', count: actions.filter((a) => a.due > SOON).length, colour: t.line },
    { id: 'past', label: 'Past due', count: pastDue, colour: t.red },
  ]
  const tiles = [
    { label: 'Open', value: actions.length },
    { label: 'Due within 30 days', value: dueSoon },
    { label: 'Past due', value: pastDue },
    { label: 'Act', value: actSeverity },
  ]
  const visible = actions.slice(0, MAX_ROWS)

  const headline = `${actions.length} open action${actions.length === 1 ? '' : 's'} across ${scopeName}; ${pastDue} past due, ${dueSoon} due within 30 days.`
  const caption =
    visible.length < actions.length
      ? `Open actions by severity then due date, showing first ${visible.length} of ${actions.length}`
      : 'Open actions by severity then due date'

  const byDomain = DOMAINS.map((d) => ({
    label: d.name,
    value: actions.filter((a) => a.domainId === d.id).length,
  }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)

  return (
    <Page
      kicker="Actions"
      sources={CORE_SYSTEMS}
      title="What needs doing"
      headline={headline}
      bodyStyle={{ gridTemplateColumns: '1fr 520px', gridTemplateRows: '120px 1fr' }}
    >
      <HeaderLabLegend />
      <section className="ph-actions-summary" aria-label="Actions summary">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <div className="ph-actions-summary__tile">
              <span className="ph-actions-summary__label">{tile.label}</span>
              <span className="ph-actions-summary__value">{tile.value}</span>
            </div>
          </Card>
        ))}
        <Card title="Due buckets" subtitle="Open actions by due date">
          <div className="ph-actions-summary__bar" aria-hidden="true">
            {buckets.map((b) =>
              b.count > 0 ? <span key={b.id} style={{ flex: b.count, background: b.colour }} /> : null,
            )}
          </div>
          <ul className="ph-actions-summary__buckets">
            {buckets.map((b) => (
              <li key={b.id}>
                <span className="ph-actions-summary__swatch" style={{ background: b.colour }} aria-hidden="true" />
                {b.label} <strong>{b.count}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </section>
      <Card title="Open actions" subtitle="By severity, then due date" style={{ overflow: 'hidden' }}>
        <table className="ph-actions-table">
          <caption>{caption}</caption>
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 210 }} />
            <col style={{ width: 60 }} />
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Domain</th>
              <th scope="col">Team</th>
              <th scope="col">Lab</th>
              <th scope="col">Action</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const team = TEAM_BY_ID.get(a.teamId)
              const due = new Date(a.due).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })
              return (
                <tr key={a.id}>
                  <td>{domainById(a.domainId)?.name}</td>
                  <td>{team?.name}</td>
                  <td>{team && <LabChip labId={team.labId} size="sm" />}</td>
                  <td title={a.text}>{a.text}</td>
                  <td>
                    {due}
                    {a.due < REFRESHED_ISO && <span className="ph-actions-table__late"> past due</span>}
                  </td>
                  <td>
                    <StatusPill band={a.severity} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {actions.length === 0 && (
          <p style={{ color: t.muted, margin: 0 }}>No open actions in scope.</p>
        )}
      </Card>

      <Card title="Actions by domain" subtitle="Open, most first" style={{ overflow: 'hidden' }}>
        <BarList items={byDomain} unit="count" caption="Open actions by domain" />
      </Card>
    </Page>
  )
}
