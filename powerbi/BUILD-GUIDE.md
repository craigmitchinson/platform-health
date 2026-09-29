# Platform Health: build guide

This guide rebuilds the Platform Health mock in Power BI Desktop, page by page and block by block. It follows `layout/manifest.json`, which holds every position, field and filter below in machine-readable form. Regenerate the manifest with `npm run deneb:layout`; the script fails if any template, column or measure it names does not exist.

Positions are in pixels on a 1920 by 1080 page, as x, y, width and height from the top-left corner. Type them into Format, General, Properties, Size and Position. Font sizes are given in points, converted from the app at 0.75.

## 0. Before you start

1. Install a current release of Power BI Desktop (monthly release from 2025 or later). Every block but the footer text is a Deneb visual, so Deneb is the one visual to add.
2. Install the fonts locally: Fraunces (headings), Inter (body) and JetBrains Mono (kickers and labels). Without them Power BI falls back to Georgia, Segoe UI and Consolas, which is acceptable.
3. Open File, Options and settings, Options, Preview features. Tick "Store reports using enhanced metadata format (PBIR)". Restart Desktop.
4. In a new report, open Get more visuals, AppSource, search "Deneb" and add it. Allow it for the organisation if prompted.
5. Keep this folder to hand: `model/`, `theme/`, `deneb/templates/` and `layout/manifest.json`.

## 1. Load the model

### Fast path: open the project

`pbip/PlatformHealth/PlatformHealth.pbip` already holds the model, the measures, the theme, all twenty-one pages and every block at its position. Open it instead of working through sections 1 to 4 by hand, then check the result against them. It has not been tested in Desktop, so treat the first open as a check. `README.md`, Project file, lists what was assumed and where to fix it.

1. Install Deneb (section 0, step 4) before you open the file.
2. Open `PlatformHealth.pbip`. Check the `CsvFolder` parameter (Transform data, Manage parameters) holds the full path of `model/csv`, then Refresh. To have the project arrive with that path set, create the git-ignored `powerbi/local.json` as `{ "csvFolder": "<absolute path to powerbi/model/csv>" }` and run `npm run deneb:pbip` first; `README.md`, Project file, explains.
3. If Deneb visuals show as "can't display this visual", check the Deneb GUID as the README describes.
4. Check the model against steps 3 to 14 below: column types, the seven relationships, sort-by columns, Auto date/time off, the Period, MovementStep and Page tables and the build measures in `_Measures`.
5. Check the spec params and title section 4 lists (the Actions page bar-list `unitLabel` and title); the project already carries them.
6. Compare each page with the mock (`npm run dev`) and with the figures in section 7.

Regenerate the project with `npm run deneb:pbip`. It overwrites edits made in Desktop.

**Desktop feedback.** The first open rejected the table name `Action` without quotes and the variable names `Value`, `Start`, `Rows` and `Open`. When you add or edit a measure, single-quote every table reference (`'Action'[DueDate]`) and start every variable name with an underscore (`VAR _Value`). `npm run deneb:pbip` fails on any measure that breaks either rule.

The second open showed every domain with the same score, because measures removed filters from the whole `'Metric'` table, and with it the domain filter. Never remove filters from a whole dimension table (`'Metric'`, `'Domain'`, `'Team'`, `'Lab'`); remove the column you mean, as in `REMOVEFILTERS ( 'Metric'[MetricKey], 'Metric'[MetricName] )`. The same open led to layout changes: Deneb visuals have their Power BI title, background, border and padding off; the hero is 220px and the KPI tiles 180px, so the rows below move down; headlines and read-outs are Card (new) visuals bound to their measures. The fifth open made every native visual's background and border explicit, sized text and tables so nothing scrolls except the Lineage and Overview actions tables, replaced the footer's readiness text with the readiness-legend Deneb visual, and rebuilt the Labs matrix as teams by domain with [Team Domain Score] and totals off. Where a position or size in this guide differs, `layout/manifest.json` is current. powerbi/README.md, Desktop feedback, lists the details.

The fourth open showed "14352 open actions" on the Actions timeline and every team against every lab in the Movement teams table. Names came from Domain, Team and Lab beside Action or Team rows, and measures returned 0 instead of blank, so Power BI kept every combination. Two rules follow. Where a visual's rows are actions, teams or metrics, take names from that table's calculated columns: Action[DomainName], Action[TeamName], Action[LabName], Team[LabName] and Metric[DomainName] (`model/README.md`, Calculated columns). And a measure returns blank, never 0, when nothing is in scope; where a visual must show 0, bind the measure's Display build measure. `npm run deneb:pbip` fails on a measure that adds 0 or uses COALESCE, except text measures, and `npm run deneb:layout` fails on a Deneb visual whose row columns come from two tables.

### By hand

Build one semantic model and point all six reports at it. The model names in the manifest (for example "ServiceNow and Dynatrace") are where each report will go when real sources land; see section 6.

