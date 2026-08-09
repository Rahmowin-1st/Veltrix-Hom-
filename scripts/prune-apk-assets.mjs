import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { posix, resolve } from 'node:path'

const publicRoot = resolve(process.argv[2] ?? 'android/app/src/main/assets/public')
const entry = 'index.html'
const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg'])
const localAssetPattern = /(?:^|["'`(=,:\s])((?:\/|\.\.?\/)?[A-Za-z0-9@_+./~-]+\.(?:m?js|css|woff2?|ttf|otf|eot|png|jpe?g|webp|gif|svg|json|wasm))(?:[?#][^"'`\s)]*)?/g

if (!existsSync(resolve(publicRoot, entry))) {
  throw new Error(`APK asset entry is missing: ${resolve(publicRoot, entry)}`)
}

function allFiles(directory, prefix = '') {
  const output = []
  for (const name of readdirSync(directory)) {
    const absolute = resolve(directory, name)
    const relative = prefix ? `${prefix}/${name}` : name
    if (statSync(absolute).isDirectory()) output.push(...allFiles(absolute, relative))
    else output.push(relative)
  }
  return output
}

function extension(pathname) {
  const dot = pathname.lastIndexOf('.')
  return dot >= 0 ? pathname.slice(dot).toLowerCase() : ''
}

function normalizeReference(reference, fromFile) {
  const clean = reference.split(/[?#]/, 1)[0]
  if (!clean || clean.startsWith('//')) return null
  const relative = clean.startsWith('/')
    ? clean.slice(1)
    : clean.startsWith('assets/')
      ? posix.normalize(clean)
      : posix.normalize(posix.join(posix.dirname(fromFile), clean))
  if (!relative || relative === '..' || relative.startsWith('../')) return null
  return relative
}

const reachable = new Set([entry])
const queue = [entry]

while (queue.length) {
  const current = queue.shift()
  if (!textExtensions.has(extension(current))) continue
  const content = readFileSync(resolve(publicRoot, current), 'utf8')
  localAssetPattern.lastIndex = 0
  for (const match of content.matchAll(localAssetPattern)) {
    const candidate = normalizeReference(match[1], current)
    if (!candidate || reachable.has(candidate) || !existsSync(resolve(publicRoot, candidate))) continue
    reachable.add(candidate)
    queue.push(candidate)
  }
}

const files = allFiles(publicRoot)
const generatedAssets = files.filter((file) => file.startsWith('assets/'))
const staleAssets = generatedAssets.filter((file) => !reachable.has(file))

for (const stale of staleAssets) rmSync(resolve(publicRoot, stale))

const entryText = readFileSync(resolve(publicRoot, entry), 'utf8')
if (![...reachable].some((file) => file.endsWith('.js')) || !entryText.includes('<script')) {
  throw new Error('APK asset graph has no reachable JavaScript entry')
}
if (![...reachable].some((file) => file.endsWith('.css')) || !entryText.includes('stylesheet')) {
  throw new Error('APK asset graph has no reachable stylesheet')
}

console.log(`APK asset graph verified: ${reachable.size} reachable, ${staleAssets.length} stale removed`)
