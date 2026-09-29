// Pure scoring functions. Every band on every page comes from here, so the
// thresholds live in one place: 80 and above is healthy, 60 to 79 is watch,
// below 60 is act.
import { DOMAINS, spanFor } from './domains'
import { TEAMS } from './labs'
import { TEAM_METRICS } from './metrics'
import type {
  Domain,
  DomainId,
  HealthBand,
  LabId,
  MetricDef,
  MetricId,
  MetricSample,
  Team,
  TeamId,
} from './types'

export { spanFor }

/** Target for a group of teams: sums scale with the group, rates do not. */
export function targetFor(def: MetricDef, teamCount = 1): number {
  return def.aggregate === 'sum' ? def.target * Math.max(1, teamCount) : def.target
}

/** 0 to 100. At or better than target scores 100; the score falls linearly to 0
 *  across the metric's span. */
export function scoreMetric(def: MetricDef, value: number, teamCount = 1): number {
  const target = targetFor(def, teamCount)
  const span = def.aggregate === 'sum' ? spanFor(def) * Math.max(1, teamCount) : spanFor(def)
  const gap = def.direction === 'lower' ? value - target : target - value
  if (gap <= 0) return 100
  return Math.max(0, Math.round(100 - (100 * gap) / span))
}

/** Metrics carrying a note are context only and never scored. */
export const isScored = (def: MetricDef) => !def.note

/** Mean score of a domain's scored metrics for one set of samples. */
export function domainScore(
  domain: Domain,
  samples: Partial<Record<MetricId, MetricSample>>,
  teamCount = 1,
): number {
  const scores = domain.metrics
    .filter(isScored)
    .flatMap((m) => {
      const s = samples[m.id]
      return s ? [scoreMetric(m, s.value, teamCount)] : []
    })
  if (!scores.length) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

export function bandFor(score: number): HealthBand {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'watch'
  return 'act'
}

export const BAND_LABEL: Record<HealthBand, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  act: 'Act',
}

function combine(values: number[], how: MetricDef['aggregate']): number {
  if (!values.length) return 0
  if (how === 'sum') return values.reduce((a, b) => a + b, 0)
  if (how === 'max') return Math.max(...values)
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

/** Roll a metric up across teams, point by point, respecting its aggregate. */
export function aggregateMetrics(teamIds: TeamId[], def: MetricDef): MetricSample {
  const samples = teamIds.map((id) => TEAM_METRICS[id][def.id])
  const points = samples[0]?.trend.length ?? 0
  const trend = Array.from({ length: points }, (_, i) =>
    combine(
      samples.map((s) => s.trend[i]),
      def.aggregate,
    ),
  )
  return { value: combine(samples.map((s) => s.value), def.aggregate), trend }
}

/** A team's score for one domain, or across every scored, non-proposed domain. */
export function teamScore(teamId: TeamId, domainId?: DomainId): number {
  const domains = domainId
    ? DOMAINS.filter((d) => d.id === domainId)
    : DOMAINS.filter((d) => !d.proposed)
  const scores = domains.map((d) => domainScore(d, TEAM_METRICS[teamId]))
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0

/** Mean team score across a lab, for one domain or overall. */
export function labScore(labId: LabId, domainId?: DomainId): number {
  return mean(TEAMS.filter((t) => t.labId === labId).map((t) => teamScore(t.id, domainId)))
}

/** A domain's score for a set of teams: the mean of each team's own domain
 *  score. Every page scores a scope this way. `quartersAgo` reads an earlier
 *  trend point instead of the current value. */
export function scopeDomainScore(domain: Domain, teamIds: TeamId[], quartersAgo = 0): number {
  return mean(
    teamIds.map((id) => {
      const samples = quartersAgo
        ? Object.fromEntries(
            Object.entries(TEAM_METRICS[id]).map(([k, s]) => {
              const value = s.trend[s.trend.length - 1 - quartersAgo] ?? s.value
              return [k, { value, trend: s.trend }]
            }),
          )
        : TEAM_METRICS[id]
      return domainScore(domain, samples)
    }),
  )
}

/** The teams in scope for the current slicers. A team wins over a lab. */
export function filteredTeams(labId?: LabId, teamId?: TeamId): Team[] {
  if (teamId) return TEAMS.filter((t) => t.id === teamId)
  if (labId) return TEAMS.filter((t) => t.labId === labId)
  return TEAMS
}
