import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:https` sets this. Geolocation (and any other secure-context API)
// is unavailable over plain HTTP on a LAN IP — iOS Safari in particular exposes
// navigator.geolocation there but never fires either callback, so the live
// location dot silently never appears. Testing that on a real phone needs TLS.
// Off by default: the self-signed cert costs an interstitial on every boot.
const https = process.env.VITE_HTTPS === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
