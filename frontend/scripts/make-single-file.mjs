import fs from 'node:fs'
import path from 'node:path'

function inlineAssets(html, distDir) {
  // Inline CSS links
  html = html.replace(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g, (m, href) => {
    const cssPath = path.resolve(distDir, href.replace(/^\//, ''))
    const css = fs.readFileSync(cssPath, 'utf8')
    return `<style>${css}</style>`
  })

  // Inline JS modules
  html = html.replace(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const jsPath = path.resolve(distDir, src.replace(/^\//, ''))
    const js = fs.readFileSync(jsPath, 'utf8')
    return `<script type="module">${js}<\/script>`
  })
  return html
}

function main() {
  const distDir = path.resolve('dist')
  const indexPath = path.join(distDir, 'index.html')
  const outPath = path.join(distDir, 'spa.html')
  const html = fs.readFileSync(indexPath, 'utf8')
  const inlined = inlineAssets(html, distDir)
  fs.writeFileSync(outPath, inlined, 'utf8')
  console.log(`Single-file SPA written to ${outPath}`)
}

main()