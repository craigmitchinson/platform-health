# Platform Health semantic model

A ready-made star schema and DAX measure set for building the Platform Health report in Power BI
Desktop. The CSVs are exported from the app's own fixtures, so every score, band, count and
headline the measures produce should match the mock page for page.

The measures are written to the app's rules but have not yet been run against a live model. Check
the figures against the mock (`npm run dev`) as you build.

## What is here

| File | What it is |
| --- | --- |
| `csv/` | One CSV per table, UTF-8, header row, ISO dates, no thousands separators. |
| `measures.dax` | Every measure, one block each, for a `_Measures` table, including the build measures the Deneb templates need (last section). The header also carries the Period and MovementStep table definitions. The Page table is written by `npm run deneb:pbip` from the app's pages (The Page table, below). |
| `relationships.md` | The relationships to create and the date table setting. |

Regenerate the CSVs and re-run the checks with:

```
npx tsx powerbi/scripts/export-model.ts
```

The script reads the files back and checks that every fact row joins to Team, Metric and Quarter,
and that every domain score at every quarter, for the estate, each lab and each team, equals the
app's `scopeDomainScore`. It fails if anything differs.

## The tables

| Table | Grain | Key |
| --- | --- | --- |
| Lab | One row per lab | LabKey |
| Team | One row per team, with its LabKey | TeamKey |
| Domain | One row per domain, in the app's grouped order (SortOrder). DomainGroup and DomainGroupName name the domain's group and report: operations, risk, architecture or delivery, and Operations, Risk and control, Architecture and estate or Delivery and people. IsCore is false for the two proposed domains, Cost and Operability | DomainKey |
| Metric | One row per metric, with its target, direction, aggregate and source | MetricKey |
| Quarter | Six quarters, Q2 2025 to Q3 2026. IsCurrent marks Q3 2026 | QuarterKey |
| MetricValue | Fact. One value per team, metric and quarter | TeamKey, MetricKey, QuarterKey |
| ScoreFact | Fact, computed at refresh by `export-model.ts`. One row per MetricValue row: Value, the team-grain Target and Span, Score (0 to 100, `scoreMetric` with one team), Band (healthy, watch or act) and IsScored. The score measures average ScoreFact[Score] instead of scoring each team inside nested iterators; see Performance in `../README.md` | TeamKey, MetricKey, QuarterKey |
| Action | One row per open action | ActionKey |
| Config | One row: refresh date and the band thresholds, 80 and 60 | none |
| Person | One row per synthetic person (340): Role, RoleGroup, Grade (1 to 5), LabKey, TeamKey, Employment (permanent or contractor), IsLead, LeadLevel (1 platform lead, 2 lab lead, 3 team lead, 0 everyone else) and ParentKey, the person they report to. LabName, LabCode, LabColour and UnitName (the team, lab or "Platform" a person sits in or leads) are carried on the row, because the platform lead and the four lab leads have no TeamKey | PersonKey |
| Skill | One row per critical skill (16), with SortOrder | SkillKey |
| PersonSkill | Bridge. One row per person and skill held, one to four per person | PersonKey, SkillKey |

Keys are the app's own ids, such as `ledger` or `openSncs`. Lab, Team and Metric also carry a
SortOrder column so ties and visual order follow the app.

## Loading the CSVs in Desktop

Either route works. The first is quicker; the second is easier to repoint table by table later.

**Folder connector.** Get data, Folder, and pick the `csv` folder. Choose Transform data. Filter
the Name column to one file, click Binary to expand it, promote headers, and rename the query to
the table name. Repeat for each file (duplicate the query and change the filter).

**One Text/CSV per table.** Get data, Text/CSV, and pick each file in turn. Set File origin to
65001: Unicode (UTF-8) so the curly apostrophe in the Domain questions survives.

In either case, check the column types in Power Query before loading:

- Whole number: every SortOrder, QuarterKey, ScoreFact[Score].
- Decimal number: MetricValue[Value], Metric[Target], ScoreFact[Value], ScoreFact[Target], ScoreFact[Span]. Values are exported at full precision; do
  not round them.
- True/False: Domain[IsCore], Metric[IsScored], ScoreFact[IsScored], Quarter[IsCurrent].
- Date: Quarter[QuarterStart], Action[DueDate], Config[RefreshDate].
- Text: everything else, including Metric[Note], which is blank for scored metrics.

Set the model's culture to English (United Kingdom) so formatted numbers read as in the app.

## Relationships

