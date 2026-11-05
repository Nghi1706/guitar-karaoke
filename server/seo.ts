// robots.txt và sitemap.xml, dựng theo SITE_URL để đúng tên miền khi deploy.

import { Hono } from 'hono'
import type { AppEnv } from './http.ts'

export function seoRoutes(startedAt: Date) {
  const r = new Hono<AppEnv>()
  const lastmod = startedAt.toISOString().slice(0, 10)

  r.get('/robots.txt', (c) => {
    const { siteUrl } = c.get('deps').config
    c.header('Cache-Control', 'public, max-age=3600')
    return c.text(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`)
  })

  r.get('/sitemap.xml', (c) => {
    const { siteUrl } = c.get('deps').config
    c.header('Content-Type', 'application/xml; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n` +
        `</urlset>\n`,
    )
  })

  return r
}
