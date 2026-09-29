import { Page } from '../components/Page'
import { Card, DepthCell, HeaderLabLegend, LabChip, OrgNode, StatusPill } from '../components/primitives'
import { domainById, systemsOf } from '../data/domains'
import { LABS, TEAMS } from '../data/labs'
import {
  LEADERS,
  PEOPLE,
  ROLE_GROUPS,
  SKILL_COVERAGE,
  SKILL_FLAG_LABEL,
  THIN_SKILLS,
  VACANCIES,
  contractorPct,
  peopleInLab,
  roleComposition,
  spanOf,
} from '../data/people'
import type { HealthBand, RoleGroup, SkillFlag } from '../data/types'
import { labColours } from '../theme'
import { useTheme } from '../theme-context'

const PEOPLE_DOMAIN = domainById('people')
const TEAM_NAME = new Map(TEAMS.map((t) => [t.id, t.name]))
const FLAG_BAND: Record<SkillFlag, HealthBand> = { single: 'act', thin: 'watch', covered: 'healthy' }

/** Platform lead, lab leads and team leads as a nested list, joined by hairlines. */
function LeadershipChart() {
  const platform = LEADERS.find((p) => p.leadLevel === 1)
  if (!platform) return null
  const labLeads = LEADERS.filter((p) => p.leadLevel === 2)
  const teamLeads = LEADERS.filter((p) => p.leadLevel === 3)
  const span = (people: typeof PEOPLE) => `${people.length} people · ${contractorPct(people)}% contractors`
  return (
    <ul className="ph-org" aria-label="Leadership chart">
      <li>
        <OrgNode role="Platform lead" detail={span(spanOf(platform))} />
        <ul>
          {labLeads.map((lab) => (
            <li key={lab.id}>
              <OrgNode role="Lab lead" labId={lab.labId ?? undefined} detail={span(spanOf(lab))} />
              <ul>
                {teamLeads
                  .filter((tl) => tl.parentId === lab.id)
                  .map((tl) => (
                    <li key={tl.id}>
                      <OrgNode role="Team lead ·" name={tl.teamId ? TEAM_NAME.get(tl.teamId) : ''} detail={`${spanOf(tl).length} people`} />
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  )
}

const GROUP_FILL: Record<RoleGroup, string> = {
  Leadership: 'var(--c-brand)',
  'Product and delivery': 'var(--c-brand-mid)',
  Engineering: 'var(--c-brand-soft)',
  'SRE and operations': 'var(--c-green)',
  Data: 'var(--c-amber)',
  QA: 'var(--c-muted)',
}

/** One stacked bar per lab by role group; each segment's contractor share is a
 *  hatched tail. Counts label the segments; an sr-only table carries the data. */
function RoleComposition() {
  const t = useTheme()
  const rows = LABS.map((l) => ({ lab: l, slices: roleComposition(l.id), people: peopleInLab(l.id) }))
  const max = Math.max(...rows.map((r) => r.people.length))
  const W = 860
  const barW = W - 150
  const rowH = 78
  const barH = 34
  const legendH = 44
  const H = legendH + rows.length * rowH
  const x = (n: number) => (barW * n) / max
  const mono = { fontFamily: 'var(--font-mono)', fontSize: 12, fill: t.muted }
  return (
    <>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block' }}>
        <defs>
          <pattern id="ph-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={t.surface} strokeWidth="3" opacity={0.6} />
          </pattern>
        </defs>
        {ROLE_GROUPS.map((g, i) => {
          const lx = (i % 3) * 250
          const ly = Math.floor(i / 3) * 20
          return (
            <g key={g} transform={`translate(${lx},${ly})`}>
              <rect width={12} height={12} rx={3} fill={GROUP_FILL[g]} />
              <text x={18} y={10.5} style={{ fontSize: 13, fill: t.ink }}>
                {g}
              </text>
            </g>
          )
        })}
        <g transform="translate(750,0)">
          <rect width={12} height={12} rx={3} fill={t.brandSoft} />
          <rect width={12} height={12} rx={3} fill="url(#ph-hatch)" />
          <text x={18} y={10.5} style={{ fontSize: 13, fill: t.ink }}>
            Contractors
          </text>
        </g>
        {rows.map((r, ri) => {
          const y0 = legendH + ri * rowH
          let acc = 0
          return (
            <g key={r.lab.id} transform={`translate(0,${y0})`}>
              <rect x={0} y={2} width={22} height={17} rx={5} fill={labColours[r.lab.id]} />
              <text x={11} y={14.5} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, fill: 'var(--c-lab-ink)' }}>
                {r.lab.code}
              </text>
              <text x={30} y={15} style={{ fontSize: 14, fontWeight: 600, fill: t.ink }}>
                {r.lab.name}
              </text>
              <text x={barW} y={15} textAnchor="end" style={mono}>
                {r.people.length} people
              </text>
              {r.slices.map((s) => {
                const sx = x(acc)
                const sw = x(s.count)
                const cw = x(s.contractors)
                acc += s.count
                if (!s.count) return null
                return (
                  <g key={s.group}>
                    <rect x={sx} y={26} width={Math.max(0, sw - 1.5)} height={barH} fill={GROUP_FILL[s.group]} />
                    {cw > 0 && <rect x={sx + sw - cw} y={26} width={Math.max(0, cw - 1.5)} height={barH} fill="url(#ph-hatch)" />}
                    {sw >= 22 && (
                      <text x={sx + sw / 2} y={26 + barH / 2 + 4.5} textAnchor="middle" style={{ fontSize: 12.5, fontWeight: 700, fill: t.surface }}>
                        {s.count}
                      </text>
                    )}
                  </g>
                )
              })}
              <text x={barW + 14} y={26 + barH / 2 + 5} style={{ fontSize: 14, fontWeight: 700, fill: t.ink }}>
                {contractorPct(r.people)}%
              </text>
              <text x={barW + 52} y={26 + barH / 2 + 4.5} style={mono}>
                contractors
              </text>
            </g>
          )
        })}
      </svg>
      <table className="sr-only">
        <caption>Role composition by lab: people in each role group, of whom contractors</caption>
        <thead>
          <tr>
            <th scope="col">Lab</th>
            {ROLE_GROUPS.map((g) => (
              <th key={g} scope="col">
                {g}
              </th>
            ))}
            <th scope="col">Contractor share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lab.id}>
              <th scope="row">{r.lab.name}</th>
              {r.slices.map((s) => (
                <td key={s.group}>
                  {s.count}, {s.contractors} contractors
                </td>
              ))}
              <td>{contractorPct(r.people)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** Critical skills by lab: holders per cell, the estate total and a flag word. */
function SkillsCoverage() {
  const template = `170px repeat(${LABS.length + 1}, minmax(0, 1fr)) 124px`
  return (
    <div className="ph-skills">
      <div className="ph-skills__grid" aria-hidden="true">
        <div className="ph-skills__row ph-skills__row--head" style={{ gridTemplateColumns: template }}>
          <span />
          {LABS.map((l) => (
            <span key={l.id} className="ph-skills__head">
              <LabChip labId={l.id} size="sm" />
            </span>
          ))}
          <span className="ph-skills__head">Total</span>
          <span className="ph-skills__head">Depth</span>
        </div>
        {SKILL_COVERAGE.map((s) => (
          <div key={s.skill.id} className="ph-skills__row" style={{ gridTemplateColumns: template }}>
            <span className="ph-skills__name">{s.skill.name}</span>
            {LABS.map((l) => (
              <DepthCell key={l.id} count={s.byLab[l.id]} />
            ))}
            <DepthCell count={s.estate} />
            <span className="ph-skills__flag">
              <StatusPill band={FLAG_BAND[s.flag]} text={SKILL_FLAG_LABEL[s.flag]} />
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Critical skills coverage: people holding each skill by lab and across the estate</caption>
        <thead>
          <tr>
            <th scope="col">Skill</th>
            {LABS.map((l) => (
              <th key={l.id} scope="col">
                {l.name}
              </th>
            ))}
            <th scope="col">Estate</th>
            <th scope="col">Depth</th>
          </tr>
        </thead>
        <tbody>
          {SKILL_COVERAGE.map((s) => (
            <tr key={s.skill.id}>
              <th scope="row">{s.skill.name}</th>
              {LABS.map((l) => (
                <td key={l.id}>{s.byLab[l.id]}</td>
              ))}
              <td>{s.estate}</td>
              <td>{SKILL_FLAG_LABEL[s.flag]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PeopleStructurePage() {
  const k = THIN_SKILLS.length
  const headline = `${PEOPLE.length} people across four labs, ${contractorPct(PEOPLE)}% contractors; ${k} critical skill${k === 1 ? '' : 's'} rest${k === 1 ? 's' : ''} on one or two people.`
  const levels = [1, 2, 3].map((n) => LEADERS.filter((p) => p.leadLevel === n).length)
  return (
    <Page
      kicker="Structure and skills"
      title="Who we have and what they can do"
      headline={headline}
      note={`${VACANCIES} open vacancies (People domain) · synthetic headcount, leaders shown by role`}
      sources={PEOPLE_DOMAIN ? systemsOf([PEOPLE_DOMAIN]) : ['Workday', 'Skills register']}
      bodyStyle={{ gridTemplateRows: '300px 1fr', gridTemplateColumns: '1fr 1fr' }}
    >
      <HeaderLabLegend />
      <Card
        title="Leadership"
        right={<span className="ph-org__count">{levels[0]} platform lead · {levels[1]} lab leads · {levels[2]} team leads</span>}
        style={{ gridColumn: '1 / -1' }}
      >
        <LeadershipChart />
      </Card>
      <Card title="Role composition by lab">
        <RoleComposition />
      </Card>
      <Card title="Critical skills coverage">
        <SkillsCoverage />
      </Card>
    </Page>
  )
}
