# Platform Health

## What this is

Platform Health is a mock of a Power BI workspace app: a scored view of the technology estate
across fifteen domains, drillable by lab and team. It is a fixed-dimension (1920x1080, 16:9) app,
navigated through a reports pane rather than a live BI tool. Every figure comes from a seeded
fixture rather than a warehouse, but it is built and laid out exactly as a report of this kind
would be, down to the slicers, the source readiness legend and the PPTX export. React + Vite +
TypeScript, no backend.
The app runs on port **5180**. It uses the app's design tokens and self-hosted fonts in
[src/vendor/ui/](src/vendor/ui/), so the repo is self-contained and clones anywhere.

The report answers one question for a technology leadership team: where is the platform healthy,
where is it under strain, and who owns fixing it? Every page respects the same lab and team
filter, so a reader can look at the whole estate, one lab, or drill to a single team and see every
number recompute underneath them.

## Pages

The app mirrors a Power BI workspace app. Reports sit at the top of the navigation, each on its own
semantic model with its own pages. Reports are split by source, so a heavy model such as ServiceNow
never slows a light one, and each can be refreshed, secured and published on its own. The
navigation pane shows each report's semantic model under its name. The Power BI service also groups
reports into sections; this mock has none, because every group here holds a single report. Sections
would be used only if a group came to hold more than one report. Every page carries a dashed LOGO
placeholder top right of its header, marking where a client wordmark would sit in Power BI.

1. **Executive summary** (model "Platform health composite"):
   - **Overview** ([src/pages/OverviewPage.tsx](src/pages/OverviewPage.tsx)): the estate
     scorecard, a domain heat map and the priority actions in one glance. The domain grid's last
     slot holds an Overview key card, giving the band thresholds and group tags so the heat map
     and domain cards need no repeated legend.
   - **Labs and teams** ([src/pages/LabsPage.tsx](src/pages/LabsPage.tsx)): health by lab and
     team, so each lead can see where their people need support. Beneath the lab cards sits a
     six-quarter grid, one row per lab and one column per core domain: each cell is a small
     sparkline with an area, an end dot in the band colour and the current score, tinted by this
     quarter's band. The team table and the movers card share the rest of the page.
   - **Actions** ([src/pages/ActionsPage.tsx](src/pages/ActionsPage.tsx)): every open action in
     scope as a table, sorted by severity then due date, with counts by domain. A summary row of
     tiles and a due-date bucket card sit above the table, giving open, due-soon, past-due and Act
     counts at a glance.
   - **Movement** ([src/pages/MovementPage.tsx](src/pages/MovementPage.tsx)): what moved and
     why. Each core domain's score at the start of the period and now as a dumbbell, worst mover
     first; a waterfall from the composite at the start of the period to now, one step per core
     domain; and every team in scope by its change in composite over the period, with a six-quarter
     sparkline column alongside each team's change. All three use the same period window.
2. **Operations** (model "ServiceNow and Dynatrace"): Stability, Incidents, Problems, Change,
   Maturity, Operability.
3. **Risk and control** (model "GRC registers and security tooling"): Risk, Security, Resilience,
   Governance.
4. **Architecture and estate** (model "CMDB, architecture register and GCP"): Architecture,
   Estate, Cost.
5. **Delivery and people** (model "Jira and Workday"): Delivery, People, then:
   - **Structure and skills** ([src/pages/PeopleStructurePage.tsx](src/pages/PeopleStructurePage.tsx)):
     who we have and what they can do. A leadership chart across the top (the platform lead, four
     lab leads with headcount and contractor share, twelve team leads with team headcount), shown by
     role and lab, never by name. Beneath it, role composition by lab as stacked bars with each role
     group's contractors as a hatched tail, and critical skills coverage: sixteen skills by lab and
     estate, each cell the number of holders, flagged Single-person, Thin or Covered. Estate-wide;
     the Lab and Team filters do not apply.
