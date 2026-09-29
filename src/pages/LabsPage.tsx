import { useLayoutEffect, useRef, useState } from 'react'
import { Page } from '../components/Page'
import { Card, HeaderLabLegend, HeatCell, HeatLegend, LabChip, Sparkline, StatusPill } from '../components/primitives'
import { DOMAINS, groupSpans, systemsOf } from '../data/domains'
import { BAND_LABEL, bandFor, filteredTeams, labScore, scopeDomainScore, teamScore } from '../data/health'
import { LABS, teamsInLab } from '../data/labs'
import type { LabId, Team, TeamId } from '../data/types'
import { periodPoints, useFilters } from '../filter-context'
import { useTheme } from '../theme-context'

const CORE_DOMAINS = DOMAINS.filter((d) => !d.proposed)
const CORE_SYSTEMS = systemsOf(CORE_DOMAINS)
const CORE_GROUPS = groupSpans(CORE_DOMAINS)

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0

function teamsByBand(labId: LabId) {
  const counts = { healthy: 0, watch: 0, act: 0 }
  teamsInLab(labId).forEach((t) => {
    counts[bandFor(teamScore(t.id))] += 1
  })
  return counts
}

/** A team's composite score at one trend point, mirroring teamScore's method. */
function compositeAt(teamId: TeamId, i: number): number {
  const domainScores = CORE_DOMAINS.map((d) => scopeDomainScore(d, [teamId], 5 - i))
  return Math.round(domainScores.reduce((a, b) => a + b, 0) / domainScores.length)
}

/** A team's composite trend across the last `points` quarters. */
function compositeTrend(teamId: TeamId, points: number): number[] {
  return Array.from({ length: 6 }, (_, i) => compositeAt(teamId, i)).slice(-points)
}

const QUARTERS = ['Q-5', 'Q-4', 'Q-3', 'Q-2', 'Q-1', 'Now']
/** Team table rows: the table box's measured height, less its (measured) header, split into
 *  rows no shorter than 22px, mirroring the Deneb team-matrix. A 303px fallback (the card's
 *  usual inner height before the box is first measured) keeps the initial render sane. */
const TEAM_ROW_MIN_H = 22
const TEAM_BOX_H_FALLBACK = 303
const TEAM_HEAD_H_FALLBACK = 40

/** Six quarters of each lab's score in each core domain: a small sparkline per
 *  cell, tinted by this quarter's band, with the score beside it. The grid is
 *  decorative; the sr-only table carries every point. */
