// When each source system last refreshed. The page footers read from here, so
// every page states how fresh its own figures are rather than one date for all.
import type { SourceRefresh } from './types'

/** The mock's "today", as an ISO date: past due, due soon and "today" in the footers. */
export const REFRESHED_ISO = '2026-09-28'
/** The time of day the mock was last loaded, on REFRESHED_ISO. */
const NOW = `${REFRESHED_ISO}T10:00:00Z`

const DAY_MS = 86_400_000

/** An ISO timestamp `daysAgo` days before REFRESHED_ISO, at a clock time. */
function at(daysAgo: number, time: string): string {
  const day = new Date(Date.parse(REFRESHED_ISO) - daysAgo * DAY_MS).toISOString().slice(0, 10)
  return `${day}T${time}:00Z`
}

/** Minutes before the mock's current time. */
const minutesAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString()

export const SOURCE_REFRESH: SourceRefresh[] = [
  { system: 'ServiceNow', at: at(0, '06:00') },
  { system: 'Dynatrace', at: minutesAgo(15) },
  { system: 'Jira', at: at(0, '07:00') },
  { system: 'Architecture register (SharePoint)', short: 'Architecture register', at: at(1, '18:00') },
  { system: 'Risk register (SharePoint)', short: 'Risk register', at: at(1, '18:00') },
  { system: 'DR register', at: at(1, '18:00') },
  { system: 'Intune / SCCM', at: at(0, '05:30') },
  { system: 'Qualys / Tenable', at: at(1, '22:00') },
  { system: 'GCP Billing export (BigQuery)', short: 'GCP billing', at: at(2, '04:00') },
  { system: 'Azure Cost Management', short: 'Azure cost', at: at(2, '04:00') },
  { system: 'GCP asset inventory + CMDB', short: 'GCP assets', at: at(0, '04:30') },
  { system: 'Workday', at: at(7, '05:00') },
  { system: 'Maturity self-assessment', short: 'Maturity assessment', at: '2026-06-30T17:00:00Z' },
  { system: 'Skills register', at: '2026-06-30T17:00:00Z' },
  { system: 'Audit and regulatory tracker', short: 'Audit tracker', at: at(3, '16:00') },
]

const BY_SYSTEM = new Map(SOURCE_REFRESH.map((s) => [s.system, s]))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "today 06:00", "yesterday 18:00", or "30 Jun" for anything older. */
export function formatRefresh(iso: string): string {
  const day = iso.slice(0, 10)
  const time = iso.slice(11, 16)
  const daysAgo = Math.round((Date.parse(REFRESHED_ISO) - Date.parse(day)) / DAY_MS)
  if (daysAgo === 0) return `today ${time}`
  if (daysAgo === 1) return `yesterday ${time}`
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
}

/** A system's last refresh, formatted, or undefined when the system is unknown. */
export const refreshFor = (system: string) => {
  const s = BY_SYSTEM.get(system)
  return s ? formatRefresh(s.at) : undefined
}

/** The footer line for a page: its systems, most recent first, at most `max`,
 *  with "+N more" for the rest. */
export function sourcesLine(systems: string[], max = 5): string {
  const known = Array.from(new Set(systems))
    .flatMap((name) => {
      const s = BY_SYSTEM.get(name)
      return s ? [s] : []
    })
    .sort((a, b) => b.at.localeCompare(a.at))
  if (!known.length) return ''
  const shown = known.slice(0, max).map((s) => `${s.short ?? s.system} ${formatRefresh(s.at)}`)
  const more = known.length - max
  return `Sources: ${shown.join(' · ')}${more > 0 ? ` · +${more} more` : ''}`
}
