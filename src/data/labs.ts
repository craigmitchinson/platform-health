import type { Lab, LabId, Team } from './types'

export const LABS: Lab[] = [
  { id: 'core', name: '24*7 Services', code: '24', lead: 'Gareth Lloyd' },
  { id: 'customer', name: 'Colleague Tooling', code: 'CT', lead: 'Tom Hadley' },
  { id: 'payments', name: 'Agentic Operations', code: 'AO', lead: 'Priya Raman' },
  { id: 'data', name: 'Data & Insights', code: 'DI', lead: 'Aisha Okafor' },
]

export const TEAMS: Team[] = [
  { id: 'portal', name: 'Customer Portal', labId: 'core', lead: 'Chloe Adams' },
  { id: 'claims', name: 'Claims Intake', labId: 'core', lead: 'Samir Khan' },
  { id: 'policy', name: 'Policy Servicing', labId: 'core', lead: 'Rhys Evans' },
  { id: 'digital', name: 'Adviser Workbench', labId: 'customer', lead: 'Leah Morgan' },
  { id: 'onboarding', name: 'Underwriting Desk', labId: 'customer', lead: 'Marcus Bell' },
  { id: 'contact', name: 'Contact Centre', labId: 'customer', lead: 'Owen Price' },
  { id: 'automation', name: 'Automation Platform', labId: 'payments', lead: 'Hannah Wright' },
  { id: 'agents', name: 'Agent Runtime', labId: 'payments', lead: 'Dev Patel' },
  { id: 'observability', name: 'Observability', labId: 'payments', lead: 'Sophie Grant' },
  { id: 'warehouse', name: 'Data Platform', labId: 'data', lead: 'Nadia Hussain' },
  { id: 'analytics', name: 'Actuarial Analytics', labId: 'data', lead: 'James Carter' },
  { id: 'reporting', name: 'Regulatory Reporting', labId: 'data', lead: 'Emily Shaw' },
]

const LAB_BY_ID = new Map(LABS.map((l) => [l.id, l]))

export const labById = (id: LabId) => LAB_BY_ID.get(id)
export const teamsInLab = (id: LabId) => TEAMS.filter((t) => t.labId === id)