6. **Data and sources** (model "Lineage catalogue"):
   - **Lineage** ([src/pages/SourcesPage.tsx](src/pages/SourcesPage.tsx)): every metric in the
     estate, in one register, with its source system, ingestion mode, refresh cadence, owner and
     readiness, plus a short explanation of what each ingestion mode means for a Power BI report.
     The readiness legend, with the count of metrics at each readiness, sits in the header note.
     This is the only page that shows readiness.

Each domain report holds one domain group, and its pages follow the group's order in
[src/data/domains.ts](src/data/domains.ts). The Overview shows the groups too: each domain card
carries a small group tag, and the heat matrix has a group header row above its domain columns. The
Labs and teams table has the same group header row, and each domain page names its group in the
kicker.

Every domain page ([src/pages/DomainPage.tsx](src/pages/DomainPage.tsx)) is rendered from a single
generic component driven by [src/data/domains.ts](src/data/domains.ts). Each shows the domain's
metrics as KPI tiles with target, trend and band; which teams in scope carry the worst score; a
heat of every team in scope by the domain's scored metrics, worst team first, each cell the team's
value tinted and striped in the band its metric score falls in; a six-quarter trend chart with plain-English read-outs computed from the current filter; the open
actions for that domain; and the sources behind its figures. Cost and Operability are proposed
domains, marked "Proposed" in the navigation, with a note that their data is not yet sourced.

## Domains and metrics

Domains sit in four groups, one per domain report, and are listed in that order everywhere:
the Overview cards, the heat matrix and team table columns, the navigation and the exports.

| Group | Domain | Metrics | Why it matters |
| --- | --- | --- | --- |
| Operations | Stability | Open SNCs, median SNC age, repeat SNCs | Are services stable, and are we fixing causes rather than symptoms? |
| Operations | Incidents | P1 and P2 incidents (90 days), major incidents (90 days), mean time to restore, repeat incidents, open incidents over 5 days | Are incidents under control and shrinking? |
| Operations | Problems | Open problems, RCAs overdue, known error backlog, median problem age, incidents linked to a problem | Are we removing causes, not just symptoms? |
| Operations | Change | Failed changes, change success rate, releases per month, emergency changes, change lead time | Can we change safely and often? |
| Operations | Maturity | Overall maturity, triage and on-call, incident management, technical recovery, resolution and problem management, runbook coverage, mean time to acknowledge | How mature is each team's incident and service management practice? |
| Operations | Operability (proposed) | SLO attainment, monitoring coverage, actionable alerts | Do we know our services are healthy before our customers tell us? |
| Risk and control | Risk | BRAMs, open tech risks, net new risks | How much open technology risk do we hold, and is it rising? |
| Risk and control | Security | Critical/high vulnerabilities, patch compliance, overdue critical findings | Are we exposed, and are we closing exposure inside policy? |
| Risk and control | Resilience | DR compliance, resilience actions open, control health | Could we recover our important business services within tolerance? |
| Risk and control | Governance | Audit actions, regulatory actions, overdue actions | Are we meeting our commitments to audit and the regulator? |
| Architecture and estate | Architecture | Tech debt backlog, architecture exceptions, strategic alignment | Is the estate converging on the target architecture, or drifting from it? |
| Architecture and estate | Estate | Applications (context), infra footprint, currency, cloud migration, end of support within 12 months | What do we run, and how current and cloud-ready is it? |
| Architecture and estate | Cost (proposed) | Run cost vs budget, cloud spend change, orphaned spend | Are we spending what we planned, and is any of it wasted? |
| Delivery and people | Delivery | Milestones due (context), roadmap health, commitments at risk | Will we deliver what we have committed to this quarter? |
| Delivery and people | People | Vacancies, critical skills risks, contractor dependency | Do we have the people and skills to run and change the platform? |

Cost is proposed because its billing feeds (GCP Billing export, Azure Cost Management) are still
aspirational, so run cost and spend trend cannot yet be trusted. Operability is proposed because its
Dynatrace SLO and coverage feeds are only partial, so service-level attainment is not yet measured
consistently enough to score.