Create the thirteen relationships in `relationships.md`: all many to one, all single direction. ScoreFact joins
Team, Metric and Quarter exactly as MetricValue does; the two facts never filter each other. Person joins
Team on TeamKey, and PersonSkill joins Person and Skill; Person does not join Lab directly, as a second
path from Lab would make the model ambiguous.
Config, Period and MovementStep stay disconnected. Turn off Auto date/time and do not mark a date table; the
measures move between quarters by QuarterKey. Set the sort-by columns listed there.

## Calculated columns

Five name columns carry a dimension's name onto the table a visual's rows come from. Add them
after the relationships (Table tools, New column); `npm run deneb:pbip` writes them into the
project's TMDL.

| Column | Expression | Used where the rows are |
| --- | --- | --- |
| Action[DomainName] | `RELATED ( 'Domain'[DomainName] )` | Actions |
| Action[TeamName] | `RELATED ( 'Team'[TeamName] )` | Actions |
| Action[LabName] | `RELATED ( 'Lab'[LabName] )`, through Team | Actions |
| Team[LabName] | `RELATED ( 'Lab'[LabName] )` | Teams |
| Metric[DomainName] | `RELATED ( 'Domain'[DomainName] )` | Metrics |

Why: in Desktop, Domain, Team and Lab names taken from their own tables beside Action rows gave
23 actions x 12 teams x 4 labs x 13 domains = 14352 rows, because a measure that returned 0 kept
every combination. A visual whose rows are actions, teams or metrics takes its names from that
table. `npm run deneb:layout` fails on a Deneb visual whose row columns come from two tables,
other than the grids that cross a second axis on purpose (lab by domain, team by quarter, domain
by quarter, team by capability).

Action[DueDate] stays a date column: TMDL `dataType: dateTime`, typed `type date` in Power Query.
The actions timeline binds it directly.

## Measures

1. Home, Enter data, create an empty table called `_Measures` with one column, and load it.
2. For each block in `measures.dax`, New measure on `_Measures` and paste the block from its name
   to the end of its expression. The comment line above each block describes it and can be pasted
   too.
3. Add them in file order: later measures call earlier ones.
4. Once a measure exists, delete the placeholder column so `_Measures` shows as a measures table.

If you prefer to add them in one go, open DAX query view, write `DEFINE` and then each block as
`MEASURE '_Measures'[Name] = expression`, run it, and choose Update model with changes.

The blank rule: a measure returns BLANK when its base table has no rows in context, never 0. No
measure adds 0 or wraps itself in COALESCE, so Power BI drops rows where nothing is in scope.
Where a visual must show 0, it binds a Display build measure, such as `[Teams Healthy Display]`,
used only there. Text measures (names ending Headline, Read Out, Display or Formatted) may
coalesce their counts inside the text. `npm run deneb:pbip` fails on any other measure that breaks
the rule.

How the measures read context:

- **Scope** comes from slicers on Lab and Team. A single selected team wins over a lab.
- **Quarter**: with no quarter in context a measure reads the current quarter. With one quarter
  in context, for example Quarter[QuarterLabel] on a line chart axis, it reads that quarter. Every
  trend line in the mock is `[Score]` or `[Metric Value]` over Quarter[QuarterLabel].
- **Domain**: `[Score]` is the domain score with one domain in context and the composite
  otherwise, so one measure serves the domain pages, the heat matrix and the hero.
- **Metric**: `[Metric Value]`, `[Metric Target]`, `[Metric Score]` and `[Metric Band]` need one
  metric in context, as on a KPI tile or a matrix row.

## The Period table

The mock's period filter (last 2, 4 or 6 quarters) is a disconnected table. Modeling, New table,
and paste:

```
Period =
DATATABLE (
    "Quarters", INTEGER,
    "Period", STRING,
    { { 2, "Last 2 quarters" }, { 4, "Last 4 quarters" }, { 6, "Last 6 quarters" } }
)
```

Sort Period[Period] by Period[Quarters] and add it as a single-select slicer. `[Selected Quarters]`
reads it and defaults to 6. On trend visuals, add `[In Selected Period]` as a visual-level filter
set to "is 1". `[Score Delta over Period]`, `[Metric Delta over Period]` and `[Read Out 3]` use the
same window.

## The Page table

