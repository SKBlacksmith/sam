// Addon logos: the stored manifest is a snapshot and is frequently useless —
// no `logo` at all (Cinemeta), an old absolute URL, or a relative path.
// Resolution chain: stored logo -> live manifest logo -> host favicon -> monogram.

const CACHE_KEY = 'cam.logos.v1'
const CACHE_TTL = 7 * 24 * 3600 * 1000
// A failed fetch (offline, CORS, HTML landing page) must not stick for a week.
const CACHE_FAIL_TTL = 15 * 60 * 1000
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

// Chrome asks the visitor for "local network access" when a page served from the public
// internet reaches a private address. It is right to ask: an addon list is not a reason to
// touch the visitor's LAN. So a private host is only probed when this page is private too —
// on the LAN instance logos from LAN addons still resolve, on the public one they fall back
// to the monogram and the prompt never appears.
export function isPrivateHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1' || host === '::') return true
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true // fe80::/10 link local
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false
  const a = Number(v4[1])
  const b = Number(v4[2])
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true // link local
  if (a === 100 && b >= 64 && b <= 127) return true // carrier NAT
  return false
}

function pageIsPrivate() {
  return isPrivateHost(location.hostname)
}

// True when this URL lives on the LAN while the page itself does not.
function offLimits(url) {
  if (!url) return false
  try {
    return isPrivateHost(new URL(url).hostname) && !pageIsPrivate()
  } catch {
    return false
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
  const ttl = hit && hit.failed ? CACHE_FAIL_TTL : CACHE_TTL
  if (hit && now - hit.at < ttl) return hit.logo

  let logo = null
  let resolved = false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    const resp = await fetch(base + 'manifest.json', { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    const type = resp.headers.get('content-type') || ''
    if (resp.ok && /json/i.test(type)) {
      const manifest = await resp.json()
      logo = normalize(manifest.logo, base)
      resolved = true
    }
  } catch {
    /* CORS, offline, HTML landing page — fall through to favicon */
  }
  cache[base] = { logo, at: now, failed: !resolved }
  for (const key of Object.keys(cache)) {
    const entry = cache[key]
    const age = now - (entry && entry.at ? entry.at : 0)
    if (age > CACHE_TTL || !entry) delete cache[key]
  }
  writeCache(cache)
  return logo
}

export async function resolveLogo(addon) {
  const candidates = []
  const stored = normalize(addon?.manifest?.logo, manifestBase(addon?.transportUrl))
  if (stored && !offLimits(stored)) candidates.push(stored)

  const transport = normalize(addon?.transportUrl)
  if (!offLimits(transport)) {
    const live = await liveManifestLogo(addon?.transportUrl)
    if (live && !offLimits(live) && !candidates.includes(live)) candidates.push(live)
  }

  const host = hostOf(addon?.transportUrl)
  if (host && !offLimits(host)) candidates.push(host + '/favicon.ico')

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
