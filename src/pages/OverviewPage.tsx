import { Page, REFRESHED_ISO } from '../components/Page'
import { Card, HeaderLabLegend, HeatCell, HeatLegend, Kicker, LabChip, Sparkline, StatusPill, formatValue } from '../components/primitives'
import { ACTIONS } from '../data/actions'
import { DOMAINS, DOMAIN_GROUPS, domainById, groupById, groupSpans, systemsOf } from '../data/domains'
import {
  BAND_LABEL,
  aggregateMetrics,
  bandFor,
  filteredTeams,
  isScored,
  scopeDomainScore,
  scoreMetric,
  targetFor,
  teamScore,
} from '../data/health'
import { LABS, TEAMS, labById, teamsInLab } from '../data/labs'
import { TEAM_METRICS } from '../data/metrics'
import type { Action, Domain, HealthBand, LabId, MetricDef, TeamId } from '../data/types'
import { periodPoints, useFilters } from '../filter-context'
import { useTheme } from '../theme-context'

const CORE_DOMAINS = DOMAINS.filter((d) => !d.proposed)
const CORE_SYSTEMS = systemsOf(CORE_DOMAINS)
const CORE_GROUPS = groupSpans(CORE_DOMAINS)
/** Domain cards sit in two rows; heat rows carry one column per core domain. */
const DOMAIN_GRID_STYLE = { gridTemplateColumns: `repeat(${Math.ceil(DOMAINS.length / 2)}, minmax(0, 1fr))` }
const HEAT_ROW_STYLE = { gridTemplateColumns: `156px repeat(${CORE_DOMAINS.length}, minmax(0, 1fr))` }
const TEAM_BY_ID = new Map(TEAMS.map((tm) => [tm.id, tm]))
const QUARTER_WORDS: Record<number, string> = { 2: 'two', 4: 'four', 6: 'six' }
const MIX_LABEL: Record<HealthBand, string> = {
  healthy: 'healthy',
  watch: 'to watch',
  act: 'to act',
}

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0

/** A team's composite a number of quarters ago: the mean of its core domain scores. */
const teamCompositeAt = (id: TeamId, quartersAgo: number) =>
  mean(CORE_DOMAINS.map((d) => scopeDomainScore(d, [id], quartersAgo)))

/** The scored metric with the lowest mean team score for a domain. */
function domainDriver(domain: Domain, teamIds: TeamId[]) {
  const scored = domain.metrics.filter(isScored)
  const rows = scored.map((def: MetricDef) => ({
    def,
    agg: aggregateMetrics(teamIds, def),
    score: mean(teamIds.map((id) => scoreMetric(def, TEAM_METRICS[id][def.id].value))),
  }))
  rows.sort((a, b) => a.score - b.score)
  return rows[0]
}

/** Domain score for the scope across the trend window, oldest first. */
function domainTrend(domain: Domain, teamIds: TeamId[], points: number): number[] {
  return Array.from({ length: points }, (_, i) => scopeDomainScore(domain, teamIds, points - 1 - i))
}

function severityRank(a: Action) {
  return a.severity === 'act' ? 0 : 1
}