Metrics marked "context" in [src/data/domains.ts](src/data/domains.ts) (applications, milestones)
are shown for information but excluded from scoring, because a count alone says nothing about
whether it is good or bad.

Thirteen domains are core and count towards the composite; Cost and Operability are proposed. In
the fixture, incident figures follow each team's stability and problem figures follow its service
maturity, so the drill-downs tell one story.

Maturity levels run from 1 to 5, shown as, for example, "3.4 of 5", with a target of 4.
Overall maturity is the mean of the four capability levels (triage and on-call, incident
management, technical recovery, resolution and problem management), never assessed on its own.

## Labs and teams

Four labs, three teams each. Each lab has a two-character code shown on a coloured chip wherever a
lab appears beside a team (`LabChip` in [src/components/primitives.tsx](src/components/primitives.tsx)).
The chip always carries its code and the lab name as a title and sr-only text, so colour is never
the only cue. Tables show the lab as a chip alone, never chip and name, and give the space to the
team column. Pages with chips (Overview, Labs, Actions, Movement and every domain page) carry the
`LabLegend` at the top right of the header, through `HeaderLabLegend` in primitives.tsx.

| Lab | Code | Colour token | Teams |
| --- | --- | --- | --- |
| 24*7 Services | 24 | `--c-lab-1` | Customer Portal, Claims Intake, Policy Servicing |
| Colleague Tooling | CT | `--c-lab-2` | Adviser Workbench, Underwriting Desk, Contact Centre |
| Agentic Operations | AO | `--c-lab-3` | Automation Platform, Agent Runtime, Observability |
| Data & Insights | DI | `--c-lab-4` | Data Platform, Actuarial Analytics, Regulatory Reporting |

The same four colours sit at fixed indices in the Power BI theme; see
[powerbi/theme/README.md](powerbi/theme/README.md).

## Health model

Every metric has a target and a direction (`lower` or `higher` is good). A team's value at or
better than target scores 100; the score falls linearly to 0 across the metric's span, the
distance past target at which it is fully unhealthy (`spanFor` in
[src/data/health.ts](src/data/health.ts)). Metrics carrying a `note` are context only and never
scored (`isScored`).

A domain's score is the mean of its scored metrics for one set of samples (`domainScore`). A
team's score is the mean of its domain scores, across every scored, non-proposed domain
(`teamScore`); a lab's score is the mean of its teams' scores (`labScore`); the estate's score is
the mean across every team (`estateScore`). Cost and Operability are proposed and never count
towards a composite score until they are sourced.

Bands are fixed thresholds on the 0–100 score (`bandFor`): 80 and above is **Healthy**, 60 to 79
is **Watch**, below 60 is **Act**. The band's colour always sits beside its word. No state on any
page is colour-only.

Values that sum across teams (open counts, for example) scale their target and span with the
number of teams in scope; values that average (rates and percentages) do not (`targetFor`,
`aggregateMetrics`). This is why a domain page's KPI tiles recompute cleanly whether the reader has
selected the whole estate, one lab or a single team.

## Narrative rules

Every headline and read-out sentence on every page is generated by a fixed rule applied to the
current filter, never authored prose, so each could be reproduced by a DAX text measure or a Power
BI Smart Narrative bound to the same fields.

- **Overview headline**: "{n} of {domains} domains healthy across {scope}." followed by, when a
  team needs action, "{count} team(s) need action, led by {worst domain}", or otherwise "No team
  needs action; {worst domain} is the weakest domain."
- **Labs headline**: for a single team, "{Team} scores {score}, in the {band} band." For a single
  lab, "{Lab} scores {score}; {act} of {teams} teams sit in the Act band." For the estate, "{Best
  lab} is the healthiest lab; {lab} carries the most Act ratings.", or, when no team is in the Act
  band, "{Best lab} is the healthiest lab; no lab has a team in the Act band." (`labHeadline` in
  [src/pages/LabsPage.tsx](src/pages/LabsPage.tsx)).