1. Get data, Folder, pick `model/csv`, choose Transform data.
2. For each of the eight files (Action, Config, Domain, Lab, Metric, MetricValue, Quarter, Team): filter Name to that file, expand Binary, Use first row as headers, rename the query to the table name.
3. Set column types as listed in `model/README.md` (Loading the CSVs). Set File origin to 65001 UTF-8.
4. Close and apply.
5. File, Options, Current file, Data load: turn off Auto date/time.
6. File, Options, Current file, Regional settings: English (United Kingdom).
7. Model view: create the seven relationships in `model/relationships.md`. All many to one, all single direction. Then add the five calculated columns in `model/README.md` (Calculated columns): Action[DomainName], Action[TeamName], Action[LabName], Team[LabName] and Metric[DomainName].
8. Set the sort-by columns in `model/relationships.md` (QuarterLabel by QuarterKey, DomainName, LabName, TeamName and MetricName by SortOrder).
9. Home, Enter data: a table named `_Measures` with one column. Load it.
10. Modeling, New table: paste the Period and MovementStep tables from `model/README.md`. Sort Period[Period] by Period[Quarters] and MovementStep[Label] by MovementStep[Step]. Leave MovementStep unrelated; a relationship to Domain makes it circular.
11. Open DAX query view. Paste `DEFINE`, then each block of `model/measures.dax` as `MEASURE '_Measures'[Name] = expression`, in file order, build measures included. Run, then Update model with changes.
12. Put the measures under the Build measures heading of `measures.dax` (next step list) in a display folder called `Build measures`.
13. Do not mark Quarter, or any table, as a date table. The measures move between quarters by QuarterKey; `model/relationships.md` explains why.
14. Delete the placeholder column in `_Measures`.

### Build measures

The Deneb templates expect a few fields that `measures.dax` does not provide: six quarterly points per row, lower-case band words and counts that show 0. Each is a thin wrapper over a measure or column already in the model. Put them in `_Measures` in a display folder called `Build measures`. The full DAX for each is in `model/measures.dax`, in the last section, Build measures; `layout/manifest.json` lists their names under `shared.buildMeasures`.

| Build measure | Wraps | What it returns |
| --- | --- | --- |
| Score Q1 to Score Q5 | [Score] | [Score] five to one quarters before the current one |
| Metric Value Q1 to Metric Value Q5 | [Metric Value] | [Metric Value] five to one quarters back |
| Band Key | [Band] | `LOWER ( [Band] )` |
| Metric Band Key | [Metric Band] | `LOWER ( [Metric Band] )`; unscored metrics read "context" |
| Is Proposed | Domain[IsCore] | `SELECTEDVALUE ( Domain[IsCore] ) == FALSE ()` |
| Driver Label | [Worst Metric Key] | Short name of the weakest scored metric |
| Driver Value Formatted | [Metric Value Formatted] | Its value with unit |
| Driver Target Formatted | [Metric Target Formatted] | Its target with unit |
| Team Rank | [Composite] | Rank by composite at the quarter in context, 1 highest |
| Days From Refresh | Config[RefreshDate] | Days from the refresh date to the due date |
| Mode Label | Metric[IngestionMode] | Full mode name, blank where no metric exists |
| Worst Readiness | Metric[Readiness] | Least ready source among the metrics in context |
| Live Metrics, Partial Metrics, Aspirational Metrics | Metric[Readiness] | Count of metrics at that readiness |
| Movement Headline | [Score Delta over Period] | The Movement page headline |
| Score Period Start | [Score] | [Score] at the first quarter of the period |
| Composite Period Start | [Composite] | The composite at the first quarter of the period |
| Band Movement | [Band] | "Watch → Healthy", or "Healthy, held" when the band did not change |
| Domains Healthy Display, Domains Watch Display, Domains Act Display | [Domains Healthy], [Domains Watch], [Domains Act] | The count, or 0 where the base measure is blank. Overview hero only |
| Teams Healthy Display, Teams Watch Display, Teams Needing Action Display | [Teams Healthy], [Teams Watch], [Teams Needing Action] | The count, or 0 where teams are in scope and none match; blank where no team is. Hero and lab cards only |

The q6 point of every sparkline is the base measure itself ([Score] or [Metric Value]).

## 2. Apply the theme

1. View, Themes, Browse for themes.
2. Pick `theme/platform-health.theme.json`.
3. Check: visuals turn white with a pale grey border and an 18px radius, and the page turns the warm paper colour.

The theme names used below resolve as follows. The manifest carries the same table under `shared.themeNames`.

| Name | Hex | Use |
| --- | --- | --- |
| paper | #F2F0EA | Page background |
| surface | #FFFFFF | Visual background |
| line | #D6D9D2 | Visual border, rules |
| ink | #0F4D43 | Main text |
| brand | #0F4D43 | Bars, lines |
| brandMid | #2A6A5F | Headline text |
| muted | #5F6E69 | Kickers, secondary text |
| panel | #DCE8E0 | Filter pane, aspirational fill |
| good-fill | #DDF0E8 | Healthy and live fill |
| warn-fill | #F5EAD6 | Watch and partial fill |
| bad-fill | #F3E0DA | Act fill |

