import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icon-v3.svg', 'icon-v3-apple.png'],
      manifest: {
        name: 'LePtiGrp',
        short_name: 'LePtiGrp',
        description: 'Le chat de ton petit groupe',
        lang: 'fr',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-v3-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-v3-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-v3-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Le service worker est un script classique : `import.meta` (utilisé par libsodium) y est interdit
        // et empêcherait toute mise à jour de l'appli. On le remplace par l'adresse du service worker.
        buildPlugins: {
          vite: [{
            name: 'sw-no-import-meta',
            transform: (code: string) => (code.includes('import.meta.url') ? code.replaceAll('import.meta.url', 'self.location.href') : null),
          }],
        },
      },
    }),
  ],
})