- **Domain headline**: "{Domain} scores {score}, {band}. {Worst metric} is furthest from target at
  {value} against {target}; {best clause}." The best clause is "{best metric} is ahead of target"
  when it beats target, "{best metric} is on target" when it meets target exactly, and "{best
  metric} is closest to target at {value} against {target}" when it is short. It is dropped when
  the best and worst metric are the same. When the worst metric is inside target in total but some
  teams miss it: "{Domain} scores {score}, {band}. {Worst metric} is inside target in total, but
  not for every team; {best clause}." Only when the worst metric scores 100 for every team:
  "{Domain} scores {score}, {band}. Every metric is on or ahead of target." With no scored
  measure: "No measure in {Domain} is scored yet."
- **Movement headline**: "The composite moved {signed change} to {composite now} over the last
  {N} quarters; {domain} worsened most ({signed change}), {domain} moved least." N is the selected
  period. "Worsened" becomes "improved" when the largest move is a rise.
  The composite change is the scope composite now less the composite N minus 1 quarters back.
  Most and least are the core domains with the largest and smallest absolute change in score over
  the same window; a tie goes to the earlier domain.
- **Sources headline**: "{live} of {total} metrics are live today; {partial} are partial and
  {aspirational} are aspirational. Plan for all of them."
- **Footer sources line**: "Sources: {system} {last refresh} · ..." for the page's source systems,
  most recent refresh first, at most five, then "+{n} more" for the rest. The last refresh reads
  "today 06:00", "yesterday 18:00", or a day and short month ("30 Jun") for anything older
  (`sourcesLine` in [src/data/sourceRefresh.ts](src/data/sourceRefresh.ts)).
- **Read-outs** (domain page trend card): the first names the worst-scoring metric and its gap to
  target, or confirms everything is inside target; the second compares teams in scope, either the
  concentration of a summed metric or the range of an averaged one, or the scope's score against
  the estate average for a single team; the third states whether the domain's trend is improving,
  declining or flat over the selected period, from the change in its scored trend line.

In Power BI these sentences become DAX text measures (for example `worst = TOPN(1, ...)`) or, where
the phrasing needs to vary more freely, a Smart Narrative visual with its dynamic values pinned to
the same measures, never typed text.

Words for movement. A change in a domain or team health score always reads "better", "worse" or "held" after the signed value, never "up", "down" or "flat": "−3 worse", "+2 better", "0 held". Colour follows the word: worse amber, better emerald, held muted. Charts of score change carry the line "Change in health score, 0 to 100. Up is better." Metric deltas on KPI tiles keep their arrow and direction-aware colour and add "better" or "worse" after the value, since for a metric such as open incidents a fall is the improvement.

## Data and readiness

Every metric declares a `Source`: a system, an ingestion mode, a refresh cadence, an owner and a
readiness. The five ingestion modes, from a Power BI point of view:

- **SQL direct query**: DirectQuery against the operational database, refreshed on the source
  system's own schedule.
- **Semantic model**: import through a Power BI semantic model, refreshed via the on-premises
  data gateway.
- **Spreadsheet**: import from a maintained spreadsheet; only as fresh as its last manual update.
- **CSV drop**: import from a scheduled CSV drop, a lightweight bridge until an API exists.
- **API**: import, or DirectQuery where supported, via a published API, refreshed on its own
  cadence.

Readiness is the honest part of the mock: **Live** means the source can feed the report today,
**Partial** means it needs manual work first, and **Aspirational** means there is no feed yet and
the number is illustrative. The Lineage page shows this plainly, rather than pretending every
figure is equally trustworthy. It is the only page that shows readiness; the other pages say how
fresh their figures are instead.

