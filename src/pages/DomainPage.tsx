import { useLayoutEffect, useRef, useState } from 'react'
import { Page } from '../components/Page'
import { BarList, Card, HeaderLabLegend, HeatLegend, Kicker, KpiTile, MetricHeat, Sparkline, StatusPill, formatValue } from '../components/primitives'
import { domainById, systemsOf } from '../data/domains'
import {
  BAND_LABEL,
  aggregateMetrics,
  bandFor,
  filteredTeams,
  isScored,
  scopeDomainScore,
  scoreMetric,
  targetFor,
} from '../data/health'
import { TEAMS, labById } from '../data/labs'
import { ACTIONS } from '../data/actions'
import { TEAM_METRICS } from '../data/metrics'
import { refreshFor } from '../data/sourceRefresh'
import type { DomainId, MetricDef, SourceMode, TeamId } from '../data/types'
import { periodPoints, useFilters } from '../filter-context'
import { type as ty } from '../theme'
import { useTheme } from '../theme-context'

const MODE_LABEL: Record<SourceMode, string> = {
  sql: 'SQL direct query',
  semantic: 'Semantic model',
  spreadsheet: 'Spreadsheet',
  csv: 'CSV drop',
  api: 'API',
}

/** Tiles in the KPI band; the domain's other metrics sit in the heat by team and metric. */
const MAX_TILES = 5
/** Rows that fit the 160px actions and sources strip; with more, one row gives way to "+N more". */
const STRIP_ROWS = 4
const stripFit = (n: number) => (n > STRIP_ROWS ? STRIP_ROWS - 1 : n)

/** Maturity capabilities in the ladder, as the Power BI maturity-ladder filter. */
const LADDER_METRICS = ['triageMaturity', 'incidentMaturity', 'recoveryMaturity', 'resolutionMaturity', 'serviceMaturity']
const LEVELS = [1, 2, 3, 4, 5]

