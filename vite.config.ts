import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// No backend. Single-page mock of a Power BI workspace app: one fixed-dimension
// report page per report, inside the app chrome.
// The design tokens and self-hosted fonts live under src/vendor/ui,
// so everything resolves inside the project: no fs.allow escape hatch needed.
export default defineConfig({
  plugins: [react()],
  // Fixed port; strictPort fails fast rather than drifting to another one.
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
  // Inline nothing as base64 so font files stay deterministic, cacheable assets.
  build: {
    assetsInlineLimit: 0,
  },
})
