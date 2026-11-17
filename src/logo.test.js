// Unit tests for the logo chain's LAN rule. `npm test` (node --test src/).
import test from 'node:test'
import assert from 'node:assert/strict'

// logo.js reads `location` at call time and uses Image/localStorage for the network path.
// A public page is the case that matters: the browser would prompt for local network access.
const page = { protocol: 'https:', hostname: 'sam.crossnetwork.uk' }
globalThis.location = page
globalThis.localStorage = { getItem: () => null, setItem: () => {} }

const calls = []
globalThis.fetch = async (url) => {
  calls.push(String(url))
  return { ok: false, headers: { get: () => '' } }
}
globalThis.Image = class {
  set src(value) {
    this._src = value
    setTimeout(() => this.onerror && this.onerror(), 0)
  }
}

const { resolveLogo, isPrivateHost } = await import('./logo.js')

test('private ranges are recognised, public addresses are not', () => {
  for (const host of ['10.1.2.3', '192.168.88.251', '172.16.0.1', '172.31.255.254', '127.0.0.1', '169.254.1.1', '100.64.0.1', 'localhost', 'nas.local', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateHost(host), true, host)
  }
  for (const host of ['8.8.8.8', '172.32.0.1', '192.169.1.1', '94.231.167.176', 'v3-cinemeta.strem.io', '']) {
    assert.equal(isPrivateHost(host), false, host)
  }
})

test('a public page does not touch a LAN addon', async () => {
  calls.length = 0
  const logo = await resolveLogo({
    transportUrl: 'http://192.168.88.251:8090/manifest.json',
    manifest: { name: 'Local', logo: 'http://192.168.88.251:8090/logo.png' },
  })
  assert.equal(logo, null)
  assert.deepEqual(calls, [])
})

test('a public page still resolves a public addon', async () => {
  calls.length = 0
  const logo = await resolveLogo({
    transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    manifest: { name: 'Cinemeta' },
  })
  assert.equal(logo, null)
  assert.deepEqual(calls, ['https://v3-cinemeta.strem.io/manifest.json'])
})

test('a LAN page keeps resolving LAN addons', async () => {
  page.hostname = '192.168.10.15'
  calls.length = 0
  await resolveLogo({
    transportUrl: 'http://192.168.88.251:8090/manifest.json',
    manifest: { name: 'Local' },
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0], /^https?:\/\/192\.168\.88\.251:8090\//)
})