| Type size | px | pt |
| --- | --- | --- |
| pageTitle | 44 | 33 |
| headline | 24 | 18 |
| kpiValue | 40 | 30 |
| body | 15 | 11.5 |
| kicker | 14 | 10.5 |
| meta | 13.5 | 10 |
| chip | 12.5 | 9.5 |

## 3. Report settings

1. Format page, Canvas settings: Type Custom, 1920 by 1080.
2. Canvas background: paper, 0% transparency (the theme sets it; check it).
3. View, Page view: Fit to page.
4. Filter pane, report level (Filters on all pages): add Lab[LabName] and Team[TeamName], Basic filtering. Leave both empty.
5. Filter pane, page level: add Period[Period] only on Overview, Labs and teams, Movement and the fifteen domain pages. Basic filtering, Require single selection on, default Last 6 quarters.
6. Filter pane, page level on each domain page: Domain[DomainKey] is the page's key. Lock and hide it.
7. Leave the filter pane visible in reading view; it is the app's filter pane.
8. Page names: use the display names below. Page tabs are hidden in the published app (section 5).

## 4. Page by page

Every block on every page is a Deneb visual, the footer included. There are no native tables, matrices or cards. Positions and fields below come from `layout/manifest.json`; regenerate both with `npm run deneb:layout` after a change.

### How to add a block

1. Insert the Deneb visual. Set its position and size.
2. Drag the fields in the block's mapping table into Values, in the order given. Where a field says "via", drag the build measure, not the base. Where it says "summarised as Minimum", set the column's summarisation in the well to Minimum.
3. Open the visual's editor, choose Import, pick `deneb/templates/<template>.deneb.json`.
4. Map each placeholder to the field of the same name in the table. Optional fields (labCode, labColour) can stay unmapped where the block does not list them. Create.
5. Where the block sets a spec param or title, edit that param's value or the spec's `title.text` in the Specification pane and apply.
6. Format pane, Deneb settings: turn on Enable tooltip handler. Turn on Enable cross-filtering where the template supports it, with selection mode Advanced.
7. Format pane, General: title, subtitle, background, border and shadow off, padding 0. The template draws its own card and title.

**Every page has** these blocks. Only the page row and the headline measure change.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| header | Deneb, page-text | 48 | 48 | 1284 | 140 |
| lab-legend | Deneb, lab-legend | 1352 | 48 | 520 | 140 |
| footer | Deneb, page-footer | 48 | 996 | 1824 | 36 |
| legend | Deneb, readiness-legend | 1352 | 48 | 520 | 140 |

The lab-legend sits beside the header on every page but Lineage, which puts readiness-legend in the same 520px slot. The footer is page-footer, a Deneb visual, on every page; its bottom edge sits on the 48px page margin.

**header: page-text.** The kicker, title and headline in one block.

| Template field | Drag in |
| --- | --- |
| kicker | Page[Kicker] |
| title | Page[Title] |
| headline | The page's headline measure, listed per page below |

The Page table is disconnected and holds one row per page (model/README.md, The Page table). Each page carries a page-level filter Page[PageKey] is the page id, locked and hidden, so the block reads that page's row. Power BI visual title, background, border and padding off. Kicker, title and headline in one block. Page[Kicker] and Page[Title] come from the disconnected Page table, which the page-level Page[PageKey] filter cuts to this page's row; the headline is [Overview Headline], so it follows the filters. The template wraps the headline to two lines. This is the page's one heading.

**footer: page-footer, "Footer".**

| Template field | Drag in |
| --- | --- |
| left | [Page Footer Left] |
| sources | [Page Sources Refreshed] |