Footer rule. Every page footer reads "Platform Health · {Report} · {Page}" on the left and, on the
right, the source systems behind that page with their last refresh, most recent first, at most
five, then "+N more". Overview, Labs and teams, Actions and Movement list the systems behind the
core domains; a domain page lists the systems behind its own metrics; Lineage lists every system.
For example, "Sources: Dynatrace today 09:45 · Jira today 07:00 · ServiceNow today 06:00 · Intune /
SCCM today 05:30 · GCP assets today 04:30 · +8 more" on the Overview, and "Sources: ServiceNow today
06:00" on Stability. The last refresh per system is a fixture in
[src/data/sourceRefresh.ts](src/data/sourceRefresh.ts), stored as timestamps on the same clock as
`REFRESHED_ISO`. Long system names use a short form there, such as "GCP billing".

The source systems behind the metrics:

| Source | Feeds | Mode | Readiness |
| --- | --- | --- | --- |
| ServiceNow | SNCs, incidents, problems, failed changes, change success, emergency changes and lead time, applications and currency from the CMDB | SQL | Live |
| ServiceNow CMDB | End of support within 12 months | SQL | Partial |
| ServiceNow knowledge | Runbook coverage | SQL | Partial |
| Dynatrace | MTTR and MTTA | API | Live |
| Dynatrace | SLO attainment, monitoring coverage, actionable alerts | API | Partial |
| Jira | Tech debt backlog, releases, milestones, roadmap health, commitments at risk | API | Live |
| Architecture register (SharePoint list) | Architecture exceptions, strategic alignment | Spreadsheet | Partial |
| Risk register (SharePoint list) | BRAMs, tech risks, net new risks, control health | Spreadsheet | Partial |
| Qualys / Tenable | Vulnerabilities, overdue critical findings | CSV | Live |
| Intune / SCCM | Patch compliance | SQL | Live |
| GCP asset inventory + CMDB | Infra footprint, cloud migration | API | Partial |
| Maturity self-assessment | The five maturity levels, refreshed quarterly | Spreadsheet | Partial |
| Workday | Vacancies, contractor dependency | Semantic | Partial |
| Skills register | Critical skills risks | Spreadsheet | Aspirational |
| Audit and regulatory tracker | Audit, regulatory and overdue actions | Spreadsheet | Partial |
| DR register | DR compliance, resilience actions | Spreadsheet | Partial |
| GCP Billing export to BigQuery | Cloud spend change, orphaned spend | API | Aspirational |
| Azure Cost Management | Run cost vs budget for the VDI and VM estate; Azure hosts VDIs and VMs only | API | Aspirational |

Control health comes from the risk register rather than ServiceNow GRC.

## Architecture

- **Data** ([src/data/](src/data/)): pure fixtures and types. `types.ts` defines the shapes;
  `domains.ts` holds the fifteen domains, their metrics and sources; `labs.ts` the labs and teams;
  `metrics.ts` a seeded, deterministic generator for every team's metric samples (so the numbers
  vary but are identical on every load); `people.ts` 340 synthetic people (role, grade, lab, team,
  permanent or contractor, one to four of sixteen critical skills) on its own seed, with headcount,
  role composition and skills coverage derived from them; each team's contractor share follows its
  Contractor dependency metric; `actions.ts` the open actions; `health.ts` the pure
  scoring functions every page reads from; `sourceRefresh.ts` each source system's last refresh
  and the footer line built from it.
- **Reports** ([src/pages/](src/pages/)): one file per page. `index.ts` holds the registry:
  `REPORTS` (each report has an id, a name, its semantic model and its pages), `PAGE_ORDER` (every
  page in reading order as report and page ids), and the lookups `pageById` and `reportById`. Page
  ids are unique across the app. One generic
  `DomainPage` serves all fifteen domain pages. The registry drives the navigation pane, present
  mode order and the PPTX export order. The `model` field is a build note for the Power BI author;
  app navigation items carry a name only, so it is never shown in the navigation pane.
- **Components** ([src/components/](src/components/)): `Page.tsx` is the fixed 1920x1080 report
  page every report shares: kicker, one `h1`, headline, an optional note, a grid body and a footer
  that reads like a Power BI report footer (report and page name, then the page's source systems
  and when each last refreshed, from its `sources` prop).
  `primitives.tsx` holds the shared visual vocabulary: `Card`, `KpiTile`, `Sparkline`, `BarList`,
  `HeatCell`, `MetricHeat` and `StatusPill`, so a band or a readiness always renders the same way wherever it
  appears.
