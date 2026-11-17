// Unit tests for the sign-in helpers. `npm test` (node --test src/).
import test from 'node:test'
import assert from 'node:assert/strict'
import { normaliseAuth } from './config.js'
import { parseLinkCode, parseLinkRead } from './api.js'

test('SAM_AUTH is normalised, and anything unexpected falls back to the private mode', () => {
  assert.equal(normaliseAuth('link'), 'link')
  assert.equal(normaliseAuth('LINK'), 'link')
  assert.equal(normaliseAuth(' Link \n'), 'link')
  assert.equal(normaliseAuth('password'), 'password')
  assert.equal(normaliseAuth(''), 'password')
  assert.equal(normaliseAuth(undefined), 'password')
  assert.equal(normaliseAuth(null), 'password')
  assert.equal(normaliseAuth('public'), 'password')
})

test('link/create: the real answer shape is accepted', () => {
  const created = parseLinkCode({
    result: {
      success: true,
      code: '4C3K',
      link: 'https://link.stremio.com/4C3K',
      qrcode: 'https://link.stremio.com/qr?data=https%3A%2F%2Flink.stremio.com%2F4C3K',
    },
  })
  assert.equal(created.code, '4C3K')
  assert.equal(created.link, 'https://link.stremio.com/4C3K')
  assert.match(created.qrcode, /^https:\/\/link\.stremio\.com\/qr\?/)
})

test('link/create: a missing code or an API error is an error, not a blank screen', () => {
  assert.throws(() => parseLinkCode({ result: { success: true } }), /no code/)
  assert.throws(() => parseLinkCode({ error: { code: 1, message: 'Session does not exist' } }), /Session does not exist/)
  assert.throws(() => parseLinkCode(null), /no code/)
})

test('link/read: 101 means "still waiting" and is not an error', () => {
  assert.equal(parseLinkRead({ error: { code: 101, message: 'Invalid or expired token' } }), null)
  assert.equal(parseLinkRead({ error: { code: '101' } }), null)
})

test('link/read: a confirmed code returns the same authKey the login call returns', () => {
  assert.equal(parseLinkRead({ result: { authKey: 'abc123' } }), 'abc123')
})

test('link/read: any other failure is surfaced', () => {
  assert.throws(() => parseLinkRead({ error: { code: 1, message: 'Session does not exist' } }), /Session does not exist/)
  assert.throws(() => parseLinkRead({}), /unexpected answer/)
})
