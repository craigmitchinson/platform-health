# Design tokens

The app's design tokens (src/vendor/ui): colour, type and spacing variables, glass chrome,
accessibility utilities and self-hosted fonts. Everything the app needs resolves inside the
project, so the repo clones and builds anywhere.

## What's here

- `tokens.css`: design tokens plus the `.ui-glass*` and `.ui-skip-link` utility classes.
- `fonts.css`: `@font-face` declarations for the self-hosted typefaces.
- `fonts/`: the nine `.woff2` files `fonts.css` references (Gelasio, Carlito, JetBrains Mono).

`main.tsx` imports `tokens.css`, then `fonts.css`, then the app's own `styles.css`, which only
uses `var(--c-*)` references.
