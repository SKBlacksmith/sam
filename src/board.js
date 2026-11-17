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

// Another required extra keeps the catalog off the board no matter what we do to
// genre/search, so flipping the toggle would be a lie: report it and leave the
// checkbox alone.
export function blockingExtra(catalog) {
  const name = toggleFieldName(catalog)
  if (!name) return null
  const extras = Array.isArray(catalog.extra) ? catalog.extra : []
  const other = extras.find((e) => e && e.name !== name && e.isRequired === true)
  if (other) return other.name
  const required = Array.isArray(catalog.extraRequired) ? catalog.extraRequired : []
  return required.find((n) => n !== name) || null
}

export function canToggle(catalog) {
  return toggleFieldName(catalog) !== null && blockingExtra(catalog) === null
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
  // A blocked catalog cannot be moved on or off the board, so leave its manifest alone
  // instead of writing a flag that changes nothing.
  if (!canToggle(catalog)) return false
  const name = toggleFieldName(catalog)
  const before = isOnBoard(catalog)
  const extras = Array.isArray(catalog.extra) ? catalog.extra : []
  const field = extras.find((e) => e && e.name === name)
  if (field) {
    if (onBoard) delete field.isRequired
    else field.isRequired = true
  }
  if (Array.isArray(catalog.extraRequired)) {
    const without = catalog.extraRequired.filter((n) => n !== name)
    catalog.extraRequired = onBoard ? without : [...without, name]
  } else if (Array.isArray(catalog.extraSupported) && catalog.extraSupported.length > 0) {
    // legacy shape: extraSupported without extraRequired
    catalog.extraRequired = onBoard ? [] : [name]
  }
  // The caller needs to know whether the board actually changed: a catalog that
  // keeps another required extra looks identical before and after, and the UI must
  // not report a change it did not make.
  return isOnBoard(catalog) !== before
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

// The addon checkbox. Checking it hides every catalog; unchecking puts back the
// catalogs the addon itself shipped hidden (`origin`, the board state at load).
// When nothing was hidden by the addon — the addon was already fully off the board,
// which is exactly what a save from this app leaves behind — restoring is a no-op,
// and the click has to mean "show every catalog" instead. Without that fallback the
// checkbox snapped back and Save never lit up.
export function setAddonFromOrigin(addon, originFlags) {
  if (addonBoardState(addon).state !== 'hidden') return setAddonOnBoard(addon, false)
  let restored = false
  catalogsOf(addon).forEach((catalog, index) => {
    if (!canToggle(catalog)) return
    const was = originFlags && index < originFlags.length ? originFlags[index] : true
    if (setOnBoard(catalog, was)) restored = true
  })
  return restored || setAddonOnBoard(addon, true)
}

export function riskyCatalogs(addon) {
  return catalogsOf(addon).filter((c) => canToggle(c) && toggleIsRisky(c))
}
