// Unit tests for the board logic. `npm test` (node --test src/).
import test from 'node:test'
import assert from 'node:assert/strict'
import cinemeta from './cinemeta-demo.json' with { type: 'json' }
import {
  addonBoardState,
  setAddonFromOrigin,
  setAddonOnBoard,
  setOnBoard,
  isOnBoard,
  canToggle,
  blockingExtra,
  toggleKind,
  toggleIsRisky,
  riskyCatalogs,
  catalogsOf,
} from './board.js'

function addon(name, catalogs) {
  return { transportUrl: `https://${name}.test/manifest.json`, manifest: { id: name, name, version: '1.0.0', catalogs } }
}

const genreCatalog = (id, required = false) => ({
  type: 'movie',
  id,
  name: id,
  extra: [{ name: 'genre', ...(required ? { isRequired: true } : {}), options: ['Drama'] }],
})

test('the real Cinemeta manifest: 6 catalogs toggleable, 2 hidden by the addon', () => {
  const state = addonBoardState({ transportUrl: 'cinemeta', manifest: cinemeta })
  assert.equal(state.total, 8)
  assert.equal(state.toggleable, 6)
  assert.equal(state.hidden, 2)
  assert.equal(state.state, 'partial')
})

test('unchecking an addon that was already fully off the board shows its catalogs', () => {
  // this is the state a save from SAM leaves behind on the next load
  const a = addon('hidden', [genreCatalog('top', true), genreCatalog('year', true)])
  assert.equal(addonBoardState(a).state, 'hidden')
  assert.equal(setAddonFromOrigin(a, [false, false]), true)
  assert.equal(addonBoardState(a).state, 'board')
  assert.deepEqual(catalogsOf(a).map(isOnBoard), [true, true])
})

test('unchecking a mixed addon puts back only what the addon itself hid', () => {
  const a = addon('mixed', [genreCatalog('top'), genreCatalog('year', true)])
  setAddonOnBoard(a, false)
  assert.equal(addonBoardState(a).state, 'hidden')
  assert.equal(setAddonFromOrigin(a, [true, false]), true)
  assert.deepEqual(catalogsOf(a).map(isOnBoard), [true, false])
  assert.equal(addonBoardState(a).state, 'partial')
})

test('checking an addon hides every toggleable catalog, twice in a row is a no-op', () => {
  const a = addon('plain', [genreCatalog('top'), genreCatalog('year')])
  assert.equal(setAddonFromOrigin(a, [true, true]), true)
  assert.equal(addonBoardState(a).state, 'hidden')
  assert.equal(setAddonOnBoard(a, false), false)
})

test('legacy manifest: extraRequired without extraSupported can be un-hidden', () => {
  const catalog = { type: 'movie', id: 'x', name: 'X', extra: [{ name: 'genre', options: ['Drama'] }], extraRequired: ['genre'] }
  assert.equal(isOnBoard(catalog), false)
  assert.equal(canToggle(catalog), true)
  assert.equal(setOnBoard(catalog, true), true)
  assert.equal(isOnBoard(catalog), true)
  assert.deepEqual(catalog.extraRequired, [])
})

test('legacy manifest: extraSupported without extraRequired gets the required list', () => {
  const catalog = { type: 'movie', id: 'x', name: 'X', extra: [{ name: 'genre', options: ['Drama'] }], extraSupported: ['genre', 'skip'] }
  assert.equal(setOnBoard(catalog, false), true)
  assert.deepEqual(catalog.extraRequired, ['genre'])
  assert.equal(isOnBoard(catalog), false)
})

test('a catalog blocked by another required extra is not offered as toggleable', () => {
  const catalog = { type: 'series', id: 'paged', name: 'Paged', extra: [{ name: 'skip', isRequired: true }, { name: 'genre', options: ['Drama'] }] }
  assert.equal(blockingExtra(catalog), 'skip')
  assert.equal(canToggle(catalog), false)
  const a = addon('blocked', [catalog])
  // nothing can be hidden here, so the addon checkbox must stay out of the way
  assert.equal(addonBoardState(a).state, 'none')
  assert.equal(setAddonOnBoard(a, false), false)
  assert.deepEqual(catalog.extra, [{ name: 'skip', isRequired: true }, { name: 'genre', options: ['Drama'] }])
})

test('toggle kind and risk warnings', () => {
  const risky = { type: 'movie', id: 'r', name: 'R', extra: [{ name: 'genre', options: [] }] }
  const search = { type: 'movie', id: 's', name: 'S', extra: [{ name: 'search' }] }
  const bare = { type: 'movie', id: 'b', name: 'B' }
  assert.equal(toggleKind(risky), 'genre')
  assert.equal(toggleIsRisky(risky), true)
  assert.equal(toggleKind(search), 'search')
  assert.equal(toggleIsRisky(search), false)
  assert.equal(canToggle(bare), false)
  assert.deepEqual(riskyCatalogs(addon('risk', [risky, search, bare])).map((c) => c.id), ['r'])
})
