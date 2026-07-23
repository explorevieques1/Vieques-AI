import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // strictPort so it always owns 5174 (or fails loudly) instead of silently
  // drifting to 5175 — which would break the backend CORS allowlist.
  server: { port: 5174, host: true, strictPort: true },
})
