// Board visibility, per the Stremio addon protocol.
//
// How the Home board is built (stremio-core, models/common/board.rs):
// every catalog of every addon, in profile order, is requested with an EMPTY
// extra list. A catalog that declares a required extra therefore cannot be
// requested with an empty extra and never gets a row on the board — while it
// stays selectable in Discover (the genre/search dropdown) and in Search.
//
// That is the switch addons themselves use: Cinemeta ships "New movies" /
// "New series" with `genre` required (options = years), so they live only in
// Discover. Most addons do not mark anything required and always show a row.
//
// So "hide on Home only" = flip `isRequired` on an EXISTING genre (preferred)
// or search extra of that catalog. It is a manifest edit stored in the
// account's addon collection, not a separate visibility flag. Catalogs with
// neither extra cannot be hidden without lying to the addon about a filter it
// does not support — they are reported as not toggleable.

export function catalogsOf(addon) {
  const catalogs = addon && addon.manifest && addon.manifest.catalogs
  return Array.isArray(catalogs) ? catalogs : []
}

export function isOnBoard(catalog) {
  const extras = Array.isArray(catalog.extra) ? catalog.extra : []
  if (extras.some((e) => e && e.isRequired === true)) return false
  if (Array.isArray(catalog.extraRequired) && catalog.extraRequired.length > 0) return false
  return true
}

export function toggleFieldName(catalog) {
  const extras = Array.isArray(catalog.extra) ? catalog.extra : []
  if (extras.some((e) => e && e.name === 'genre')) return 'genre'
  if (extras.some((e) => e && e.name === 'search')) return 'search'
  if (Array.isArray(catalog.extraSupported)) {
    if (catalog.extraSupported.includes('genre')) return 'genre'
    if (catalog.extraSupported.includes('search')) return 'search'
  }
  return null
}

export function canToggle(catalog) {
  return toggleFieldName(catalog) !== null
}

// A required *genre* with no options means the client has nothing to send as a
// value; such a catalog may stop loading even in Discover. Surface it.
// `search` never carries options — requiring it is the normal search-only mode.
export function toggleIsRisky(catalog) {
  const name = toggleFieldName(catalog)
  if (name !== 'genre') return false
  const extras = Array.isArray(catalog.extra) ? catalog.extra : []
  const field = extras.find((e) => e && e.name === name)
  if (!field) return false
  return !Array.isArray(field.options) || field.options.length === 0
}

// 'genre' keeps the catalog in Discover (with a filter dropdown); 'search'
// moves it to Search only.
export function toggleKind(catalog) {
  return toggleFieldName(catalog)
}

export function setOnBoard(catalog, onBoard) {
  const name = toggleFieldName(catalog)
  if (!name) return false
  const extras = Array.isArray(catalog.extra) ? catalog.extra : []
  const field = extras.find((e) => e && e.name === name)
  if (field) {
    if (onBoard) delete field.isRequired
    else field.isRequired = true
  }
  if (Array.isArray(catalog.extraSupported) && catalog.extraSupported.length > 0) {
    const required = Array.isArray(catalog.extraRequired) ? catalog.extraRequired.slice() : []
    const without = required.filter((n) => n !== name)
    catalog.extraRequired = onBoard ? without : [...without, name]
  }
  return true
}

// Per-addon state for the checkbox: 'board' (all rows shown), 'hidden' (all
// toggleable catalogs off the board), 'partial' (some off), 'none' (addon has
// no catalogs or none of them can be toggled).
export function addonBoardState(addon) {
  const catalogs = catalogsOf(addon)
  const toggleable = catalogs.filter(canToggle)
  if (catalogs.length === 0) return { state: 'none', total: 0, toggleable: 0, hidden: 0 }
  if (toggleable.length === 0) return { state: 'none', total: catalogs.length, toggleable: 0, hidden: 0 }
  const hidden = toggleable.filter((c) => !isOnBoard(c)).length
  if (hidden === 0) return { state: 'board', total: catalogs.length, toggleable: toggleable.length, hidden }
  if (hidden === toggleable.length) return { state: 'hidden', total: catalogs.length, toggleable: toggleable.length, hidden }
  return { state: 'partial', total: catalogs.length, toggleable: toggleable.length, hidden }
}

export function setAddonOnBoard(addon, onBoard) {
  let changed = false
  for (const catalog of catalogsOf(addon)) {
    if (setOnBoard(catalog, onBoard)) changed = true
  }
  return changed
}

export function riskyCatalogs(addon) {
  return catalogsOf(addon).filter((c) => canToggle(c) && toggleIsRisky(c))
}