/** Maturity by capability: five pips a cell, filled to the team's level, with the level printed beside. */
function MaturityLadder({ metrics, teams }: { metrics: MetricDef[]; teams: { id: TeamId; name: string }[] }) {
  const t = useTheme()
  const template = `150px repeat(${metrics.length}, minmax(0, 1fr))`
  return (
    <>
      <div className="ph-ladder" aria-hidden="true" style={{ gridTemplateRows: `auto repeat(${teams.length}, minmax(0, 1fr))` }}>
        <div className="ph-ladder__row ph-ladder__row--head" style={{ gridTemplateColumns: template }}>
          <span />
          {metrics.map((m) => (
            <span key={m.id}>{m.short}</span>
          ))}
        </div>
        {teams.map((tm) => (
          <div key={tm.id} className="ph-ladder__row" style={{ gridTemplateColumns: template }}>
            <span className="ph-ladder__team">{tm.name}</span>
            {metrics.map((m) => {
              const value = TEAM_METRICS[tm.id][m.id].value
              const key = t.bands[bandFor(scoreMetric(m, value))].key
              return (
                <span key={m.id} className="ph-ladder__cell">
                  {LEVELS.map((l) => (
                    <i key={l} className="ph-ladder__pip" style={l <= Math.round(value) ? { background: key, borderColor: key } : undefined} />
                  ))}
                  <b>{value.toFixed(1)}</b>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Maturity level by team and capability, out of 5</caption>
        <thead>
          <tr>
            <th scope="col">Team</th>
            {metrics.map((m) => (
              <th key={m.id} scope="col">{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((tm) => (
            <tr key={tm.id}>
              <th scope="row">{tm.name}</th>
              {metrics.map((m) => (
                <td key={m.id}>{formatValue(TEAM_METRICS[tm.id][m.id].value, m.unit)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

const TEAM_BY_ID = new Map(TEAMS.map((tm) => [tm.id, tm]))

/** A KPI-style tile for metrics that are shown but never scored: the band pill
 *  is replaced with a neutral "Context" label. */
function ContextTile({
  label,
  value,
  unit,
  sparkline,
}: {
  label: string
  value: number
  unit: MetricDef['unit']
  sparkline: number[]
}) {
  const t = useTheme()
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Kicker style={{ flex: 1 }}>{label}</Kicker>
          <span className="domain-context-badge">Context</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: ty.kpiValue,
              fontWeight: 600,
              lineHeight: 1,
              color: t.ink,
              flex: 1,
            }}
          >
            {formatValue(value, unit)}
          </div>
          <Sparkline points={sparkline} label={label} colour={t.brandSoft} />
        </div>
        <div style={{ fontSize: ty.meta, color: t.muted }}>Shown for context, not scored</div>
      </div>
    </Card>
  )
}

/** Trend chart for a domain score over the period window: the healthy band
 *  from 80, a dashed watch line at 60, the score over each quarter and the
 *  current score to the right of the last point. The SVG takes its viewBox
 *  from the space it is given; an sr-only table carries the same figures. */
function TrendChart({ points }: { points: number[] }) {
  const t = useTheme()
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 520, height: 240 })
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const width = Math.round(el.clientWidth)
      const height = Math.round(el.clientHeight)
      if (width > 0 && height > 0)
        setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { width, height } = size
  const lo = Math.min(40, Math.floor(Math.min(...points) / 10) * 10)
  const hi = 100
  const left = 56
  const right = 52
  const top = 24
  const bottom = 44
  const plotW = Math.max(1, width - left - right)
  const plotH = Math.max(1, height - top - bottom)
  const x = (i: number) => left + (i * plotW) / Math.max(1, points.length - 1)
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * plotH
  const xy = points.map((p, i) => [x(i), y(p)] as const)
  const line = xy.map(([px, py]) => `${px},${py}`).join(' ')
  const baseY = y(lo)
  const area = xy.length
    ? `M${line.replace(/ /g, ' L')} L${xy[xy.length - 1][0]},${baseY} L${xy[0][0]},${baseY} Z`
    : ''
  const quarters = ['Q-5', 'Q-4', 'Q-3', 'Q-2', 'Q-1', 'Now'].slice(-points.length)
  const ticks = [lo, 60, 80, 100].filter((v, i, a) => a.indexOf(v) === i)
  const mono = { fontFamily: 'var(--font-mono)', fontSize: ty.chip - 1, fill: t.muted }
  const halo = { paintOrder: 'stroke' as const, stroke: t.surface, strokeWidth: 4, strokeLinejoin: 'round' as const }
  const last = xy[xy.length - 1]
  return (
    <>
      <div ref={boxRef} style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <rect x={left} y={y(100)} width={plotW} height={y(80) - y(100)} fill={t.bands.healthy.fill} />
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} y1={y(v)} x2={left + plotW} y2={y(v)} stroke={t.gridline} strokeWidth={1} />
              <text x={left - 8} y={y(v) + 4} textAnchor="end" style={mono}>
                {v}
              </text>
            </g>
          ))}
          <line
            x1={left}
            y1={y(60)}
            x2={left + plotW}
            y2={y(60)}
            stroke={t.amber}
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />
          <text x={left + plotW - 6} y={y(100) + 14} textAnchor="end" style={{ ...mono, ...halo }}>
            Healthy
          </text>
          <text x={left + plotW - 6} y={y(80) + 14} textAnchor="end" style={{ ...mono, ...halo }}>
            Watch
          </text>
          <path d={area} fill={t.green} fillOpacity={0.15} />
          <polyline
            points={line}
            fill="none"
            stroke={t.brand}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {xy.map(([px, py], i) =>
            i === xy.length - 1 ? null : (
              <g key={i}>
                <circle cx={px} cy={py} r={3.5} fill={t.surface} stroke={t.brand} strokeWidth={2} />
                <text x={px} y={py - 9} textAnchor="middle" style={{ ...mono, ...halo }}>
                  {points[i]}
                </text>
              </g>
            ),
          )}
          {last && (
            <>
              <circle cx={last[0]} cy={last[1]} r={5} fill={t.brand} stroke={t.surface} strokeWidth={1.5} />
              <text
                x={last[0] + 10}
                y={last[1] + 5}
                style={{ fontFamily: 'var(--font-mono)', fontSize: ty.body, fontWeight: 700, fill: t.ink, ...halo }}
              >
                {points[points.length - 1]}
              </text>
            </>
          )}
          <text
            x={14}
            y={top + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${top + plotH / 2})`}
            style={mono}
          >
            Domain score, {lo} to 100
          </text>
          {quarters.map((q, i) => (
            <text key={q} x={x(i)} y={top + plotH + 18} textAnchor="middle" style={mono}>
              {q}
            </text>
          ))}
          <text x={left + plotW / 2} y={height - 4} textAnchor="middle" style={mono}>
            Quarter, last {points.length} shown
          </text>
        </svg>
      </div>
      <table className="sr-only">
        <caption>Domain score by quarter, last {points.length} quarters, out of 100</caption>
        <tbody>
          <tr>
            {quarters.map((q) => (
              <th key={q} scope="col">
                {q}
              </th>
            ))}
          </tr>
          <tr>
            {points.map((p, i) => (
              <td key={i}>{p}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  )
}

export function DomainPage({ domainId }: { domainId: DomainId }) {
  const { labId, teamId, period } = useFilters()
  const t = useTheme()
  const domain = domainById(domainId)
  if (!domain) return null
  const points = periodPoints(period)
  const since = points === 2 ? 'vs last quarter' : `vs ${points - 1} quarters ago`

  const scope = filteredTeams(labId, teamId)
  const teamIds = scope.map((tm) => tm.id)
  const teamCount = scope.length
  const scopeLabel =
    (teamId ? scope[0]?.name : labId ? labById(labId)?.name : undefined) ?? 'the estate'

  const metricRows = domain.metrics.map((m) => {
    const agg = aggregateMetrics(teamIds, m)
    const trend = agg.trend.slice(-points)
    const target = targetFor(m, teamCount)
    const delta =
      trend.length >= 2 ? Math.round((trend[trend.length - 1] - trend[0]) * 10) / 10 : undefined
    // Mean of each team's own score, so the band agrees with the domain score.
    const score = Math.round(mean(teamIds.map((id) => scoreMetric(m, TEAM_METRICS[id][m.id].value))))
    return { metric: m, agg, trend, target, delta, score }
  })

  // The domain's score for every team in scope, worst first.
  const teamBars = scope
    .map((tm) => {
      const score = scopeDomainScore(domain, [tm.id])
      return { label: tm.name, value: score, band: bandFor(score), labId: tm.labId }
    })
    .sort((a, b) => a.value - b.value)

  // Each scored metric's value and score per team, in the same worst-first order.
  const heatMetrics = domain.metrics.filter(isScored)
  const heatRows = scope
    .map((tm) => ({ team: tm, score: scopeDomainScore(domain, [tm.id]) }))
    .sort((a, b) => a.score - b.score)
    .map(({ team }) => ({
      id: team.id,
      label: team.name,
      labId: team.labId,
      cells: heatMetrics.map((m) => {
        const value = TEAM_METRICS[team.id][m.id].value
        return { value, unit: m.unit, score: scoreMetric(m, value) }
      }),
    }))

  // Domain score across the period window, oldest first; the last point is now.
  const domainScoreTrend = Array.from({ length: points }, (_, i) =>
    scopeDomainScore(domain, teamIds, points - 1 - i),
  )

  // Worst-scoring metric this quarter, used to ground the read-out.
  const scoredRows = metricRows.filter((r) => isScored(r.metric))
  const worstRow = scoredRows.length
    ? scoredRows.reduce((worst, r) => (r.score < worst.score ? r : worst))
    : undefined
  const worstGap = !worstRow
    ? 0
    : worstRow.metric.direction === 'lower'
      ? worstRow.agg.value - worstRow.target
      : worstRow.target - worstRow.agg.value

  // Best-scoring metric this quarter, used to ground the headline.
  const bestRow = scoredRows.length
    ? scoredRows.reduce((best, r) => (r.score > best.score ? r : best))
    : undefined
  const bestGap = !bestRow
    ? 0
    : bestRow.metric.direction === 'lower'
      ? bestRow.agg.value - bestRow.target
      : bestRow.target - bestRow.agg.value

  const domainScore = scopeDomainScore(domain, teamIds)
  const domainBandWord = BAND_LABEL[bandFor(domainScore)].toLowerCase()
  const bestWording = !bestRow
    ? ''
    : bestGap < 0
      ? `${bestRow.metric.label} is ahead of target`
      : bestGap === 0
        ? `${bestRow.metric.label} is on target`
        : `${bestRow.metric.label} is closest to target at ${formatValue(bestRow.agg.value, bestRow.metric.unit)} against ${formatValue(bestRow.target, bestRow.metric.unit)}`
  const scoreLead = `${domain.name} scores ${domainScore}, ${domainBandWord}.`
  const headline =
    !worstRow || !bestRow
      ? `No measure in ${domain.name} is scored yet.`
      : worstRow.score === 100
        ? `${scoreLead} Every metric is on or ahead of target.`
        : worstGap > 0
          ? `${scoreLead} ${worstRow.metric.label} is furthest from target at ${formatValue(worstRow.agg.value, worstRow.metric.unit)} against ${formatValue(worstRow.target, worstRow.metric.unit)}${bestRow === worstRow ? '' : `; ${bestWording}`}.`
          : `${scoreLead} ${worstRow.metric.label} is inside target in total, but not for every team${bestRow === worstRow ? '' : `; ${bestWording}`}.`

  const note = domain.proposed
    ? `${domain.question} · Proposed domain. Data not yet sourced; values are illustrative.`
    : domain.question

  const readOut1 = !worstRow
    ? 'No measure in this domain is scored yet.'
    : worstGap > 0
      ? `${worstRow.metric.label} is ${formatValue(Math.round(worstGap * 10) / 10, worstRow.metric.unit)} off target across ${scopeLabel}.`
      : worstRow.score < 100
        ? `${worstRow.metric.label} is inside target across ${scopeLabel} in total, but not for every team.`
        : `Every scored measure is at or inside target across ${scopeLabel}.`

  let readOut2: string
  if (!worstRow || !scope[0]) {
    readOut2 = `There are no team figures to compare for ${scopeLabel}.`
  } else if (teamCount > 1) {
    if (worstRow.metric.aggregate === 'sum') {
      const shares = scope
        .map((tm) => ({ name: tm.name, v: TEAM_METRICS[tm.id][worstRow.metric.id].value }))
        .sort((a, b) => b.v - a.v)
      const total = shares.reduce((a, b) => a + b.v, 0)
      const top2 = shares.slice(0, 2)
      const pct = total > 0 ? Math.round((top2.reduce((a, b) => a + b.v, 0) / total) * 100) : 0
      readOut2 = `${top2.map((s) => s.name).join(' and ')} carry ${pct} per cent of ${worstRow.metric.label.toLowerCase()} across ${scopeLabel}.`
    } else {
      const values = scope.map((tm) => TEAM_METRICS[tm.id][worstRow.metric.id].value)
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      readOut2 = `${worstRow.metric.label} ranges from ${formatValue(lo, worstRow.metric.unit)} to ${formatValue(hi, worstRow.metric.unit)} across teams in ${scopeLabel}.`
    }
  } else {
    const avg = scopeDomainScore(
      domain,
      TEAMS.map((tm) => tm.id),
    )
    const own = scopeDomainScore(domain, [scope[0].id])
    const diff = own - avg
    readOut2 =
      diff >= 0
        ? `${scopeLabel} scores ${diff} points above the estate average for this domain.`
        : `${scopeLabel} scores ${Math.abs(diff)} points below the estate average for this domain.`
  }

  const trendDiff = domainScoreTrend[domainScoreTrend.length - 1] - domainScoreTrend[0]
  const readOut3 =
    trendDiff > 2
      ? `Trend is improving, up ${trendDiff} points over the last ${points} quarters.`
      : trendDiff < -2
        ? `Trend is declining, down ${Math.abs(trendDiff)} points over the last ${points} quarters.`
        : `Trend is broadly flat over the last ${points} quarters.`

  const domainActions = ACTIONS.filter(
    (a) => a.domainId === domain.id && teamIds.includes(a.teamId),
  ).sort((a, b) =>
    a.severity === b.severity
      ? a.due.localeCompare(b.due)
      : a.severity === 'act'
        ? -1
        : 1,
  )

  // The KPI band holds five tiles; the rest of the domain's metrics are in the heat below.
  const tiles = metricRows.slice(0, MAX_TILES)
  const moreTiles = metricRows.length - tiles.length

  const sources = Array.from(
    new Map(domain.metrics.map((m) => [`${m.source.system}:${m.source.mode}`, m.source])).values(),
  )

  return (
    <Page
      kicker={domain.name}
      title={domain.name}
      headline={headline}
      note={note}
      sources={systemsOf([domain])}
      bodyStyle={{
        gridTemplateRows: '180px 1fr 180px',
        gridTemplateColumns: '1fr',
      }}
    >
      <HeaderLabLegend />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`,
          gap: 20,
        }}
      >
        {tiles.map(({ metric, agg, trend, target, delta, score }) =>
          isScored(metric) ? (
            <KpiTile
              key={metric.id}
              label={metric.label}
              value={agg.value}
              unit={metric.unit}
              delta={delta}
              deltaLabel={since}
              direction={metric.direction}
              target={target}
              band={bandFor(score)}
              sparkline={trend}
            />
          ) : (
            <ContextTile key={metric.id} label={metric.label} value={agg.value} unit={metric.unit} sparkline={trend} />
          ),
        )}
      </div>
      {moreTiles > 0 && <p className="ph-more-line">+{moreTiles} more in the heat below</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 640px 1fr', gap: 20, minHeight: 0 }}>
        {domain.id !== 'maturity' && (
          <Card title="Domain score by team" subtitle="Out of 100, worst first" style={{ overflow: 'hidden' }}>
            <BarList
              items={teamBars}
              unit="count"
              max={100}
              fill
              caption={`Domain score by team, out of 100, worst first, for ${scopeLabel}`}
            />
          </Card>
        )}
        <Card title="By team and metric" subtitle="Worst team first" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <div style={{ flex: '1 1 auto', minHeight: 0 }}>
              <MetricHeat
                columns={heatMetrics.map((m) => ({ id: m.id, label: m.short, full: m.label }))}
                rows={heatRows}
                rowHeader="Team"
                caption={`${domain.name} metrics by team, worst team first, for ${scopeLabel}`}
              />
            </div>
            <HeatLegend />
          </div>
        </Card>
        {domain.id === 'maturity' && (
          <Card title="Maturity by capability" subtitle="Level out of 5, worst team first" style={{ overflow: 'hidden' }}>
            <MaturityLadder
              metrics={LADDER_METRICS.map((id) => domain.metrics.find((m) => m.id === id)).filter((m): m is MetricDef => !!m)}
              teams={heatRows.map((r) => ({ id: r.id, name: r.label }))}
            />
          </Card>
        )}
        <Card title={`Trend, last ${points} quarters`} subtitle={`Domain score for ${scopeLabel}`} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
            <TrendChart points={domainScoreTrend} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <Kicker>Read-out</Kicker>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: ty.body, color: t.ink, lineHeight: 1.45 }}>
                <li>{readOut1}</li>
                <li>{readOut2}</li>
                <li>{readOut3}</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1180px 1fr', gap: 20, minHeight: 0 }}>
        <Card title="Actions" subtitle="By severity, then due date" style={{ overflow: 'hidden' }}>
          {domainActions.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {domainActions.slice(0, stripFit(domainActions.length)).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: ty.body,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.text} &middot; <span style={{ color: t.muted }}>{TEAM_BY_ID.get(a.teamId)?.name}</span>
                  </span>
                  <span style={{ fontSize: ty.meta, color: t.muted, fontVariantNumeric: 'tabular-nums' }}>
                    Due {new Date(a.due).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <StatusPill band={a.severity} />
                </div>
              ))}
              {domainActions.length > STRIP_ROWS && (
                <p className="ph-more-line">+{domainActions.length - stripFit(domainActions.length)} more</p>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: ty.body, color: t.muted }}>No open actions for {scopeLabel} in this domain.</p>
          )}
        </Card>
        <Card title="Sources" subtitle="System, ingestion and refresh" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.slice(0, stripFit(sources.length)).map((s) => (
              <div
                key={`${s.system}:${s.mode}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: ty.body }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.system}
                  <span style={{ color: t.muted }}> &middot; {MODE_LABEL[s.mode]}</span>
                </span>
                <span style={{ fontSize: ty.meta, color: t.muted, whiteSpace: 'nowrap' }}>
                  {s.refresh}
                  {refreshFor(s.system) && ` · ${refreshFor(s.system)}`}
                </span>
              </div>
            ))}
            {sources.length > STRIP_ROWS && <p className="ph-more-line">+{sources.length - stripFit(sources.length)} more</p>}
          </div>
        </Card>
      </div>
    </Page>
  )
}
