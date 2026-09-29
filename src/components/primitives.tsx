import type { CSSProperties, ReactNode } from 'react'
import { BAND_LABEL, bandFor } from '../data/health'
import { LABS, labById } from '../data/labs'
import type { Direction, HealthBand, LabId, Readiness, Unit } from '../data/types'
import { labColours, slide, type as ty } from '../theme'
import { useTheme } from '../theme-context'

export const READINESS_LABEL: Record<Readiness, string> = {
  live: 'Live',
  partial: 'Partial',
  aspirational: 'Aspirational',
}

const UNIT_SUFFIX: Record<Unit, string> = {
  count: '',
  pct: '%',
  days: ' days',
  gbp: '',
  perMonth: ' / month',
  level: ' of 5',
}

/** Format a metric value for display, in UK style. */
export function formatValue(value: number, unit: Unit): string {
  if (unit === 'gbp') return `£${value.toLocaleString('en-GB')}`
  if (unit === 'level')
    return `${value.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${UNIT_SUFFIX[unit]}`
  return `${value.toLocaleString('en-GB')}${UNIT_SUFFIX[unit]}`
}

/** Uppercase mono micro-label. */
export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const t = useTheme()
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: ty.chip,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: t.muted,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** A report visual: rounded, a hairline border, no shadow. Spotlight can lift it. */
export function Card({
  title,
  subtitle,
  right,
  children,
  style,
  spot = true,
}: {
  title?: string
  /** A muted sans line beside the mono title. */
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
  spot?: boolean
}) {
  const t = useTheme()
  return (
    <section
      {...(spot ? { 'data-spot': '' } : {})}
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: slide.radius,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        ...style,
      }}
    >
      {(title || subtitle || right) && (
        <div
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flex: 'none' }}
        >
          {title && (
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: ty.sectionHead - 2,
                letterSpacing: '0.11em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: t.muted,
                flex: 'none',
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: ty.meta,
                color: t.muted,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {right}
        </div>
      )}
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>{children}</div>
    </section>
  )
}

/** A text pill for a health band or a source readiness. The word always carries
 *  the meaning; the colour only reinforces it. */
export function StatusPill({
  band,
  readiness,
  text,
  size = 'md',
}: {
  band?: HealthBand
  readiness?: Readiness
  text?: string
  size?: 'sm' | 'md'
}) {
  const t = useTheme()
  const s = band ? t.bands[band] : readiness ? t.readiness[readiness] : t.readiness.aspirational
  const label = text ?? (band ? BAND_LABEL[band] : readiness ? READINESS_LABEL[readiness] : '')
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'sm' ? 3 : 6,
        background: s.fill,
        color: s.text,
        fontFamily: 'var(--font-mono)',
        fontSize: size === 'sm' ? 9 : ty.chip,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: size === 'sm' ? '2px 5px' : '3px 9px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: size === 'sm' ? 6 : 8, height: size === 'sm' ? 6 : 8, borderRadius: 999, background: s.key, flex: 'none' }}
      />
      {label}
    </span>
  )
}

const QUARTERS = ['Q-5', 'Q-4', 'Q-3', 'Q-2', 'Q-1', 'Now']

