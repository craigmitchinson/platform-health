import { useLayoutEffect, useRef, useState } from 'react'
import { Page } from '../components/Page'
import { Card, HeaderLabLegend, LabChip, Sparkline } from '../components/primitives'
import { DOMAINS, systemsOf } from '../data/domains'
import { BAND_LABEL, bandFor, filteredTeams, scopeDomainScore } from '../data/health'
import { labById } from '../data/labs'
import type { TeamId } from '../data/types'
import { periodPoints, useFilters } from '../filter-context'
import { type as ty } from '../theme'
import { useTheme } from '../theme-context'

const CORE_DOMAINS = DOMAINS.filter((d) => !d.proposed)
const CORE_SYSTEMS = systemsOf(CORE_DOMAINS)
/** Height of the Movement by team card: frame, title, caption, header and twelve rows. */
const TEAM_ROW_H = 328
/** Short step names for the waterfall's x axis, as MovementStep[Short] in Power BI. */
const WATERFALL_SHORT: Record<string, string> = { maturity: 'Maturity', resilience: 'Resil.', governance: 'Gov.', architecture: 'Arch.' }
/** The team table's sparkline always runs six quarters. */
const SPARK_POINTS = 6

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0

/** A team's composite a number of quarters ago: the mean of its core domain scores. */
const teamCompositeAt = (id: TeamId, quartersAgo: number) =>
  mean(CORE_DOMAINS.map((d) => scopeDomainScore(d, [id], quartersAgo)))

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
const signed1 = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`
/** Score movement in words: a rise in a health score is always better. */
const direction = (n: number) => (n > 0 ? 'better' : n < 0 ? 'worse' : 'held')
const SCORE_NOTE = 'Change in health score, 0 to 100. Up is better.'

/** The size of a box, kept current with a ResizeObserver, so an SVG can take its viewBox from it. */
function useBoxSize(initial: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
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
  return { ref, ...size }
}

interface Move {
  id: string
  name: string
  from: number
  to: number
  delta: number
}

/** What moved over the period window: one row per core domain, start of window to now, worst mover first. */
function Dumbbell({ rows, points }: { rows: Move[]; points: number }) {
  const t = useTheme()
  const { ref, width, height } = useBoxSize({ width: 760, height: 360 })
  const labelW = 170
  const valueW = 110
  const top = 26
  const bottom = 42
  const lo = 60
  const hi = 100
  const plotW = Math.max(60, width - labelW - valueW)
  const plotH = Math.max(1, height - top - bottom)
  const rowH = plotH / Math.max(1, rows.length)
  const x = (v: number) => labelW + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotW
  const y = (i: number) => top + rowH * (i + 0.5)
  const mono = { fontFamily: 'var(--font-mono)', fontSize: ty.chip - 1, fill: t.muted }
  const halo = { paintOrder: 'stroke' as const, stroke: t.surface, strokeWidth: 5, strokeLinejoin: 'round' as const }
  const colourOf = (d: number) => (d > 0 ? t.green : d < 0 ? t.amber : t.muted)
  return (
    <>
      <div ref={ref} className="ph-movement__chart">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          {[
            { at: 60, word: 'Watch' },
            { at: 80, word: 'Healthy' },
          ].map((g) => (
            <g key={g.at}>
              <line x1={x(g.at)} y1={top - 18} x2={x(g.at)} y2={top + plotH} stroke={t.line} strokeWidth={1} />
              <text x={x(g.at) + 6} y={top - 8} style={{ ...mono, fontWeight: 600, textTransform: 'uppercase' }}>
                {g.word}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = y(i)
            const colour = colourOf(r.delta)
            const clamped = Math.min(r.from, r.to) < lo
            return (
              <g key={r.id}>
                <text x={0} y={cy + 5} style={{ fontSize: ty.meta, fill: t.ink }}>
                  {r.name}
                  {clamped && <tspan style={{ ...mono, fill: t.amber }}> &lt;{lo}</tspan>}
                </text>
                {clamped && <path d={`M${x(lo) - 12} ${cy} l7 -5 v10 z`} fill={t.amber} />}
                <line x1={x(r.from)} y1={cy} x2={x(r.to)} y2={cy} stroke={t.muted} strokeOpacity={0.6} strokeWidth={1.5} />
                <circle cx={x(r.from)} cy={cy} r={5} fill={t.surface} stroke={t.muted} strokeWidth={1.5} />
                <circle cx={x(r.to)} cy={cy} r={6} fill={colour} stroke={t.surface} strokeWidth={1.5} />
                <text
                  x={x(Math.max(r.from, r.to)) + 14}
                  y={cy + 4}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: ty.chip, fontWeight: 600, fill: colour, ...halo }}
                >
                  {signed(r.delta)} {direction(r.delta)}
                </text>
              </g>
            )
          })}
          {[60, 70, 80, 90, 100].map((v) => (
            <text key={v} x={x(v)} y={top + plotH + 18} textAnchor="middle" style={mono}>
              {v}
            </text>
          ))}
          <text x={labelW + plotW / 2} y={height - 4} textAnchor="middle" style={mono}>
            Domain score, 60 to 100; a marker at 60 means the score is below it
          </text>
        </svg>
      </div>
      <table className="sr-only">
        <caption>Core domain scores {points - 1} quarters ago and now, worst mover first</caption>
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Q-{points - 1}</th>
            <th scope="col">Now</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.name}</th>
              <td>{r.from}</td>
              <td>{r.to}</td>
              <td>
                {signed(r.delta)} {direction(r.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

interface Step {
  label: string
  /** A short name for the x axis. */
  short?: string
  kind: 'start' | 'delta' | 'end'
  value: number
  running: number
}

/** Why the composite moved: the start of the window, one step per core domain, then now. */
function Waterfall({ steps, points }: { steps: Step[]; points: number }) {
  const t = useTheme()
  const { ref, width, height } = useBoxSize({ width: 960, height: 360 })
  const running = steps.map((s) => s.running)
  const min = Math.min(...running)
  const max = Math.max(...running)
  const pad = Math.max(1, (max - min) * 0.3)
  const lo = Math.max(0, Math.floor(min - pad))
  const hi = Math.min(100, Math.ceil(max + pad))
  const tickStep = [1, 2, 5, 10, 20].find((s) => (hi - lo) / s <= 5) ?? 20
  const ticks: number[] = []
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v)

  const left = 56
  const right = 8
  const top = 24
  const bottom = 40
  const plotW = Math.max(1, width - left - right)
  const plotH = Math.max(1, height - top - bottom)
  const slot = plotW / Math.max(1, steps.length)
  const barW = slot * 0.7
  const barX = (i: number) => left + slot * i + (slot - barW) / 2
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * plotH
  const mono = { fontFamily: 'var(--font-mono)', fontSize: ty.chip - 1, fill: t.muted }
  const valueStyle = { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, fill: t.ink }
  const fillOf = (s: Step) => (s.kind !== 'delta' ? t.brand : s.value > 0 ? t.green : s.value < 0 ? t.amber : t.muted)

  return (
    <>
      <div ref={ref} className="ph-movement__chart">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} y1={y(v)} x2={left + plotW} y2={y(v)} stroke={t.gridline} strokeWidth={1} />
              <text x={left - 8} y={y(v) + 4} textAnchor="end" style={mono}>
                {v}
              </text>
            </g>
          ))}
          {steps.map((s, i) => {
            const from = s.kind === 'delta' ? s.running - s.value : lo
            const yTop = y(Math.max(from, s.running))
            const yBottom = y(Math.min(from, s.running))
            const below = s.kind === 'delta' && s.value < 0
            const next = steps[i + 1]
            const [first, ...rest] = (s.short ?? s.label).split(' ')
            return (
              <g key={s.label}>
                {next && (
                  <line
                    x1={barX(i)}
                    y1={y(s.running)}
                    x2={barX(i + 1) + barW}
                    y2={y(s.running)}
                    stroke={t.muted}
                    strokeDasharray="3 2"
                    strokeWidth={1}
                  />
                )}
                <rect
                  x={barX(i)}
                  y={yTop}
                  width={barW}
                  height={Math.max(1.5, yBottom - yTop)}
                  rx={2}
                  fill={fillOf(s)}
                />
                <text
                  x={barX(i) + barW / 2}
                  y={below ? yBottom + 16 : yTop - 6}
                  textAnchor="middle"
                  style={valueStyle}
                >
                  {s.kind === 'delta' ? signed1(s.value) : s.value.toFixed(1)}
                </text>
                <text x={barX(i) + barW / 2} y={top + plotH + 16} textAnchor="middle" style={{ fontSize: 12, fill: t.muted }}>
                  <tspan x={barX(i) + barW / 2}>{first}</tspan>
                  {rest.length > 0 && (
                    <tspan x={barX(i) + barW / 2} dy={14}>
                      {rest.join(' ')}
                    </tspan>
                  )}
                </text>
              </g>
            )
          })}
          <text
            x={14}
            y={top + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${top + plotH / 2})`}
            style={mono}
          >
            Composite
          </text>
        </svg>
      </div>
      <table className="sr-only">
        <caption>
          Composite {points - 1} quarters ago, each core domain's contribution to the change, and the composite now
        </caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Contribution</th>
            <th scope="col">Composite after this step</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.label}>
              <th scope="row">{s.label}</th>
              <td>{s.kind === 'delta' ? signed1(s.value) : s.value.toFixed(1)}</td>
              <td>{s.running.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function MovementPage() {
  const t = useTheme()
  const { labId, teamId, period } = useFilters()
  const points = periodPoints(period)
  const back = points - 1

  const scope = filteredTeams(labId, teamId)
  const scopeIds = scope.map((tm) => tm.id)
  const scopeName =
    (teamId ? scope[0]?.name : labId ? labById(labId)?.name : undefined) ?? 'the estate'

  const compositeThen = mean(scopeIds.map((id) => teamCompositeAt(id, back)))
  const compositeNow = mean(scopeIds.map((id) => teamCompositeAt(id, 0)))

  // Movement over the period window drives the headline; the first core domain wins a tie.
  const windowMoves = CORE_DOMAINS.map((d) => ({
    name: d.name,
    delta: scopeDomainScore(d, scopeIds) - scopeDomainScore(d, scopeIds, back),
  }))
  const most = windowMoves.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a))
  const least = windowMoves.reduce((a, b) => (Math.abs(b.delta) < Math.abs(a.delta) ? b : a))
  const headline = `The composite moved ${signed(compositeNow - compositeThen)} to ${compositeNow} over the last ${points} quarters; ${most.name} ${most.delta < 0 ? 'worsened' : most.delta > 0 ? 'improved' : 'moved'} most (${signed(most.delta)}), ${least.name} moved least.`

  // Over the period window, worst mover first; a tie keeps domain order.
  const quarterMoves: Move[] = CORE_DOMAINS.map((d) => {
    const from = scopeDomainScore(d, scopeIds, back)
    const to = scopeDomainScore(d, scopeIds)
    return { id: d.id, name: d.name, from, to, delta: to - from }
  }).sort((a, b) => a.delta - b.delta)

  // The composite here is the unrounded mean of domain scores, so the steps add up exactly.
  const start = CORE_DOMAINS.reduce((a, d) => a + scopeDomainScore(d, scopeIds, back), 0) / CORE_DOMAINS.length
  let run = start
  const deltaSteps: Step[] = CORE_DOMAINS.map((d) => {
    const value = (scopeDomainScore(d, scopeIds) - scopeDomainScore(d, scopeIds, back)) / CORE_DOMAINS.length
    run += value
    return { label: d.name, short: WATERFALL_SHORT[d.id], kind: 'delta', value, running: run }
  })
  const steps: Step[] = [
    { label: `Q-${back}`, kind: 'start', value: start, running: start },
    ...deltaSteps,
    { label: 'Now', kind: 'end', value: run, running: run },
  ]

  const teamRows = scope
    .map((tm) => {
      const from = teamCompositeAt(tm.id, back)
      const to = teamCompositeAt(tm.id, 0)
      const trend = Array.from({ length: SPARK_POINTS }, (_, i) => teamCompositeAt(tm.id, SPARK_POINTS - 1 - i))
      return { team: tm, from, to, delta: to - from, trend }
    })
    .sort((a, b) => a.delta - b.delta)

  return (
    <Page
      kicker="Movement"
      sources={CORE_SYSTEMS}
      title="What moved and why"
      headline={headline}
      bodyStyle={{ gridTemplateRows: `1fr ${TEAM_ROW_H}px`, gridTemplateColumns: '1fr 1fr' }}
    >
      <HeaderLabLegend />
      <Card
        title={`What moved over the last ${points} quarters`}
        subtitle={SCORE_NOTE}
        right={<span className="ph-movement__meta">Q-{back} to now</span>}
      >
        <div className="ph-movement__fill">
          <Dumbbell rows={quarterMoves} points={points} />
        </div>
      </Card>
      <Card
        title="Why the composite moved"
        subtitle={SCORE_NOTE}
        right={
          <span className="ph-movement__meta">
            Each step is a domain's change divided by {CORE_DOMAINS.length}
          </span>
        }
      >
        <div className="ph-movement__fill">
          <Waterfall steps={steps} points={points} />
        </div>
      </Card>

      <Card title="Movement by team" subtitle={`Most worsened first. ${SCORE_NOTE}`} style={{ gridColumn: '1 / -1', overflow: 'hidden' }}>
        <table className="ph-movement-table">
          <caption className="sr-only">
            Teams in {scopeName} by change in composite over the last {points} quarters, most worsened first. {SCORE_NOTE}
          </caption>
          <colgroup>
            <col style={{ width: 400 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 180 }} />
            <col />
            <col style={{ width: 260 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Lab</th>
              <th scope="col">Composite</th>
              <th scope="col">Change</th>
              <th scope="col">Band</th>
              <th scope="col">Six quarters</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map((r) => {
              const bandFrom = BAND_LABEL[bandFor(r.from)]
              const bandTo = BAND_LABEL[bandFor(r.to)]
              return (
                <tr key={r.team.id}>
                  <th scope="row">{r.team.name}</th>
                  <td>
                    <LabChip labId={r.team.labId} size="sm" />
                  </td>
                  <td>
                    {r.from} &rarr; {r.to}
                  </td>
                  <td style={{ color: r.delta > 0 ? t.green : r.delta < 0 ? t.amber : t.muted }}>
                    {signed(r.delta)} {direction(r.delta)}
                  </td>
                  <td>{bandFrom === bandTo ? `${bandTo}, held` : `${bandFrom} → ${bandTo}`}</td>
                  <td>
                    <Sparkline points={r.trend} label={`${r.team.name} composite trend`} width={220} height={16} band={bandFor(r.to)} scale="score" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {teamRows.length === 0 && <p style={{ color: t.muted, margin: 0 }}>No teams in scope.</p>}
      </Card>
    </Page>
  )
}
