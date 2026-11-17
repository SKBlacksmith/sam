// Stremio account API: three calls, no keys, authKey inside the body.
// Contract verified against Stremio/stremio-core (APIRequest) and live probes.

const API = 'https://api.strem.io/api/'

async function call(method, body) {
  const resp = await fetch(API + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: methodName(method), ...body }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    const detail = body.trim().slice(0, 200)
    throw new Error(`HTTP ${resp.status} on ${method}${detail ? ': ' + detail : ''}`)
  }
  const data = await resp.json()
  if (data.error) throw new Error(`${data.error.code}: ${data.error.message}`)
  if (!data.result) throw new Error(`Unexpected answer from ${method}`)
  return data.result
}

function methodName(method) {
  return { login: 'Login', addonCollectionGet: 'AddonCollectionGet', addonCollectionSet: 'AddonCollectionSet' }[method] || method
}

export async function login(email, password) {
  const result = await call('login', { email, password, facebook: false })
  if (!result.authKey) throw new Error('No authKey in the login answer')
  return result.authKey
}

export async function getCollection(authKey) {
  const result = await call('addonCollectionGet', { authKey, update: true })
  return { addons: result.addons || [], lastModified: result.lastModified || null }
}

export async function setCollection(authKey, addons) {
  if (!Array.isArray(addons) || addons.length === 0) {
    throw new Error('Refusing to write an empty addon collection')
  }
  const result = await call('addonCollectionSet', { authKey, addons })
  if (!result.success) throw new Error('addonCollectionSet did not confirm success')
  return true
}

// Device-link sign-in: a separate host and API version (stremio-core LinkRequest,
// VERSION = "v2", GET with query parameters). No credentials are sent to create a code:
// the person confirms it on stremio.com, and the key is collected by polling read.
const LINK_API = 'https://link.stremio.com/api/v2/'

async function linkCall(path) {
  const resp = await fetch(LINK_API + path, { cache: 'no-store' })
  const data = await resp.json().catch(() => null)
  if (!data) throw new Error('empty answer from link.stremio.com')
  return data
}

export function parseLinkCode(data) {
  const result = data && data.result
  if (!result || !result.code || !result.link) {
    throw new Error((data && data.error && data.error.message) || 'no code in the answer')
  }
  return { code: String(result.code), link: String(result.link), qrcode: result.qrcode ? String(result.qrcode) : '' }
}

// The API answers error 101 for a code that is waiting AND for one that expired, so the
// caller cannot tell them apart and owns the timeout: null means "keep polling".
export function parseLinkRead(data) {
  if (data && data.result && data.result.authKey) return String(data.result.authKey)
  const error = data && data.error
  if (error && Number(error.code) === 101) return null
  throw new Error((error && error.message) || 'unexpected answer from link.stremio.com')
}

export async function createLinkCode() {
  return parseLinkCode(await linkCall('create?type=Create'))
}

export async function readLinkCode(code) {
  return parseLinkRead(await linkCall('read?type=Read&code=' + encodeURIComponent(code)))
}