A disconnected calculated table, one row per report page: PageKey (the page id), Kicker, Title,
ReportName and SortOrder (page order, 1 to 21). `npm run deneb:pbip` writes it into the project as a
`DATATABLE` from `shared.pageTable` in `layout/manifest.json`, which `npm run deneb:layout` builds
from the app's pages. Domain pages read "<group> · <domain>" as the kicker and the domain name as
the title. Every page carries a locked, hidden page filter Page[PageKey] is its own id, so the
page-text block reads that page's row. Do not relate Page to any table.

To build it by hand, Modeling, New table:

```dax
Page =
DATATABLE (
    "PageKey", STRING,
    "Kicker", STRING,
    "Title", STRING,
    "ReportName", STRING,
    "SortOrder", INTEGER,
    {
        { "overview", "overview", "Where the platform stands today", "Executive summary", 1 },
        { "stability", "Operations · Stability", "Stability", "Operations", 5 }
        // one row per page; the generated Page.tmdl in pbip/ lists all twenty-one
    }
)
```

## The MovementStep table

The Movement page waterfall needs a start bar, one step per core domain and an end bar. The model
has no such rows, so MovementStep builds them. Modeling, New table, and paste:

```
MovementStep =
VAR Core =
    SELECTCOLUMNS (
        FILTER ( ALLNOBLANKROW ( Domain ), Domain[IsCore] = TRUE () ),
        "Step", Domain[SortOrder],
        "Label", Domain[DomainName],
        "Kind", "delta",
        "DomainKey", Domain[DomainKey]
    )
VAR EndStep = MAXX ( Core, [Step] ) + 1
RETURN
    UNION (
        ROW ( "Step", 0, "Label", "Period start", "Kind", "start", "DomainKey", BLANK () ),
        Core,
        ROW ( "Step", EndStep, "Label", "Now", "Kind", "end", "DomainKey", BLANK () )
    )
```

Sort MovementStep[Label] by MovementStep[Step]. Do not relate MovementStep to Domain: the start and
end rows have a blank DomainKey, which would give Domain a blank row that the table then reads, a
circular dependency. `[Step Value]` reads the DomainKey itself, so no relationship is needed.

`[Step Value]` gives the start composite, each domain's change over the period divided by the core
domain count, and the composite now. `[Step Running]` is the running total. The composite here is
the unrounded mean of core domain scores, as in the app, so the steps add up exactly.

## Mapping to real sources later

The CSVs stand in for live feeds. When a source is connected, replace that table's query and keep
the key it joins on. Most systems do not know the app's team ids, so add a small TeamSourceMap
table (source identifier to TeamKey) maintained by the Delivery Office and merge it in Power Query,
rather than renaming teams in each system.

| Source | Replaces | Join key to preserve |
| --- | --- | --- |
| ServiceNow | MetricValue rows for openSncs, sncAge, repeatSncs, failedChanges, changeSuccess, applications, currency, runbookCoverage | Assignment group or CMDB support group to TeamKey; the record's date to QuarterKey |
| Dynatrace | mttr, mtta, sloAttainment, monitoringCoverage, alertNoise | Management zone or `team` tag to TeamKey |
| Jira | techDebt, releases, milestones, roadmapHealth, commitmentsAtRisk | Project or component to TeamKey; sprint or resolution date to QuarterKey |
| SharePoint lists (architecture register, risk register, audit tracker, DR register, maturity self-assessment, skills register) | archExceptions, strategicAlignment, brams, techRisks, riskTrend, controlHealth, auditActions, regActions, overdueActions, drCompliance, resilienceActions, the five maturity levels, skillsRisks. Action rows can come from the same lists | A Team lookup column holding TeamKey; a Quarter column holding QuarterKey or a date |
| Intune and SCCM | patchCompliance | Device collection or owning service in the CMDB to TeamKey |
| Qualys or Tenable | vulns, criticalFindings | Asset tag or asset group to TeamKey |
| GCP billing export (BigQuery) | cloudSpendTrend, orphanedSpend, with GCP asset inventory for infraFootprint and cloudMigration | Project label `team` to TeamKey; usage month to QuarterKey |
| Azure Cost Management | runCostVsBudget | Subscription or resource group tag to TeamKey |
| Workday | vacancies, contractorDependency | Cost centre or supervisory organisation to TeamKey |

Whatever the source, land it in the MetricValue shape: TeamKey, MetricKey, QuarterKey, Value, one
row per team, metric and quarter. Lab, Team, Domain and Metric stay as maintained reference
tables, so a metric's target, direction, aggregate and readiness are changed in one place. Metric
readiness should move from partial or aspirational to live as each feed arrives, and the Sources
headline will follow.
