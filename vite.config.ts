import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Hai trang: "/" là trang giới thiệu tĩnh (cho máy tìm kiếm đọc), "/app/" là ứng dụng React.
// Bản build trong dist/ là web tĩnh, đưa thẳng lên host miễn phí nào cũng được (xem README).
// Lúc dev, /api và các file SEO chuyển sang server Node (npm run server, cổng PORT trong .env).
// Vite dùng cổng riêng 5280 thay vì 5173 mặc định để khỏi đụng project Vite khác đang chạy.
const DEV_PORT = 5280

// Điền địa chỉ web thật (SITE_URL trong .env, dùng chung với server) vào canonical, og:url...
function siteUrl(url: string): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', url),
  }
}

// robots.txt và sitemap.xml cho bản web tĩnh (khi có server Node thì server/seo.ts cũng trả hai file này)
function seoFiles(url: string): Plugin {
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10)
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *
Allow: /

Sitemap: ${url}/sitemap.xml
`,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          `<?xml version="1.0" encoding="UTF-8"?>
` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
` +
          `  <url>
    <loc>${url}/</loc>
    <lastmod>${today}</lastmod>
` +
          `    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
` +
          `</urlset>
`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const API = `http://localhost:${env.PORT || 8787}`
  const url = (env.SITE_URL || API).replace(/\/+$/, '')
  // Web nằm ở thư mục con (GitHub Pages không có domain riêng: /ten-repo/) thì đặt BASE_PATH=/ten-repo/
  const base = `/${(env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
  if (mode === 'production' && !env.SITE_URL)
    console.warn(`
[!] Chưa đặt SITE_URL, canonical và sitemap sẽ trỏ về ${url}. Đặt SITE_URL rồi build lại.
`)

  return {
    base,
    plugins: [react(), siteUrl(url), seoFiles(url)],
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          app: resolve(import.meta.dirname, 'app/index.html'),
        },
      },
    },
    server: {
      port: DEV_PORT,
      // Cổng bị chiếm thì báo lỗi luôn, không lặng lẽ nhảy sang cổng khác
      strictPort: true,
      proxy: {
        '/api': API,
        '/robots.txt': API,
        '/sitemap.xml': API,
      },
    },
  }
})
