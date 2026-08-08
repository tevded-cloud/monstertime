import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ships as a static folder inside tevded-site/public/monstertime, the same
// arrangement colortime, symptime and dubtime use, so every asset URL carries
// the prefix. The one difference from its neighbours: MonsterTime also talks to
// /api/monstertime/*, which the site Worker answers instead of the asset store.
export default defineConfig({
  base: '/monstertime/',
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5196,
    proxy: {
      // `npm run dev` here serves the UI only. Point API calls at a locally
      // running `wrangler dev` in tevded-site so the creature has somewhere to
      // live during development.
      '/api/monstertime': {
        target: process.env.API_ORIGIN || 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
})
