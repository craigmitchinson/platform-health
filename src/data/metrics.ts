// The fixture behind every figure: one sample per team per metric, generated
// by a seeded function so the numbers are varied but identical on every load.
import { ALL_METRICS, domainById, spanFor } from './domains'
import { TEAMS } from './labs'
import type { MetricDef, MetricId, MetricSample, TeamId, TeamMetrics } from './types'

// mulberry32: a small, deterministic PRNG.
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// How stretched each team is, 0 (thriving) to 1 (struggling). A few teams are
// clearly worse so the drill-downs have a story to tell.
const STRAIN: Record<TeamId, number> = {
  automation: 0.2,
  agents: 0.85,
  observability: 0.3,
  onboarding: 0.25,
  digital: 0.1,
  contact: 0.75,
  warehouse: 0.45,
  analytics: 0.15,
  reporting: 0.9,
  policy: 0.35,
  portal: 0.55,
  claims: 0.4,
}

function tidy(def: MetricDef, raw: number): number {
  if (def.unit === 'level') return Math.min(5, Math.max(1, Math.round(raw * 10) / 10))
  if (def.unit === 'gbp') return Math.max(0, Math.round(raw / 100) * 100)
  if (def.unit === 'pct') {
    const upper = def.direction === 'higher' ? 100 : 150
    const lower = def.id === 'cloudSpendTrend' ? -15 : 0
    return Math.min(upper, Math.max(lower, Math.round(raw)))
  }
  return Math.max(0, Math.round(raw))
}

function sample(def: MetricDef, strain: number, rand: () => number): MetricSample {
  const s = spanFor(def)
  const sign = def.direction === 'lower' ? 1 : -1
  // Context metrics are not scored, so they vary around target without strain.
  const d = def.note ? (rand() - 0.5) * 0.8 : strain * 1.1 + (rand() - 0.5) * 0.6 - 0.25
  const value = tidy(def, def.target + sign * s * d)
  // Strained teams have been getting worse, so their earlier quarters were better.
  const drift = s * (0.04 + strain * 0.06) * (rand() < 0.25 ? -1 : 1)
  const trend = Array.from({ length: 6 }, (_, i) => {
    if (i === 5) return value
    const back = 5 - i
    return tidy(def, value - sign * drift * back + (rand() - 0.5) * s * 0.1)
  })
  return { value, trend }
}

const MATURITY_METRICS = domainById('maturity')?.metrics ?? []
const MATURITY_IDS = new Set(MATURITY_METRICS.map((m) => m.id))

/** The four capability levels behind overall maturity, with how far each
 *  typically sits from the team's base level: triage is the most practised,
 *  problem management the least. */
const CAPABILITY_OFFSET: Partial<Record<MetricId, number>> = {
  triageMaturity: 0.35,
  incidentMaturity: 0.15,
  recoveryMaturity: -0.2,
  resolutionMaturity: -0.45,
}

/** How far a team's stability metrics sit from target, 0 (on target) to 1. */
function stabilityStrain(row: Record<MetricId, MetricSample>): number {
  const defs = (domainById('stability')?.metrics ?? []).filter((m) => !m.note)
  if (!defs.length) return 0
  const gaps = defs.map((def) => {
    const v = row[def.id].value
    const gap = def.direction === 'lower' ? v - def.target : def.target - v
    return Math.min(1, Math.max(0, gap / spanFor(def)))
  })
  return gaps.reduce((a, b) => a + b, 0) / gaps.length
}

/** Maturity follows stability loosely, on its own seed so the other domains'
 *  figures are unchanged. Overall maturity is the mean of the four capability
 *  levels at every point, never seeded on its own. */
function maturity(row: Record<MetricId, MetricSample>, rand: () => number) {
  const strain = stabilityStrain(row)
  const base = 4.4 - 2.8 * strain + (rand() - 0.5) * 0.5
  const caps = MATURITY_METRICS.filter((m) => m.id in CAPABILITY_OFFSET)
  caps.forEach((def) => {
    const value = tidy(def, base + (CAPABILITY_OFFSET[def.id] ?? 0) + (rand() - 0.5) * 0.6)
    // Most teams have been maturing, so their earlier quarters were lower.
    const drift = (0.05 + rand() * 0.1) * (rand() < 0.25 ? -1 : 1)
    const trend = Array.from({ length: 6 }, (_, i) =>
      i === 5 ? value : tidy(def, value - drift * (5 - i) + (rand() - 0.5) * 0.2),
    )
    row[def.id] = { value, trend }
  })
  const overall = Array.from(
    { length: 6 },
    (_, i) => caps.reduce((a, def) => a + row[def.id].trend[i], 0) / caps.length,
  )
  row.serviceMaturity = { value: overall[5], trend: overall }
  MATURITY_METRICS.filter((m) => m.unit !== 'level').forEach((def) => {
    row[def.id] = sample(def, strain, rand)
  })
}

/** Metrics seeded after the rest, on their own seed, so incidents can follow
 *  stability and problems can follow maturity. MTTR keeps its place in the
 *  main sequence. */
const INCIDENT_METRICS = (domainById('incidents')?.metrics ?? []).filter((m) => m.id !== 'mttr')
const PROBLEM_METRICS = domainById('problems')?.metrics ?? []
const LATER_IDS = new Set<MetricId>([
  ...INCIDENT_METRICS.map((m) => m.id),
  ...PROBLEM_METRICS.map((m) => m.id),
  'emergencyChanges',
  'changeLeadTime',
  'endOfSupport',
])

/** Incidents follow stability and problems follow maturity; the other later
 *  metrics follow the team's own strain. */
function later(row: Record<MetricId, MetricSample>, strain: number, rand: () => number) {
  const incidentStrain = Math.min(1, ((stabilityStrain(row) + 0.25) / 1.1) * 0.7 + strain * 0.3)
  INCIDENT_METRICS.forEach((def) => {
    row[def.id] = sample(def, incidentStrain, rand)
  })
  const maturityGap = Math.min(1, Math.max(0, (4.4 - row.serviceMaturity.value) / 2.8))
  const problemStrain = maturityGap * 0.7 + strain * 0.3
  PROBLEM_METRICS.forEach((def) => {
    row[def.id] = sample(def, problemStrain, rand)
  })
  ALL_METRICS.filter((m) => LATER_IDS.has(m.id) && !(m.id in row)).forEach((def) => {
    row[def.id] = sample(def, strain, rand)
  })
}

function build(): TeamMetrics {
  const out = {} as TeamMetrics
  TEAMS.forEach((team, ti) => {
    const rand = seeded(20260928 + ti * 7919)
    const row = {} as Record<MetricId, MetricSample>
    ALL_METRICS.filter((def) => !MATURITY_IDS.has(def.id) && !LATER_IDS.has(def.id)).forEach((def) => {
      row[def.id] = sample(def, STRAIN[team.id], rand)
    })
    maturity(row, seeded(20261001 + ti * 7919))
    later(row, STRAIN[team.id], seeded(20261015 + ti * 7919))
    out[team.id] = row
  })
  return out
}

export const TEAM_METRICS: TeamMetrics = build()