function LabTrendGrid() {
  const t = useTheme()
  const rows = LABS.map((l) => {
    const ids = teamsInLab(l.id).map((tm) => tm.id)
    return {
      lab: l,
      cells: CORE_DOMAINS.map((d) => Array.from({ length: 6 }, (_, i) => scopeDomainScore(d, ids, 5 - i))),
    }
  })
  const template = `170px repeat(${CORE_DOMAINS.length}, minmax(0, 1fr))`
  return (
    <>
      <div className="ph-lab-trend" aria-hidden="true">
        <div className="ph-lab-trend__row ph-lab-trend__row--head" style={{ gridTemplateColumns: template }}>
          <span />
          {CORE_DOMAINS.map((d) => (
            <span key={d.id} className="ph-heat-head-cell">
              {d.name}
            </span>
          ))}
        </div>
        {rows.map(({ lab, cells }) => (
          <div key={lab.id} className="ph-lab-trend__row" style={{ gridTemplateColumns: template }}>
            <span className="ph-heat-row-label">
              <LabChip labId={lab.id} withName />
            </span>
            {cells.map((pts, i) => {
              const score = pts[pts.length - 1]
              const band = bandFor(score)
              const s = t.bands[band]
              return (
                <span
                  key={CORE_DOMAINS[i].id}
                  className="ph-lab-trend__cell"
                  title={`${CORE_DOMAINS[i].name}, ${score}, ${BAND_LABEL[band]}`}
                  style={{ background: s.fill, borderLeftColor: s.key }}
                >
                  <svg width={64} height={24} viewBox="0 0 64 24" style={{ flex: 'none' }}>
                    {(() => {
                      const lo = Math.min(...pts)
                      const range = Math.max(...pts) - lo || 1
                      const xy = pts.map((p, j) => [2 + (j * 60) / 5, 21 - ((p - lo) / range) * 18] as const)
                      const line = xy.map(([x, y]) => `${x},${y}`).join(' ')
                      const [ex, ey] = xy[xy.length - 1]
                      return (
                        <>
                          <path d={`M${line.replace(/ /g, ' L')} L${ex},22 L2,22 Z`} fill={t.green} fillOpacity={0.18} />
                          <polyline points={line} fill="none" stroke={t.brand} strokeWidth={1.5} strokeLinejoin="round" />
                          <circle cx={ex} cy={ey} r={3} fill={s.key} stroke={t.surface} strokeWidth={1} />
                        </>
                      )
                    })()}
                  </svg>
                  <span className="ph-lab-trend__score">{score}</span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Six-quarter score by lab and core domain, oldest quarter first, with this quarter's band</caption>
        <thead>
          <tr>
            <th scope="col">Lab</th>
            {CORE_DOMAINS.map((d) => (
              <th key={d.id} scope="col">
                {d.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lab, cells }) => (
            <tr key={lab.id}>
              <th scope="row">{lab.name}</th>
              {cells.map((pts, i) => (
                <td key={CORE_DOMAINS[i].id}>
                  {pts.map((p, j) => `${QUARTERS[j]} ${p}`).join(', ')}; {BAND_LABEL[bandFor(pts[pts.length - 1])]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function labHeadline(scope: Team[], teamId?: TeamId): string {
  if (teamId && scope[0]) {
    const score = teamScore(scope[0].id)
    return `${scope[0].name} scores ${score}, in the ${BAND_LABEL[bandFor(score)]} band.`
  }
  const labs = LABS.flatMap((l) => {
    const teams = scope.filter((tm) => tm.labId === l.id)
    if (!teams.length) return []
    const scores = teams.map((tm) => teamScore(tm.id))
    return [{ lab: l, teams: teams.length, score: mean(scores), act: scores.filter((s) => bandFor(s) === 'act').length }]
  })
  if (!labs.length) return 'No teams in scope.'
  if (labs.length === 1) {
    const [only] = labs
    return `${only.lab.name} scores ${only.score}; ${only.act} of ${only.teams} teams sit in the Act band.`
  }
  const best = labs.reduce((b, l) => (l.score > b.score ? l : b))
  const mostAct = labs.reduce((m, l) => (l.act > m.act ? l : m))
  return mostAct.act
    ? `${best.lab.name} is the healthiest lab; ${mostAct.lab.name} carries the most Act ratings.`
    : `${best.lab.name} is the healthiest lab; no lab has a team in the Act band.`
}

export function LabsPage() {
  const t = useTheme()
  const { labId, teamId, period, setLab, setTeam } = useFilters()
  const points = periodPoints(period)

  const teamBoxRef = useRef<HTMLDivElement>(null)
  const teamHeadRef = useRef<HTMLTableSectionElement>(null)
  const [teamBoxH, setTeamBoxH] = useState(TEAM_BOX_H_FALLBACK)
  const [teamHeadH, setTeamHeadH] = useState(TEAM_HEAD_H_FALLBACK)

  useLayoutEffect(() => {
    const box = teamBoxRef.current
    if (!box) return
    const measure = () => {
      setTeamBoxH(box.clientHeight)
      if (teamHeadRef.current) setTeamHeadH(teamHeadRef.current.getBoundingClientRect().height)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  const scope = filteredTeams(labId, teamId)
  const headline = labHeadline(scope, teamId)

  const rows = scope
    .map((tm) => ({ team: tm, score: teamScore(tm.id) }))
    .sort((a, b) => a.score - b.score)
  const shownRows = rows
  const teamRowsAvailableH = teamBoxH - teamHeadH
  const teamRowH = Math.max(TEAM_ROW_MIN_H, teamRowsAvailableH / (rows.length || 1))

  const movers = scope.map((tm) => {
    const trend = compositeTrend(tm.id, points)
    return { team: tm, trend, change: trend[trend.length - 1] - trend[0] }
  })
  const improved = movers
    .filter((m) => m.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 3)
  const declined = movers
    .filter((m) => m.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 3)
  const changeText = (change: number) => `${change > 0 ? '+' : '−'}${Math.abs(change)} ${change > 0 ? 'better' : 'worse'}`

  return (
    <Page
      kicker="Labs and teams"
      sources={CORE_SYSTEMS}
      title="How each lab and team is holding up"
      headline={headline}
      bodyStyle={{ gridTemplateRows: '170px 185px 1fr', gridTemplateColumns: '1fr' }}
    >
      <HeaderLabLegend />
      <div className="ph-lab-row">
        {LABS.map((l) => {
          const counts = teamsByBand(l.id)
          const score = labScore(l.id)
          const isSelected = labId === l.id && !teamId
          return (
            <button
              key={l.id}
              type="button"
              className={`ph-lab-card${isSelected ? ' is-selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => {
                setTeam(undefined)
                setLab(isSelected ? undefined : l.id)
              }}
            >
              <span className="ph-lab-card__name">
                <LabChip labId={l.id} withName />
              </span>
              <span className="ph-lab-card__lead">{l.lead}</span>
              <span className="ph-lab-card__row">
                <span className="ph-lab-card__score">{score}</span>
                <StatusPill band={bandFor(score)} />
                {isSelected && <span className="ph-tag">Selected</span>}
              </span>
              <span className="ph-lab-card__counts">
                {counts.healthy} healthy &middot; {counts.watch} watch &middot; {counts.act} act
              </span>
            </button>
          )
        })}
      </div>

      <Card title="Six-quarter trend" subtitle="Score by lab and core domain, oldest to now" right={<HeatLegend />} style={{ overflow: 'hidden' }}>
        <LabTrendGrid />
      </Card>

      <div className="ph-labs-main">
        <Card title="Teams" subtitle="Weakest composite first" right={<HeatLegend />} style={{ flex: '1 1 auto', overflow: 'hidden', padding: '10px 16px' }}>
          <div ref={teamBoxRef} style={{ height: '100%', minHeight: 0 }}>
          <table className="ph-team-table">
            <caption className="sr-only">
              Teams {labId || teamId ? 'in scope' : 'across the estate'}, weakest composite score first
            </caption>
            <thead ref={teamHeadRef}>
              <tr className="ph-team-table__groups">
                <td colSpan={3} />
                {CORE_GROUPS.map((g) => (
                  <th key={g.id} scope="colgroup" colSpan={g.span} className="ph-team-table__group-head">
                    <span aria-hidden="true">{g.short}</span>
                    <span className="sr-only">{g.name}</span>
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Lab</th>
                <th scope="col">Composite</th>
                {CORE_DOMAINS.map((d) => (
                  <th key={d.id} scope="col" className="ph-team-table__domain-head">
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map(({ team, score }) => {
                return (
                  <tr key={team.id} style={{ height: `${teamRowH}px` }}>
                    <th scope="row">
                      <button type="button" className="ph-row-select" onClick={() => setTeam(team.id)}>
                        {team.name}
                      </button>
                    </th>
                    <td>
                      <LabChip labId={team.labId} />
                    </td>
                    <td>
                      {score} <StatusPill band={bandFor(score)} />
                    </td>
                    {CORE_DOMAINS.map((d) => {
                      const domainScoreValue = teamScore(team.id, d.id)
                      return (
                        <td key={d.id} className="ph-team-table__domain-cell">
                          <HeatCell score={domainScoreValue} band={bandFor(domainScoreValue)} size="sm" />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </Card>

        <div className="ph-movers-rail">
          <Card title="Movers" subtitle={`Composite change, last ${points} quarters`} style={{ flex: '1 1 auto', overflow: 'hidden' }}>
            <div className="ph-movers">
              <div>
                <div className="ph-movers__label">Improved most</div>
                {improved.map((m) => (
                  <div className="ph-mover" key={m.team.id}>
                    <span className="ph-mover__name">
                      <LabChip labId={m.team.labId} size="sm" /> {m.team.name} {changeText(m.change)}
                    </span>
                    <Sparkline points={m.trend} label={`${m.team.name} composite trend`} width={90} height={24} />
                  </div>
                ))}
                {improved.length === 0 && <p className="ph-mover__none">No team improved.</p>}
              </div>
              <div>
                <div className="ph-movers__label">Declined most</div>
                {declined.map((m) => (
                  <div className="ph-mover" key={m.team.id}>
                    <span className="ph-mover__name">
                      <LabChip labId={m.team.labId} size="sm" /> {m.team.name} {changeText(m.change)}
                    </span>
                    <Sparkline points={m.trend} label={`${m.team.name} composite trend`} width={90} height={24} colour={t.red} />
                  </div>
                ))}
                {declined.length === 0 && <p className="ph-mover__none">No team declined.</p>}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  )
}
