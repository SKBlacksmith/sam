// Addon logos: the stored manifest is a snapshot and is frequently useless —
// no `logo` at all (Cinemeta), an old absolute URL, or a relative path.
// Resolution chain: stored logo -> live manifest logo -> host favicon -> monogram.

const CACHE_KEY = 'cam.logos.v1'
const CACHE_TTL = 7 * 24 * 3600 * 1000
const PROBE_TIMEOUT = 4000
const FETCH_TIMEOUT = 5000

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* storage full or blocked: logos are cosmetic */
  }
}

function normalize(url, base) {
  if (!url || typeof url !== 'string') return null
  let value = url.trim()
  if (!value) return null
  if (value.startsWith('stremio://')) value = 'https://' + value.slice('stremio://'.length)
  try {
    const resolved = new URL(value, base || undefined)
    if (!/^https?:$/.test(resolved.protocol)) return null
    if (location.protocol === 'https:' && resolved.protocol === 'http:') resolved.protocol = 'https:'
    return resolved.href
  } catch {
    return null
  }
}

function manifestBase(transportUrl) {
  const url = normalize(transportUrl)
  if (!url) return null
  return url.endsWith('/') ? url : url.slice(0, url.lastIndexOf('/') + 1)
}

export function hostOf(transportUrl) {
  try {
    return new URL(normalize(transportUrl)).origin
  } catch {
    return null
  }
}

function probe(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false)
    const img = new Image()
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      img.onload = img.onerror = null
      resolve(ok)
    }
    img.onload = () => finish(img.naturalWidth > 1)
    img.onerror = () => finish(false)
    setTimeout(() => finish(false), PROBE_TIMEOUT)
    img.src = url
  })
}

async function liveManifestLogo(transportUrl) {
  const base = manifestBase(transportUrl)
  if (!base) return null
  const now = Date.now()
  const cache = readCache()
  const hit = cache[base]
  if (hit && now - hit.at < CACHE_TTL) return hit.logo

  let logo = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    const resp = await fetch(base + 'manifest.json', { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    const type = resp.headers.get('content-type') || ''
    if (resp.ok && /json/i.test(type)) {
      const manifest = await resp.json()
      logo = normalize(manifest.logo, base)
    }
  } catch {
    /* CORS, offline, HTML landing page — fall through to favicon */
  }
  cache[base] = { logo, at: now }
  writeCache(cache)
  return logo
}

export async function resolveLogo(addon) {
  const candidates = []
  const stored = normalize(addon?.manifest?.logo, manifestBase(addon?.transportUrl))
  if (stored) candidates.push(stored)

  const live = await liveManifestLogo(addon?.transportUrl)
  if (live && !candidates.includes(live)) candidates.push(live)

  const host = hostOf(addon?.transportUrl)
  if (host) candidates.push(host + '/favicon.ico')

  for (const candidate of candidates) {
    if (await probe(candidate)) return candidate
  }
  return null
}

export function monogram(addon) {
  const name = (addon?.manifest?.name || addon?.transportUrl || '?').trim()
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
  if (letters.length >= 2) return (letters[0][0] + letters[1][0]).toUpperCase()
  return letters[0].slice(0, 2).toUpperCase()
}