/** Six-point trend line. The SVG is decorative; an sr-only table carries the data. */
export function Sparkline({
  points,
  label,
  width = 120,
  height = 32,
  colour,
  band,
  scale,
}: {
  points: number[]
  label: string
  width?: number
  height?: number
  colour?: string
  /** Colours the end dot. */
  band?: HealthBand
  /** 'score' fixes the top at 100 and shades the healthy band from 80. */
  scale?: 'score'
}) {
  const t = useTheme()
  // Score scale: the floor sits 4 under 80 or the lowest point, so the healthy band always shows.
  const min = scale === 'score' ? Math.min(80, ...points) - 4 : Math.min(...points)
  const max = scale === 'score' ? 100 : Math.max(...points)
  const range = max - min || 1
  const pad = 3
  const yOf = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)
  const xy = points.map((p, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1)
    return [x, yOf(p)] as const
  })
  const first = xy[0]
  const last = xy[xy.length - 1]
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ')
  const labels = QUARTERS.slice(-points.length)
  return (
    <>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ flex: 'none' }}>
        {scale === 'score' && (
          <rect x={0} y={yOf(100)} width={width} height={yOf(80) - yOf(100)} fill={`color-mix(in srgb, ${t.bands.healthy.fill} 35%, transparent)`} />
        )}
        {first && last && (
          <path
            d={`M${line.replace(/ /g, ' L')} L${last[0]},${height - pad} L${first[0]},${height - pad} Z`}
            fill={colour ?? t.green}
            fillOpacity={0.15}
          />
        )}
        <polyline
          points={line}
          fill="none"
          stroke={colour ?? t.brand}
          strokeWidth={scale === 'score' ? 1.75 : 1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {last && (
          <circle
            cx={last[0]}
            cy={last[1]}
            r={3}
            fill={band ? t.bands[band].key : (colour ?? t.brand)}
            stroke={t.surface}
            strokeWidth={1}
          />
        )}
      </svg>
      <table className="sr-only">
        <caption>
          {label}, last {points.length} quarters
        </caption>
        <tbody>
          <tr>
            {labels.map((q) => (
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

/** Headline number with its band, target and trend. */
export function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaLabel = 'vs last quarter',
  direction,
  target,
  band,
  sparkline,
}: {
  label: string
  value: number
  unit: Unit
  delta?: number
  /** What the delta compares against. */
  deltaLabel?: string
  /** Which way is good for the metric; with it the delta reads better, worse or held. */
  direction?: Direction
  target?: number
  band: HealthBand
  sparkline?: number[]
}) {
  const t = useTheme()
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Kicker style={{ flex: 1 }}>{label}</Kicker>
          <StatusPill band={band} />
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
          {sparkline && <Sparkline points={sparkline} label={label} band={band} />}
        </div>
        {(delta !== undefined || target !== undefined) && (
          <div style={{ display: 'flex', gap: 14, fontSize: ty.meta, color: t.muted }}>
            {delta !== undefined && (
              <span style={direction && delta !== 0 ? { color: (direction === 'lower') === (delta < 0) ? t.green : t.amber } : undefined}>
                {direction && delta !== 0 && <span aria-hidden="true">{delta > 0 ? '▲ ' : '▼ '}</span>}
                {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
                {formatValue(Math.abs(delta), unit)}
                {direction && (delta === 0 ? ' held' : (direction === 'lower') === (delta < 0) ? ' better' : ' worse')} {deltaLabel}
              </span>
            )}
            {target !== undefined && <span>Target {formatValue(target, unit)}</span>}
          </div>
        )}
      </div>
    </Card>
  )
}

/** A lab's two-character code on its colour. The full name is in the title and
 *  in sr-only text; with `withName` it shows beside the chip instead. */
export function LabChip({
  labId,
  size = 'md',
  withName,
}: {
  labId: LabId
  size?: 'sm' | 'md'
  withName?: boolean
}) {
  const lab = labById(labId)
  if (!lab) return null
  const chip = (
    <span
      className={`ph-lab-chip${size === 'sm' ? ' ph-lab-chip--sm' : ''}`}
      style={{ background: labColours[labId] }}
      title={lab.name}
      aria-hidden={withName ? true : undefined}
    >
      <span aria-hidden="true">{lab.code}</span>
      {!withName && <span className="sr-only">{lab.name}</span>}
    </span>
  )
  if (!withName) return chip
  return (
    <span className="ph-lab-name">
      {chip}
      <span className="ph-lab-name__text">{lab.name}</span>
    </span>
  )
}

/** The four lab chips with their names, for pages that show chips alone. */
export function LabLegend() {
  return (
    <span className="ph-lab-legend">
      {LABS.map((l) => (
        <LabChip key={l.id} labId={l.id} size="sm" withName />
      ))}
    </span>
  )
}

/** The lab legend at the top right of the page header, on pages whose tables show chips alone. */
export function HeaderLabLegend() {
  return (
    <div
      style={{
        position: 'absolute',
        top: slide.padding + 52,
        right: slide.padding,
        height: 28,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <LabLegend />
    </div>
  )
}

/** Horizontal bars with label and value; an sr-only table carries the data. */
export function BarList({
  items,
  unit,
  caption,
  max,
  fill,
}: {
  items: { label: string; value: number; band?: HealthBand; labId?: LabId }[]
  unit: Unit
  caption: string
  max?: number
  /** Spread the rows over the available height, up to 44px each. */
  fill?: boolean
}) {
  const t = useTheme()
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <div style={fill ? { height: '100%' } : undefined}>
      <div
        aria-hidden="true"
        style={
          fill
            ? {
                display: 'grid',
                gridTemplateRows: `repeat(${items.length}, minmax(22px, 1fr))`,
                rowGap: 4,
                height: '100%',
                maxHeight: items.length * 44,
              }
            : { display: 'flex', flexDirection: 'column', gap: 8 }
        }
      >
        {items.map((i) => (
          <div
            key={i.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '200px 1fr 90px',
              alignItems: 'center',
              gap: 12,
              fontSize: ty.body,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {i.labId && <LabChip labId={i.labId} size="sm" />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.label}
              </span>
            </span>
            <span style={{ height: 14, background: t.cream, borderRadius: 4, overflow: 'hidden' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, (i.value / top) * 100))}%`,
                  background: i.band ? t.bands[i.band].key : t.brandMid,
                  borderRadius: 4,
                }}
              />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(i.value, unit)}
              {i.band && (
                <span style={{ color: t.muted, fontSize: ty.chip }}> {BAND_LABEL[i.band]}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {items.map((i) => (
            <tr key={i.label}>
              <th scope="row">
                {i.label}
                {i.labId && `, ${labById(i.labId)?.name}`}
              </th>
              <td>{formatValue(i.value, unit)}</td>
              {i.band && <td>{BAND_LABEL[i.band]}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One cell of a heat map: score as a number, with the band as a fill and a
 *  title; the band's word stays in sr-only text. `sm` suits dense tables. */
export function HeatCell({ score, band, size = 'md' }: { score: number; band: HealthBand; size?: 'sm' | 'md' }) {
  const s = useTheme().bands[band]
  return (
    <div
      title={`${score}, ${BAND_LABEL[band]}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: s.fill,
        color: s.text,
        borderLeft: `3px solid ${s.key}`,
        borderRadius: 6,
        padding: size === 'sm' ? '1px 6px' : '3px 8px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ fontSize: size === 'sm' ? ty.meta : ty.body, fontWeight: 700 }}>{score}</span>
      <span className="sr-only">{BAND_LABEL[band]}</span>
    </div>
  )
}

/** Legend text for a heat map's thresholds, since the band is shown by fill
 *  colour alone in a dense grid. */
export function HeatLegend() {
  const t = useTheme()
  return (
    <p style={{ margin: 0, fontSize: ty.meta, color: t.muted }}>
      Healthy 80 and above &middot; Watch 60 to 79 &middot; Act below 60
    </p>
  )
}

/** A value short enough for a dense heat cell; the sr-only table keeps the full form. */
function compactValue(value: number, unit: Unit): string {
  if (unit === 'pct') return `${value.toLocaleString('en-GB')}%`
  if (unit === 'gbp') return `£${Math.round(value / 1000).toLocaleString('en-GB')}k`
  if (unit === 'level') return value.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return value.toLocaleString('en-GB')
}

export interface MetricHeatCell {
  value: number
  unit: Unit
  score: number
}

/** Rows by metric columns: each cell is the row's value, tinted and striped in
 *  the band its score falls in. The grid is decorative; an sr-only table with
 *  the full values and band words carries the data. */
export function MetricHeat({
  columns,
  rows,
  caption,
  rowHeader,
}: {
  columns: { id: string; label: string; full: string }[]
  rows: { id: string; label: string; labId?: LabId; cells: MetricHeatCell[] }[]
  caption: string
  rowHeader: string
}) {
  const t = useTheme()
  const template = `150px repeat(${columns.length}, minmax(0, 1fr))`
  return (
    <div className="ph-metric-heat">
      <div className="ph-metric-heat__grid" aria-hidden="true" style={{ gridTemplateRows: `auto repeat(${rows.length}, minmax(0, 1fr))` }}>
        <div className="ph-metric-heat__row ph-metric-heat__row--head" style={{ gridTemplateColumns: template }}>
          <span />
          {columns.map((c) => (
            <span key={c.id} className="ph-metric-heat__head" title={c.full}>
              {c.label}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.id} className="ph-metric-heat__row" style={{ gridTemplateColumns: template }}>
            <span className="ph-metric-heat__label">
              {r.labId && <LabChip labId={r.labId} size="sm" />}
              <span className="ph-metric-heat__name">{r.label}</span>
            </span>
            {r.cells.map((c, i) => {
              const band = bandFor(c.score)
              const s = t.bands[band]
              return (
                <span
                  key={columns[i]?.id ?? i}
                  className="ph-metric-heat__cell"
                  title={`${formatValue(c.value, c.unit)}, ${BAND_LABEL[band]}`}
                  style={{ background: s.fill, color: s.text, borderLeftColor: s.key }}
                >
                  {compactValue(c.value, c.unit)}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {columns.map((c) => (
              <th key={c.id} scope="col">
                {c.full}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                {r.label}
                {r.labId && `, ${labById(r.labId)?.name}`}
              </th>
              {r.cells.map((c, i) => (
                <td key={columns[i]?.id ?? i}>
                  {formatValue(c.value, c.unit)}, {BAND_LABEL[bandFor(c.score)]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One node of the leadership chart: a small card with a mono role line, an
 *  optional lab chip, and up to two lines beneath. The text is real, so the
 *  enclosing list reads in order. */
export function OrgNode({
  role,
  labId,
  name,
  detail,
}: {
  role: string
  labId?: LabId
  name?: string
  detail: string
}) {
  return (
    <div className="ph-org__node">
      <span className="ph-org__role">
        {labId && <LabChip labId={labId} size="sm" />}
        {role}
      </span>
      {name && <span className="ph-org__name">{name}</span>}
      <span className="ph-org__detail">{detail}</span>
    </div>
  )
}

/** A skills-coverage cell: the holder count, muted at 0, amber with the word
 *  "thin" at 1 or 2, sage at 3 and above. The word carries the state. */
export function DepthCell({ count }: { count: number }) {
  const depth = count === 0 ? 'none' : count <= 2 ? 'thin' : 'covered'
  return (
    <span className={`ph-depth ph-depth--${depth}`} title={depth === 'thin' ? `${count}, thin` : String(count)}>
      {count}
      {depth === 'thin' && <span className="ph-depth__word">thin</span>}
    </span>
  )
}
