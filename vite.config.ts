import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Hai trang: "/" là trang giới thiệu tĩnh (cho máy tìm kiếm đọc), "/app/" là ứng dụng React.
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const API = `http://localhost:${env.PORT || 8787}`
  const url = (env.SITE_URL || API).replace(/\/+$/, '')

  return {
    plugins: [react(), siteUrl(url)],
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
