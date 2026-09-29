import { createElement, type ReactElement } from 'react'
import { DOMAINS, domainById } from '../data/domains'
import type { DomainGroup, DomainId } from '../data/types'
import { ActionsPage } from './ActionsPage'
import { DomainPage } from './DomainPage'
import { LabsPage } from './LabsPage'
import { MovementPage } from './MovementPage'
import { OverviewPage } from './OverviewPage'
import { PeopleStructurePage } from './PeopleStructurePage'
import { SourcesPage } from './SourcesPage'

export interface ReportPage {
  id: string
  label: string
  /** Pages for proposed domains carry a "Proposed" suffix in the navigation. */
  proposed?: boolean
  render: () => ReactElement
}

/** One Power BI report in the workspace app, on its own semantic model, with its own pages. */
export interface Report {
  id: string
  name: string
  /** The semantic model behind the report. Sections in the Power BI service group
   * multiple reports; every report here stands alone, so none is used. */
  model: string
  pages: ReportPage[]
}

export interface PageRef {
  reportId: string
  pageId: string
}

function domainPage(id: DomainId): ReportPage {
  const d = domainById(id)
  return {
    id,
    label: d?.name ?? id,
    proposed: d?.proposed,
    render: () => createElement(DomainPage, { domainId: id }),
  }
}

/** A domain report's pages: its group's domains, in DOMAINS order. */
const domainPages = (group: DomainGroup) => DOMAINS.filter((d) => d.group === group).map((d) => domainPage(d.id))

export const REPORTS: Report[] = [
  {
    id: 'executive-summary',
    name: 'Executive summary',
    model: 'Platform health composite',
    pages: [
      { id: 'overview', label: 'Overview', render: () => createElement(OverviewPage) },
      { id: 'labs', label: 'Labs and teams', render: () => createElement(LabsPage) },
      { id: 'actions', label: 'Actions', render: () => createElement(ActionsPage) },
      { id: 'movement', label: 'Movement', render: () => createElement(MovementPage) },
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    model: 'ServiceNow and Dynatrace',
    pages: domainPages('operations'),
  },
  {
    id: 'risk-control',
    name: 'Risk and control',
    model: 'GRC registers and security tooling',
    pages: domainPages('risk'),
  },
  {
    id: 'architecture-estate',
    name: 'Architecture and estate',
    model: 'CMDB, architecture register and GCP',
    pages: domainPages('architecture'),
  },
  {
    id: 'delivery-people',
    name: 'Delivery and people',
    model: 'Jira and Workday',
    pages: domainPages('delivery').flatMap((pg) =>
      pg.id === 'people'
        ? [pg, { id: 'people-structure', label: 'Structure and skills', render: () => createElement(PeopleStructurePage) }]
        : [pg],
    ),
  },
  {
    id: 'data-sources',
    name: 'Data and sources',
    model: 'Lineage catalogue',
    pages: [{ id: 'lineage', label: 'Lineage', render: () => createElement(SourcesPage) }],
  },
]

/** Every page in reading order: present mode and the PPTX export walk this. */
export const PAGE_ORDER: PageRef[] = REPORTS.flatMap((r) =>
  r.pages.map((p) => ({ reportId: r.id, pageId: p.id })),
)

export const reportById = (id: string): Report =>
  REPORTS.find((r) => r.id === id) ?? REPORTS[0]

/** The report and page for a page id; page ids are unique across the app. */
export function pageById(id: string): { report: Report; page: ReportPage } {
  const ref = PAGE_ORDER.find((p) => p.pageId === id) ?? PAGE_ORDER[0]
  const report = reportById(ref.reportId)
  const page = report.pages.find((p) => p.id === ref.pageId) ?? report.pages[0]
  return { report, page }
}
