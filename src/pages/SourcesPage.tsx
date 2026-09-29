import { Page } from '../components/Page'
import { Card, READINESS_LABEL, StatusPill } from '../components/primitives'
import { ALL_METRICS, DOMAINS, systemsOf } from '../data/domains'
import type { Domain, Readiness, SourceMode } from '../data/types'

const MODE_LABEL: Record<SourceMode, string> = {
  sql: 'SQL direct query',
  semantic: 'Semantic model',
  spreadsheet: 'Spreadsheet',
  csv: 'CSV drop',
  api: 'API',
}

/** Short mode names for the lineage tables. */
const MODE_SHORT: Record<SourceMode, string> = {
  sql: 'SQL',
  semantic: 'Semantic',
  spreadsheet: 'Spreadsheet',
  csv: 'CSV',
  api: 'API',
}

const READINESS_ORDER: Readiness[] = ['live', 'partial', 'aspirational']

const ALL_SYSTEMS = systemsOf(DOMAINS)

/** One tbody per domain, so each domain header scopes exactly its own rows. */
function domainBodies(domains: Domain[]) {
  return domains.map((d) => (
    <tbody key={d.id}>
      {d.metrics.map((m, i) => (
        <tr key={m.id}>
          {i === 0 && (
            <th rowSpan={d.metrics.length} scope="rowgroup" className="sources-domain-cell">
              {d.name}
            </th>
          )}
          <td title={m.label}>{m.label}</td>
          <td title={m.source.system}>{m.source.system}</td>
          <td title={MODE_LABEL[m.source.mode]}>{MODE_SHORT[m.source.mode]}</td>
          <td>{m.source.refresh}</td>
          <td title={m.source.owner}>{m.source.owner}</td>
          <td>
            <span className="sources-readiness" data-readiness={m.source.readiness}>
              {READINESS_LABEL[m.source.readiness]}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  ))
}

function SourcesTable({ domains, caption }: { domains: Domain[]; caption: string }) {
  return (
    <table className="sources-table">
      <caption className="sources-table-caption">{caption}</caption>
      <colgroup>
        <col style={{ width: '11%' }} />
        <col style={{ width: '25%' }} />
        <col style={{ width: '16%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '18%' }} />
        <col style={{ width: '12%' }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Domain</th>
          <th scope="col">Metric</th>
          <th scope="col">Source system</th>
          <th scope="col">Mode</th>
          <th scope="col">Refresh</th>
          <th scope="col">Owner</th>
          <th scope="col">Readiness</th>
        </tr>
      </thead>
      {domainBodies(domains)}
    </table>
  )
}

export function SourcesPage() {
  const total = ALL_METRICS.length
  const live = ALL_METRICS.filter((m) => m.source.readiness === 'live').length
  const partial = ALL_METRICS.filter((m) => m.source.readiness === 'partial').length
  const aspirational = ALL_METRICS.filter((m) => m.source.readiness === 'aspirational').length
  const systems = new Set(ALL_METRICS.map((m) => m.source.system)).size

  // Split where the running row count first reaches half, so both tables are
  // about the same height.
  const rows = DOMAINS.map((d) => d.metrics.length)
  let split = 0
  for (let seen = 0; split < DOMAINS.length && seen * 2 < total; split++) seen += rows[split]
  const left = DOMAINS.slice(0, split)
  const right = DOMAINS.slice(split)

  return (
    <Page
      kicker="Lineage"
      title="Where every number comes from"
      headline={`${live} of ${total} metrics are live today; ${partial} are partial and ${aspirational} are aspirational. Plan for all of them.`}
      note={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          Estate-wide: this page is not filtered by lab or team. &middot; {systems} source systems &middot; Readiness:
          <StatusPill readiness="live" text={`${READINESS_LABEL.live} ${live}`} />
          <StatusPill readiness="partial" text={`${READINESS_LABEL.partial} ${partial}`} />
          <StatusPill readiness="aspirational" text={`${READINESS_LABEL.aspirational} ${aspirational}`} />
        </span>
      }
      sources={ALL_SYSTEMS}
      bodyStyle={{ gridTemplateRows: '203px 1fr', gridTemplateColumns: '1fr' }}
    >
      <Card title="Data readiness" subtitle="Metrics per domain by readiness, estate-wide" style={{ overflow: 'hidden' }}>
        <table className="ph-readiness-matrix">
          <caption className="sr-only">Metrics by readiness and domain, estate-wide</caption>
          <thead>
            <tr>
              <th scope="col">Readiness</th>
              {DOMAINS.map((d) => (
                <th key={d.id} scope="col" title={d.name}>
                  {d.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {READINESS_ORDER.map((r) => (
              <tr key={r}>
                <th scope="row">
                  <StatusPill readiness={r} text={READINESS_LABEL[r]} />
                </th>
                {DOMAINS.map((d) => {
                  const n = d.metrics.filter((m) => m.source.readiness === r).length
                  return (
                    <td key={d.id} className={n ? undefined : 'is-zero'}>
                      {n}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, minHeight: 0 }}>
        <Card style={{ overflow: 'hidden' }}>
          <SourcesTable domains={left} caption={`Metric sources, ${left[0].name} to ${left[left.length - 1].name}`} />
        </Card>
        <Card style={{ overflow: 'hidden' }}>
          <SourcesTable domains={right} caption={`Metric sources, ${right[0].name} to ${right[right.length - 1].name}`} />
        </Card>
      </div>

    </Page>
  )
}