Power BI visual title, background, border and padding off. Power BI visual title, background, border and padding off. A 1px line-coloured rule along the top; on the left "Platform Health · Executive summary · <page>" from [Page Footer Left] (the Page table's ReportName and PageName), on the right [Page Sources Refreshed]: the source systems behind the page's metrics, the page's domain or every core domain, most recently refreshed first against Config[RefreshDate] (28 September 2026), five then "+N more".

**lab-legend: lab-legend, "Lab legend".**

| Template field | Drag in |
| --- | --- |
| labId | Lab[LabKey] |
| lab | Lab[LabName] |
| labCode | Lab[LabCode] |
| labColour | Lab[LabColour] |
| sortOrder | Lab[SortOrder] |

Power BI visual title, background, border and padding off. Power BI visual title, background, border and padding off. The four lab chips with their names, right-aligned along the top of the header row's right-hand slot, beside the page-text block; the block is the header's height so the body starts one gap below it. Tables on this page show the lab as a chip alone, so this row names them. With a lab chosen in the Lab filter only that lab is drawn.

**legend: readiness-legend.** Drag [Selected Quarters] in as `quarters`; it only gives Deneb a row. The template draws the three pills (Live, Partial, Aspirational).

### Report 1: Executive summary

#### Page: Overview

Page row: kicker "Executive summary · Overview", title "Where the platform stands today". Headline [Overview Headline]. Page filters: Page[PageKey] is overview; Period[Period] is Last 6 quarters.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| hero | Deneb, overview-hero | 48 | 208 | 1824 | 220 |
| domains | Deneb, domain-cards | 48 | 448 | 1824 | 342 |
| key | Deneb, overview-key | 1650 | 648 | 216 | 142 |
| heat | Deneb, heat-matrix | 48 | 810 | 1020 | 172 |
| week | Deneb, actions-list | 1088 | 810 | 784 | 172 |

**hero: overview-hero, "Composite health".**

| Template field | Drag in |
| --- | --- |
| scope | [Scope Name] |
| composite | [Composite] |
| healthyDomains | via Domains Healthy Display |
| watchDomains | via Domains Watch Display |
| actDomains | via Domains Act Display |
| coreDomains | [Core Domains] |
| teamsNeedingAction | via Teams Needing Action Display |
| worstDomain | [Worst Domain] |
| q1 | via Score Q1 |
| q2 | via Score Q2 |
| q3 | via Score Q3 |
| q4 | via Score Q4 |
| q5 | via Score Q5 |
| q6 | [Score] |

Power BI visual title, background, border and padding off. Power BI visual title, background, border and padding off. Every field is a measure, so the visual receives one row for the scope set by the Lab and Team filters. The template also prints the Overview headline beside the Domain mix bar; the page header above repeats it, as the brief keeps both. The block takes the template's designed 220px (the app band is 190px); the heat and actions row gives up the 30px.

**domains: domain-cards, "Domains".**

| Template field | Drag in |
| --- | --- |
| domainId | Domain[DomainKey] |
| domain | Domain[DomainName] |
| proposed | via Is Proposed |
| score | [Score] |
| band | via Band Key |
| driverLabel | via Driver Label |
| driverValueFormatted | via Driver Value Formatted |
| driverTargetFormatted | via Driver Target Formatted |
| q1 | via Score Q1 |
| q2 | via Score Q2 |
| q3 | via Score Q3 |
| q4 | via Score Q4 |
| q5 | via Score Q5 |
| q6 | [Score] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Eight columns by two rows, 15 cards; the template draws each card, so the visual has no background or border. The sixteenth cell holds the overview-key block. Sort by Domain[DomainName] (sorted by Domain[SortOrder], the grouped order).

**key: overview-key, "Key".**

| Template field | Drag in |
| --- | --- |
| quarters | [Selected Quarters] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The band thresholds, the four group tags and the Proposed tag, in the domain grid's empty sixteenth cell (216x142). The content is constant; [Selected Quarters] is bound only so Deneb has a row to render. Place it after the domain-cards block so it sits on top.

**heat: heat-matrix, "Heat by lab".**

| Template field | Drag in |
| --- | --- |
| row | Lab[LabName] |
| labCode | Lab[LabCode] |
| labColour | Lab[LabColour] |
| domainId | Domain[DomainKey] |
| domain | Domain[DomainName] |
| score | [Score] |
| band | via Band Key |

Visual filter: Domain[IsCore] is true. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The model gives one row per lab and core domain. The template's Composite column needs extra composite rows the model does not produce, so it stays empty; the lab composite is on the Labs page.

**week: actions-list, "Priority actions".**

| Template field | Drag in |
| --- | --- |
| actionId | Action[ActionKey] |
| domain | Action[DomainName] |
| team | Action[TeamName] |
| labCode | Action[LabCode] |
| labColour | Action[LabColour] |
| description | Action[Description] |
| due | Action[DueDate] |
| severity | Action[Severity] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Open actions by severity then due date at 58px a row, as many as fit, then a "+N more" line; the model has 27 actions. The counts line stays inside overview-hero.

#### Page: Labs and teams

Page row: kicker "Executive summary · Labs and teams", title "How each lab and team is holding up". Headline [Labs Headline]. Page filters: Page[PageKey] is labs; Period[Period] is Last 6 quarters.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| labs | Deneb, lab-cards | 48 | 208 | 1824 | 170 |
| grid | Deneb, lab-sparkline-grid | 48 | 398 | 1824 | 200 |
| teams | Deneb, team-matrix | 48 | 618 | 1284 | 364 |
| movers | Deneb, bump-rank | 1352 | 618 | 520 | 364 |

**labs: lab-cards, "Labs".**

| Template field | Drag in |
| --- | --- |
| labId | Lab[LabKey] |
| lab | Lab[LabName] |
| labCode | Lab[LabCode] |
| labColour | Lab[LabColour] |
| lead | Lab[Lead] |
| composite | [Composite] |
| band | via Band Key |
| healthyTeams | via Teams Healthy Display |
| watchTeams | via Teams Watch Display |
| actTeams | via Teams Needing Action Display |
| q1 | via Score Q1 |
| q2 | via Score Q2 |
| q3 | via Score Q3 |
| q4 | via Score Q4 |
| q5 | via Score Q5 |
| q6 | [Composite] |

Power BI visual title, background, border and padding off. Power BI visual title, background, border and padding off. One card per lab, 4 in a row, drawn by the template; the sparkline is the lab composite over six quarters. Each card title carries the lab's chip, so the row doubles as the lab legend for the chips on other pages. Clicking a card cross-filters by lab. With a lab chosen in the Lab filter only that lab's card is drawn; the app keeps all four visible.

**grid: lab-sparkline-grid, "Lab by domain".**

| Template field | Drag in |
| --- | --- |
| lab | Lab[LabName] |
| labCode | Lab[LabCode] |
| labColour | Lab[LabColour] |
| domainId | Domain[DomainKey] |
| domain | Domain[DomainName] |
| quarter | Quarter[QuarterKey] |
| score | [Score] |
| band | via Band Key |

Visual filter: Domain[IsCore] is true. Visual filter: [In Selected Period] is 1. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Beneath the lab cards, the full content width: a sparkline cell per lab and core domain over the selected quarters, tinted by the latest band, which carries the word in its tooltip. Rows are Lab by core Domain by Quarter, every cell real. The team matrix and movers below give up the height (200px and a gap).

**teams: team-matrix, "Teams".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| lab | Team[LabName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| composite | [Team Composite] |
| domain | Domain[DomainName] |
| domainOrder | Domain[SortOrder] |
| score | [Score] |
| band | via Band Key |

Visual filter: Domain[IsCore] is true. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. One row per team (12), weakest composite first, and a heat cell per core domain in Domain[SortOrder] (grouped) order that always shows the score, so colour is never the only cue. Rows are Team by core Domain, every cell real.

**movers: bump-rank, "Movers, last N quarters".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| lab | Team[LabName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| quarter | Quarter[QuarterKey] |
| quarterLabel | Quarter[QuarterLabel] |
| composite | [Composite] |
| rank | via Team Rank |

Visual filter: [In Selected Period] is 1. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Relaid out: the app rail is 320px wide, which would leave the plot about 94px beside the template's 210px end-label column. At 520px the plot keeps about 290px and the end labels stay full size; the team matrix gives up the 200px.

#### Page: Actions

Page row: kicker "Executive summary · Actions", title "What needs doing". Headline [Actions Headline]. Page filters: Page[PageKey] is actions.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| summary | Deneb, actions-summary | 48 | 208 | 1824 | 120 |
| table | Deneb, actions-table | 48 | 348 | 1284 | 634 |
| by-domain | Deneb, bar-list | 1352 | 348 | 520 | 634 |

**summary: actions-summary, "Actions summary".**

| Template field | Drag in |
| --- | --- |
| open | [Open Actions] |
| due30 | [Actions Due 30 Days] |
| pastDue | [Actions Past Due] |
| act | [Actions Act] |
| thisWeek | [Actions This Week] |
| next30 | [Actions Next 30 Days] |
| later | [Actions Later] |

Power BI visual title, background, border and padding off. Power BI visual title, background, border and padding off. Every field is a measure, so the visual receives one row for the scope set by the Lab and Team filters: four tiles (open, due within 30 days, past due, Act severity) and the due-date bar split into past due, this week, next 30 days and later, each bucket named and counted. A blank reads as 0.

**table: actions-table, "Open actions table".**

| Template field | Drag in |
| --- | --- |
| actionId | Action[ActionKey] |
| domain | Action[DomainName] |
| team | Action[TeamName] |
| lab | Action[LabName] |
| labCode | Action[LabCode] |
| labColour | Action[LabColour] |
| description | Action[Description] |
| due | Action[DueDate] |
| severity | Action[Severity] |
| daysFromRefresh | via Days From Refresh |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The app's open actions table: by severity then due date, 28px a row, as many of the 27 as fit, with a status pill that carries the word. The lab is a chip alone; the lab legend in the header names the chips.

**by-domain: bar-list, "Actions by domain".**

| Template field | Drag in |
| --- | --- |
| team | Domain[DomainName] |
| lab | Domain[DomainGroupName] |
| score | [Open Actions] |
| band | via Band Key |

Visual filter: [Open Actions] is not 0. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. bar-list with its unitLabel param set to "actions": one bar per domain with open actions (13), most first, in one colour, the count printed beside the bar and the domain group under the name. Band is bound because the template lists it; with a unit label it is not drawn.

#### Page: Movement

Page row: kicker "Executive summary · Movement", title "What moved and why". Headline via Movement Headline. Page filters: Page[PageKey] is movement; Period[Period] is Last 6 quarters.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| dumbbell | Deneb, dumbbell-movement | 48 | 208 | 902 | 426 |
| waterfall | Deneb, composite-waterfall | 970 | 208 | 902 | 426 |
| teams | Deneb, movement-table | 48 | 654 | 1824 | 328 |

**dumbbell: dumbbell-movement, "What moved over the period".**

| Template field | Drag in |
| --- | --- |
| domainId | Domain[DomainKey] |
| domain | Domain[DomainName] |
| scope | [Scope Name] |
| from | via Score Period Start |
| to | [Score] |
| delta | [Score Delta over Period] |

Visual filter: Domain[IsCore] is true. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Start of the period to now, following the Period filter, as in the app and like the waterfall and the teams table. The template sorts worst mover first. The template draws its own title, "What moved over the period".

**waterfall: composite-waterfall, "Why the composite moved".**

| Template field | Drag in |
| --- | --- |
| scope | [Scope Name] |
| step | MovementStep[Step] |
| label | MovementStep[Label] |
| short | MovementStep[Short] |
| kind | MovementStep[Kind] |
| value | [Step Value] |
| running | [Step Running] |
| quarters | [Selected Quarters] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. One row per MovementStep row: the period start, one delta step per core domain, then now. MovementStep[Short] gives the x axis a short step name (Maturity, Arch.) so neighbouring labels do not touch. MovementStep holds core domains only, so no Domain[IsCore] filter is needed (it would drop the start and end rows). The steps follow the Period filter, and the subtitle reads the period length from quarters.

**teams: movement-table, "Movement by team".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| lab | Team[LabName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| from | via Composite Period Start |
| to | [Composite] |
| delta | [Score Delta over Period] |
| bandText | via Band Movement |
| q1 | via Score Q1 |
| q2 | via Score Q2 |
| q3 | via Score Q3 |
| q4 | via Score Q4 |
| q5 | via Score Q5 |
| q6 | [Composite] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. One row per team (12), biggest fall first: start of the period, now, the signed change with better, worse or held in words (the template works the word out from the delta), the band movement such as "Watch → Healthy", and a six-quarter composite sparkline in the right-hand column (q1 to q5 from the Score quarter measures, q6 the composite now).

### Reports 2 to 5: the domain pages

Each domain report holds its group's domains, in the app's grouped order: Operations (Stability, Incidents, Problems, Change, Maturity, Operability); Risk and control (Risk, Security, Resilience, Governance); Architecture and estate (Architecture, Estate, Cost); Delivery and people (Delivery, People). Every domain page has the same blocks; build Stability, then duplicate the page and change the Domain[DomainKey] and Page[PageKey] page filters. The kicker reads the group and the domain, such as "Operations · Stability". Maturity puts maturity-ladder in the 640px middle slot and moves metric-heat to the left, below.

#### Page: Stability (the pattern for every domain page)

Page row: kicker "Operations · Stability", title "Stability". Headline [Domain Headline]. Page filters: Page[PageKey] is stability; Domain[DomainKey] is stability; Period[Period] is Last 6 quarters.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| kpis | Deneb, kpi-tiles | 48 | 208 | 1824 | 180 |
| concentrates | Deneb, bar-list | 48 | 408 | 572 | 394 |
| heat | Deneb, metric-heat | 640 | 408 | 640 | 394 |
| trend | Deneb, trend-target | 1300 | 408 | 572 | 394 |
| actions | Deneb, actions-list | 48 | 822 | 1180 | 160 |
| sources | Deneb, sources-strip | 1248 | 822 | 624 | 160 |

**kpis: kpi-tiles, "Metrics".**

| Template field | Drag in |
| --- | --- |
| metricId | Metric[MetricKey] |
| label | Metric[MetricName] |
| value | [Metric Value] |
| formatted | [Metric Value Formatted] |
| unit | Metric[Unit] |
| target | [Metric Target] |
| delta | [Metric Delta over Period] |
| band | via Metric Band Key |
| direction | Metric[Direction] |
| targetFormatted | [Metric Target Formatted] |
| q1 | via Metric Value Q1 |
| q2 | via Metric Value Q2 |
| q3 | via Metric Value Q3 |
| q4 | via Metric Value Q4 |
| q5 | via Metric Value Q5 |
| q6 | [Metric Value] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. 3 tiles of the domain's 3 metrics, drawn by the template, which caps the band at five (its maxTiles param) and prints "+N more in the heat below" for the rest; sort by Metric[MetricName] (sorted by Metric[SortOrder]). Delta follows the Period filter, as the app's tile does.

**concentrates: bar-list, "Domain score by team".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| lab | Team[LabName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| score | [Score] |
| band | via Band Key |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off.

**heat: metric-heat, "Metric by team".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| teamScore | [Team Domain Score] |
| metricOrder | Metric[SortOrder] |
| short | Metric[ShortName] |
| formatted | [Metric Value Formatted] |
| band | via Metric Band Key |

Visual filter: Metric[IsScored] is true. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. One row per team (12), worst [Team Domain Score] first, and a column per scored metric of this domain in Metric[SortOrder] order under its short name; each cell prints [Metric Value Formatted], tinted and striped by [Metric Band]. Rows are Team by Metric, every cell real. Clicking a row cross-filters by team.

**trend: trend-target, "Trend, last N quarters".**

| Template field | Drag in |
| --- | --- |
| domain | Domain[DomainName] |
| quarter | Quarter[QuarterKey] |
| quarterLabel | Quarter[QuarterLabel] |
| score | [Score] |
| scope | [Scope Name] |

Visual filter: [In Selected Period] is 1. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The trend takes the full 394px of the middle row. The read-out card is not carried: the page headline states the same score and furthest-from-target metric, and the row has no room for both at their designed heights.

**actions: actions-list, "Actions".**

| Template field | Drag in |
| --- | --- |
| actionId | Action[ActionKey] |
| domain | Action[DomainName] |
| team | Action[TeamName] |
| labCode | Action[LabCode] |
| labColour | Action[LabColour] |
| description | Action[Description] |
| due | Action[DueDate] |
| severity | Action[Severity] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The left of the merged actions and sources strip: this domain's open actions (the page Domain filter), by severity then due date, as many as fit, then "+N more"; the largest domain has 3.

**sources: sources-strip, "Sources".**

| Template field | Drag in |
| --- | --- |
| sourceOrder | Metric[SortOrder] |
| system | Metric[SourceSystem] |
| mode | Metric[IngestionMode] |
| modeLabel | via Mode Label |
| readiness | via Worst Readiness |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The right of the merged actions and sources strip: one line per source system and ingestion mode (up to 3 in a domain) with a readiness pill that carries the word. sourceOrder is Metric[SortOrder] summarised as Minimum (First in the manifest).

#### Maturity: the ladder

Same page as Stability with one change: maturity-ladder takes the 640px middle slot and metric-heat moves to the left.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| ladder | Deneb, maturity-ladder | 640 | 408 | 640 | 394 |
| heat | Deneb, metric-heat | 48 | 408 | 572 | 394 |
| trend | Deneb, trend-target | 1300 | 408 | 572 | 394 |

**ladder: maturity-ladder, "Maturity by capability".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| lab | Team[LabName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| capability | Metric[MetricName] |
| level | [Metric Value] |

Visual filter: Metric[MetricKey] in triageMaturity, incidentMaturity, recoveryMaturity, resolutionMaturity, serviceMaturity. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Replaces "Domain score by team" on this page and takes the 640px middle slot, the widest in the row, with metric-heat moved to the left; the ladder answers the same question per capability. The template wants about 36px a team; at this height twelve teams get about 26px, so pips sit close.

**heat: metric-heat, "Metric by team".**

| Template field | Drag in |
| --- | --- |
| team | Team[TeamName] |
| labCode | Team[LabCode] |
| labColour | Team[LabColour] |
| teamScore | [Team Domain Score] |
| metricOrder | Metric[SortOrder] |
| short | Metric[ShortName] |
| formatted | [Metric Value Formatted] |
| band | via Metric Band Key |

Visual filter: Metric[IsScored] is true. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. One row per team (12), worst [Team Domain Score] first, and a column per scored metric of this domain in Metric[SortOrder] order under its short name; each cell prints [Metric Value Formatted], tinted and striped by [Metric Band]. Rows are Team by Metric, every cell real. Clicking a row cross-filters by team.

**trend: trend-target, "Trend, last N quarters".**

| Template field | Drag in |
| --- | --- |
| domain | Domain[DomainName] |
| quarter | Quarter[QuarterKey] |
| quarterLabel | Quarter[QuarterLabel] |
| score | [Score] |
| scope | [Scope Name] |

Visual filter: [In Selected Period] is 1. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The trend takes the full 394px of the middle row. The read-out card is not carried: the page headline states the same score and furthest-from-target metric, and the row has no room for both at their designed heights.

#### Page: Structure and skills

Page row: kicker "Delivery and people · Structure and skills", title "Who we have and what they can do". Headline [People Structure Headline]. Page filters: Page[PageKey] is people-structure; Domain[DomainKey] is people.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| leadership | Deneb, leadership-chart | 48 | 208 | 1824 | 250 |
| roles | Deneb, role-composition | 48 | 478 | 902 | 504 |
| skills | Deneb, skills-heat | 970 | 478 | 902 | 504 |

**leadership: leadership-chart, "Leadership".**

| Template field | Drag in |
| --- | --- |
| level | Person[LeadLevel] |
| id | Person[PersonKey] |
| parentId | Person[ParentKey] |
| label | Person[Role] |
| sublabel | Person[UnitName] |
| labCode | Person[LabCode] |
| labColour | Person[LabColour] |
| headcount | [Span Headcount] |
| contractorPct | [Span Contractor Pct] |

Visual filter: Person[IsLead] is true. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. The 250px leadership chart: one platform lead, four lab leads and twelve team leads, one Person row each (Person[IsLead]). Leaders are shown by role and the unit they lead (Person[UnitName]), never by name. [Span Headcount] and [Span Contractor Pct] count the leader's span, so a Lab or Team slicer does not shrink the platform lead's node.

**roles: role-composition, "Role composition by lab".**

| Template field | Drag in |
| --- | --- |
| lab | Person[LabName] |
| labCode | Person[LabCode] |
| labColour | Person[LabColour] |
| roleGroup | Person[RoleGroup] |
| count | [Headcount] |
| contractors | [Contractors] |

Visual filter: Person[LeadLevel] is not 1. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Rows are Person[LabName] by Person[RoleGroup]; the platform lead, who has no lab, is filtered out. Each bar stacks the role groups in the app order, with the contractors in each group as a lighter tail and the lab contractor share to the right.

**skills: skills-heat, "Critical skills coverage".**

| Template field | Drag in |
| --- | --- |
| skill | Skill[SkillName] |
| lab | Person[LabName] |
| labCode | Person[LabCode] |
| labColour | Person[LabColour] |
| count | [Skill Count] |
| estateCount | [Skill Estate Count] |
| flag | [Skill Flag] |

Visual filter: Person[LeadLevel] is not 1. Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. Rows are Skill by Person[LabName], every cell real: [Skill Estate Count] ignores the lab grouping, so a skill no one in a lab holds still draws its 0 cell. The spec adds the estate total column from [Skill Estate Count] and the Depth pill from [Skill Flag]; thinnest skills first.

### Report 6: Data and sources

#### Page: Lineage

Page row: kicker "Data and sources · Lineage", title "Where every number comes from". Headline [Sources Headline]. Page filters: Page[PageKey] is lineage.

| Block | Insert | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| readiness | Deneb, readiness-matrix | 48 | 208 | 1824 | 203 |
| lineage | Deneb, lineage-table | 48 | 431 | 1824 | 551 |

**readiness: readiness-matrix, "Where the data comes from".**

| Template field | Drag in |
| --- | --- |
| domainId | Metric[DomainKey] |
| domain | Metric[DomainName] |
| mode | Metric[IngestionMode] |
| modeLabel | via Mode Label |
| count | Metric[MetricKey] |
| worstReadiness | via Worst Readiness |
| live | via Live Metrics |
| partial | via Partial Metrics |
| aspirational | via Aspirational Metrics |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. All 15 domains; Lab and Team filters do not reach Metric, so the page stays estate-wide. It is 203px high, which puts the template in its compact mode, and splits the domains into two side-by-side halves.

**lineage: lineage-table, "Metric sources".**

| Template field | Drag in |
| --- | --- |
| domainId | Metric[DomainKey] |
| domain | Metric[DomainName] |
| domainOrder | Domain[SortOrder] |
| metricId | Metric[MetricKey] |
| metricOrder | Metric[SortOrder] |
| metric | Metric[MetricName] |
| system | Metric[SourceSystem] |
| mode | Metric[IngestionMode] |
| modeLabel | via Mode Label |
| refresh | Metric[Refresh] |
| owner | Metric[Owner] |
| readiness | Metric[Readiness] |

Power BI visual title, background, border and padding off. The template draws its own title. Power BI visual title, background, border and padding off. All 57 metrics in two side-by-side tables, as the app splits them, in Domain[SortOrder] (grouped) order; domainOrder is Domain[SortOrder] summarised as Minimum, so the rows stay one per metric. It takes the rest of the page (551px); the longer side needs 579px at 17px a row.
## 5. Publish as an app

1. Publish the model and the six reports to one workspace.
2. Workspace, Create app.
3. Navigation: add the six reports in this order: Executive summary, Operations, Risk and control, Architecture and estate, Delivery and people, Data and sources.
4. Leave each report's pages nested under it, in the order above. Do not add sections.
5. Label the two proposed pages "Operability (Proposed)" and "Cost (Proposed)".
6. Hide page tabs in each report: the app navigation lists the pages.
7. Leave the filter pane visible. Publish, then grant access.

## 6. Swapping fixtures for real sources

Replace one table's query at a time and keep the key it joins on. `model/README.md` (Mapping to real sources later) lists every metric's system.

| Table | Replace with | Keep |
| --- | --- | --- |
| Lab, Team | A maintained reference list owned by the Delivery Office | LabKey, TeamKey, SortOrder |
| Domain | Stays maintained by hand | DomainKey, IsCore, SortOrder |
| Metric | A maintained register; update Readiness to live as each feed lands | MetricKey, Target, Direction, Aggregate |
| Quarter | A generated quarter list; set IsCurrent on the latest | QuarterKey sequence |
| MetricValue | One query per source (ServiceNow, Dynatrace, Jira, SharePoint lists, Intune and SCCM, Qualys or Tenable, GCP billing, Azure Cost Management, Workday), appended | TeamKey, MetricKey, QuarterKey, Value |
| Action | The SharePoint risk, audit and DR lists | ActionKey, TeamKey, DomainKey, DueDate, Severity |
| Config | RefreshDate from the refresh time; thresholds stay 80 and 60 | One row |

Add a TeamSourceMap table (source identifier to TeamKey) and merge it in Power Query, rather than renaming teams in each system. When a report moves to its own semantic model, repoint it and keep the same measure names so no visual changes.

## 7. Checks

Clear the Lab and Team filters, set Period to Last 6 quarters. The Overview should read:

- Composite 74, Watch.
- Headline: "2 of 13 domains healthy across the estate. 3 teams need action, led by Incidents."
- Domain mix: 2 healthy, 11 to watch, no segment to act.

| Domain | Score | Band |
| --- | --- | --- |
| Stability | 74 | Watch |
| Incidents | 69 | Watch |
| Problems | 80 | Healthy |
| Change | 70 | Watch |
| Maturity | 87 | Healthy |
| Operability (proposed) | 72 | Watch |
| Risk | 69 | Watch |
| Security | 72 | Watch |
| Resilience | 73 | Watch |
| Governance | 74 | Watch |
| Architecture | 75 | Watch |
| Estate | 74 | Watch |
| Cost (proposed) | 73 | Watch |
| Delivery | 73 | Watch |
| People | 74 | Watch |

The same figures are under `checks` in the manifest, computed from the app's own functions each time it is generated. If a figure differs, compare with the mock (`npm run dev`) page by page before changing a measure.
