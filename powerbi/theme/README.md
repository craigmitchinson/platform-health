# Platform Health theme

`platform-health.theme.json` is the Power BI report theme. Its `dataColors` mirror the light
tokens in `src/styles.css`.

Indices 9 to 12 are the lab identity colours, fixed in `LABS` order. They match `--c-lab-1` to
`--c-lab-4` in light mode. Keep them at these indices: the sample and model exports read them by
index, and the Lab table's LabColour column carries the same hexes.

| Index | Hex | Token | Lab | Code |
| --- | --- | --- | --- | --- |
| 9 | #1E5B4F | `--c-lab-1` | 24*7 Services | 24 |
| 10 | #8E5E48 | `--c-lab-2` | Colleague Tooling | CT |
| 11 | #44618A | `--c-lab-3` | Agentic Operations | AO |
| 12 | #1A6F7C | `--c-lab-4` | Data & Insights | DI |

Chip text on these fills is white (`--c-lab-ink`). In dark mode the app uses lighter fills with
dark text; the Power BI theme is light only.