- **Theme** ([src/theme.ts](src/theme.ts), [src/theme-context.ts](src/theme-context.ts)): every
  colour, font and spacing token lives in one file, referencing the design tokens' `var(--c-*)` variables
  rather than a literal, with a light and dark variant supplied through context. `chrome` holds
  the pane and bar sizes of the app frame.
- **Filters** ([src/filter-context.ts](src/filter-context.ts)): lab, team and period, supplied by
  `App` so every report filters the same way. Lab and team persist across reports, which the
  filter pane shows under "Filters on all pages". The period sets the trend window
  (`periodPoints` returns 2, 4 or 6 quarters).
- **Shell** ([src/App.tsx](src/App.tsx)): the Power BI service app chrome on a fixed 1920x1080
  app frame, fitted to the window. Controls the mock does not implement are real buttons marked
  `aria-disabled` and titled "Not in mock".
  - **Global bar** (40px): app launcher and the app name, a search box, then notifications,
    settings, download, help, feedback and the account avatar.
  - **Action bar** (36px): the navigation collapse chevron; File, Share, Export, Chat in Teams,
    Get insights, Subscribe to report and More options on the left; refresh, bookmarks, View,
    reset to default, comments, favourite, edit and report details on the right. The working
    controls sit behind real menus that close on Escape: Export holds the PowerPoint export,
    View holds full screen (present mode), the light or dark theme and Spotlight, and More
    options holds About this mock.
  - **Navigation pane** (240px): Power BI app navigation on the brand fill. A "PH" workspace
    mark and the app name head the pane. Reports sit at the top level, each row showing its
    name and a chevron that expands its pages, so any report can be expanded or collapsed
    without leaving the current page; the current report's pages are expanded by default. The
    current page sits on a darker full-width band in bold. Go back sits at the foot. It
    collapses to a 48px rail of the mark and two-letter report abbreviations.
  - **Filter pane**: collapsed by default to a 32px strip labelled Filters. Expanded (280px) it
    holds filter cards for lab, team and period, and Clear filters.
  - **Status strip** (24px): under the canvas, a zoom readout of the current page scale and an
    inert Fit to page control. As in a published app, the report's own page tabs are hidden
    because the pages are in the navigation.
  - **Canvas**: the report page sits on a grey surround, letterboxed and scaled to whatever the
    bars and panes leave, less a 24px gutter. The scale is computed from the pane states and
    passed to CSS as a variable.
  - **Present mode** hides the chrome and shows the page at full size; arrow keys move between
    pages in reading order across every report, Escape exits. **Spotlight** lifts one `data-spot` block above a scrim. The
    **light/dark** mode is mirrored onto `<html data-theme>` so every `var(--c-*)` resolves to the
    active variant. **Export to PowerPoint** renders every page, in the same order, unscaled in an offscreen container,
    captures it at 2x with `html-to-image` and assembles a 16:9 deck with `pptxgenjs`, both
    lazy-loaded. Each slide carries "{Report} · {Page}" as its image alt text and speaker notes.

## Running

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # type-check + production build into dist/
npm run lint     # oxlint
```

## Licence

MIT; see [LICENSE](LICENSE).

## Publishing

Every figure in this repo is a seeded fixture; nothing here is real platform, incident or people
data, and no personal data is committed. The one machine-specific file is `powerbi/local.json`,
which holds your local CSV folder path for `npm run deneb:pbip`; it is git-ignored, so create it
yourself (see `powerbi/README.md`) rather than expecting one in a clone.

The page is centred on a neutral canvas and scaled to fit the viewport for on-screen viewing only.
The internal layout is always authored at 1920x1080, so a capture of the `.slide-frame` element at
`pixelRatio: 2` produces a clean 3840x2160 PNG.
