// Stremio account API: three calls, no keys, authKey inside the body.
// Contract verified against Stremio/stremio-core (APIRequest) and live probes.

const API = 'https://api.strem.io/api/'

async function call(method, body) {
  const resp = await fetch(API + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: methodName(method), ...body }),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${method}`)
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
