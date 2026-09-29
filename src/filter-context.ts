import { createContext, useContext } from 'react'
import type { LabId, TeamId } from './data/types'

/** The trend window: the last two, four or six quarters. */
export type Period = '2q' | '4q' | '6q'

export const PERIODS: { id: Period; label: string }[] = [
  { id: '2q', label: 'Last 2 quarters' },
  { id: '4q', label: 'Last 4 quarters' },
  { id: '6q', label: 'Last 6 quarters' },
]

export const DEFAULT_PERIOD: Period = '6q'

/** How many quarterly trend points the period keeps. */
export function periodPoints(period: Period): number {
  return period === '2q' ? 2 : period === '4q' ? 4 : 6
}

export interface FilterState {
  labId?: LabId
  teamId?: TeamId
  period: Period
  setLab: (labId?: LabId) => void
  setTeam: (teamId?: TeamId) => void
  setPeriod: (period: Period) => void
}

/** The report filters, supplied by App so every report filters the same way. */
export const FilterContext = createContext<FilterState>({
  period: DEFAULT_PERIOD,
  setLab: () => {},
  setTeam: () => {},
  setPeriod: () => {},
})

export const FilterProvider = FilterContext.Provider

export const useFilters = () => useContext(FilterContext)

/** The name of the report being rendered, for the page footer. */
export const ReportNameContext = createContext('')

export const useReportName = () => useContext(ReportNameContext)