export function OverviewPage() {
  const t = useTheme()
  const { labId, teamId, period } = useFilters()
  const points = periodPoints(period)

  const scope = filteredTeams(labId, teamId)
  const scopeIds = scope.map((tm) => tm.id)
  const scopeName =
    (teamId ? scope[0]?.name : labId ? labById(labId)?.name : undefined) ?? 'the estate'

  const scoreForDomain = (d: Domain) => scopeDomainScore(d, scopeIds)
  const compositeScore = mean(scope.map((tm) => teamScore(tm.id)))
  const compositeBand = bandFor(compositeScore)
  const compositeTrend = Array.from({ length: points }, (_, i) =>
    mean(scopeIds.map((id) => teamCompositeAt(id, points - 1 - i))),
  )

  const domainScores = CORE_DOMAINS.map((d) => ({ domain: d, score: scoreForDomain(d) }))
  const mix = (['healthy', 'watch', 'act'] as const).map((band) => ({
    band,
    count: domainScores.filter((d) => bandFor(d.score) === band).length,
  }))
  const domainsHealthy = mix[0].count
  const domainsAct = mix[2].count
  const worstDomain = domainScores.reduce((worst, d) => (d.score < worst.score ? d : worst))
  const teamsAct = scope.filter((tm) => bandFor(teamScore(tm.id)) === 'act')

  const overdueActions = ACTIONS.filter((a) => scopeIds.includes(a.teamId) && a.due < REFRESHED_ISO)

  const teamsLine =
    teamsAct.length === 0
      ? `No team needs action; ${worstDomain.domain.name} is the weakest domain.`
      : `${teamsAct.length} team${teamsAct.length === 1 ? ' needs' : 's need'} action, led by ${worstDomain.domain.name}.`
  const headline = `${domainsHealthy} of ${CORE_DOMAINS.length} domains healthy across ${scopeName}. ${teamsLine}`

  const rowType = labId ? 'team' : 'lab'
  const heatRows: { id: string; name: string; labId?: LabId; teamIds: TeamId[] }[] = labId
    ? teamsInLab(labId).map((tm) => ({ id: tm.id, name: tm.name, teamIds: [tm.id] }))
    : LABS.map((l) => ({ id: l.id, name: l.name, labId: l.id, teamIds: teamsInLab(l.id).map((tm) => tm.id) }))
  const weekActions = ACTIONS.filter((a) => scopeIds.includes(a.teamId))
    .slice()
    .sort((a, b) => severityRank(a) - severityRank(b) || a.due.localeCompare(b.due))
    .slice(0, 5)

  return (
    <Page
      kicker="Overview"
      sources={CORE_SYSTEMS}
      title="Where the platform stands today"
      headline={headline}
      bodyStyle={{ gridTemplateRows: '180px 280px minmax(0, 1fr)', gridTemplateColumns: '1fr' }}
    >
      <HeaderLabLegend />
      <Card style={{ flex: 'none', overflow: 'hidden' }}>
        <div className="ph-hero">
          <div className="ph-hero__score">
            <div className="ph-hero__figure">
              <Kicker>Composite health</Kicker>
              <div className="ph-hero__value">{compositeScore}</div>
              <StatusPill band={compositeBand} />
            </div>
            <div className="ph-hero__trend">
              <Sparkline
                points={compositeTrend}
                label="Composite health trend"
                width={200}
                height={64}
                band={compositeBand}
                scale="score"
              />
              <div className="ph-hero__caption">
                {compositeTrend[0]} to {compositeTrend[compositeTrend.length - 1]} over{' '}
                {QUARTER_WORDS[points] ?? points} quarters
              </div>
            </div>
          </div>
          <div className="ph-hero__mix">
            <div className="ph-hero__mix-head">
              <Kicker>Domain mix</Kicker>
              <span className="ph-hero__mix-note">{CORE_DOMAINS.length} core domains</span>
            </div>
            <div className="ph-mix" aria-hidden="true">
              {mix
                .filter((m) => m.count > 0)
                .map((m) => (
                  <div
                    key={m.band}
                    className="ph-mix__segment"
                    style={{
                      flexGrow: m.count,
                      background: t.bands[m.band].fill,
                      borderColor: t.bands[m.band].key,
                    }}
                  >
                    <span className="ph-mix__dot" style={{ background: t.bands[m.band].key }} />
                    {m.count} {MIX_LABEL[m.band]}
                  </div>
                ))}
            </div>
            <table className="sr-only">
              <caption>Core domains by health band</caption>
              <tbody>
                {mix.map((m) => (
                  <tr key={m.band}>
                    <th scope="row">{BAND_LABEL[m.band]}</th>
                    <td>{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ph-hero__counts">
              <span>
                Open actions past due <b>{overdueActions.length}</b>
              </span>
              <span>
                Teams in Act band <b>{teamsAct.length}</b>
              </span>
              <span>
                Domains in Act band <b>{domainsAct}</b>
              </span>
            </p>
          </div>
        </div>
      </Card>

      <div className="ph-domain-grid" style={DOMAIN_GRID_STYLE}>
        {DOMAINS.map((d) => {
          const score = scoreForDomain(d)
          const band = bandFor(score)
          const driver = domainDriver(d, scopeIds)
          const target = targetFor(driver.def, scopeIds.length)
          return (
            <Card key={d.id} style={{ opacity: d.proposed ? 0.72 : 1, overflow: 'hidden' }}>
              <div className="ph-domain-card">
                <div className="ph-domain-card__head">
                  <div className="ph-domain-card__name">{d.name}</div>
                  <span className="ph-domain-card__tags">
                    <span className="ph-tag ph-tag--group">{groupById(d.group).short}</span>
                    {d.proposed && <span className="ph-tag">Proposed</span>}
                  </span>
                </div>
                <div className="ph-domain-card__row">
                  <span className="ph-domain-card__value">{score}</span>
                  <StatusPill band={band} />
                </div>
                <div className="ph-domain-card__driver">
                  {driver.def.short}: {formatValue(driver.agg.value, driver.def.unit)} vs target{' '}
                  {formatValue(target, driver.def.unit)}
                </div>
                <Sparkline
                  points={domainTrend(d, scopeIds, points)}
                  label={`${d.name} trend`}
                  width={172}
                  height={30}
                  band={band}
                  scale="score"
                />
              </div>
            </Card>
          )
        })}
        <Card title="Overview key" style={{ overflow: 'hidden', padding: '12px 8px' }}>
          <div className="ph-key">
            <span className="ph-key__bands">
              <span className="ph-key__row"><StatusPill band="healthy" size="sm" /> 80+</span>
              <span className="ph-key__row"><StatusPill band="watch" size="sm" /> 60&ndash;79</span>
              <span className="ph-key__row"><StatusPill band="act" size="sm" /> &lt;60</span>
            </span>
            <span className="ph-key__row ph-key__groups">
              {DOMAIN_GROUPS.map((g) => (
                <span key={g.id} className="ph-tag ph-tag--group" title={g.name}>
                  {g.short}
                </span>
              ))}
            </span>
            <span className="ph-key__row">
              <span className="ph-tag ph-tag--proposed">Proposed</span> not yet sourced
            </span>
          </div>
        </Card>
      </div>

      <div className="ph-bottom">
        <Card
          title={`Heat by ${rowType}`}
          subtitle="Score by core domain"
          style={{ overflow: 'hidden' }}
          right={
            <div className="ph-heat-legend" style={{ alignItems: 'center' }}>
              <span aria-hidden="true">
                <StatusPill band="healthy" />
                <StatusPill band="watch" />
                <StatusPill band="act" />
              </span>
              <HeatLegend />
            </div>
          }
        >
          <div className="ph-heat-table" aria-hidden="true">
            <div className="ph-heat-row ph-heat-row--groups" style={HEAT_ROW_STYLE}>
              <span />
              {CORE_GROUPS.map((g) => (
                <span key={g.id} className="ph-heat-group" style={{ gridColumn: `span ${g.span}` }}>
                  {g.short}
                </span>
              ))}
            </div>
            <div className="ph-heat-row ph-heat-row--head" style={HEAT_ROW_STYLE}>
              <span />
              {CORE_DOMAINS.map((d) => (
                <span key={d.id} className="ph-heat-head-cell">
                  {d.name}
                </span>
              ))}
            </div>
            {heatRows.map((row) => (
              <div className="ph-heat-row" key={row.id} style={HEAT_ROW_STYLE}>
                <span className="ph-heat-row-label">
                  {row.labId ? <LabChip labId={row.labId} withName /> : row.name}
                </span>
                {CORE_DOMAINS.map((d) => {
                  const score = scopeDomainScore(d, row.teamIds)
                  return <HeatCell key={d.id} score={score} band={bandFor(score)} size="sm" />
                })}
              </div>
            ))}
          </div>
          <table className="sr-only">
            <caption>Health score by {rowType} and domain</caption>
            <thead>
              <tr>
                <td />
                {CORE_GROUPS.map((g) => (
                  <th key={g.id} scope="colgroup" colSpan={g.span}>
                    {g.name}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col">{labId ? 'Team' : 'Lab'}</th>
                {CORE_DOMAINS.map((d) => (
                  <th key={d.id} scope="col">
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name}</th>
                  {CORE_DOMAINS.map((d) => {
                    const score = scopeDomainScore(d, row.teamIds)
                    return (
                      <td key={d.id}>
                        {score}, {BAND_LABEL[bandFor(score)]}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Priority actions" subtitle="Top five by severity, then due date" style={{ overflow: 'hidden' }}>
          <div className="ph-actions-list ph-actions-list--compact">
            {weekActions.map((a) => {
              const team = TEAM_BY_ID.get(a.teamId)
              const domain = domainById(a.domainId)
              const due = new Date(a.due).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              })
              return (
                <div className="ph-action" key={a.id}>
                  <div className="ph-action__body">
                    <span className="ph-action__meta">
                      {domain?.name} &middot; {team?.name}
                    </span>
                    <span className="ph-action__text">{a.text}</span>
                  </div>
                  <div className="ph-action__side">
                    <StatusPill band={a.severity} />
                    <span className="ph-action__due">Due {due}</span>
                  </div>
                </div>
              )
            })}
            {weekActions.length === 0 && (
              <p style={{ color: t.muted, margin: 0 }}>No open actions in scope.</p>
            )}
          </div>
        </Card>
      </div>
    </Page>
  )
}
