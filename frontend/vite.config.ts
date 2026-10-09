import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The SPA calls the API on its own origin (/api). In development Vite proxies those calls to the
// Spring Boot backend; in Docker, nginx does the same. Same-origin keeps the refresh cookie first-party.
//
// `--mode demo` (.env.demo) builds the static GitHub Pages demo instead: the API runs in the browser
// (src/demo), the app is served from the repository's Pages path, and statements open from blob: URLs.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const demo = env.VITE_DEMO_MODE === 'true'
  const target = env.VITE_PROXY_TARGET || 'http://localhost:8080'
  const storageOrigin = demo ? 'blob:' : env.STORAGE_PUBLIC_ORIGIN || 'http://localhost:9000'

  // `vite preview` serves the production build with the same Content-Security-Policy as nginx,
  // so a local run exercises the production policy.
  const securityHeaders = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      `img-src 'self' data: blob: ${storageOrigin}`,
      `frame-src ${storageOrigin}`,
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  return {
    plugins: [react()],
    base: demo ? env.VITE_DEMO_BASE || '/PaperTrail/' : '/',
    server: {
      port: 5173,
      proxy: { '/api': { target } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target } },
      headers: securityHeaders,
    },
  }
})
