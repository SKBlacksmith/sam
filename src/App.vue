<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw } from 'vue'
import { login, getCollection, setCollection, createLinkCode, readLinkCode } from './api.js'
import { loadConfig } from './config.js'
import { addonBoardState, setAddonFromOrigin, setOnBoard, riskyCatalogs, catalogsOf, isOnBoard, canToggle, blockingExtra, toggleKind } from './board.js'
import { resolveLogo, monogram } from './logo.js'

const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
const KEY_STORE = 'sam.session'
const LEGACY_KEY_STORE = 'sam.authKey'
const key = ref('')
const remember = ref(false)
const email = ref('')
const password = ref('')

// Sign-in mode comes from config.json, written by the container entrypoint from SAM_AUTH.
const authMode = ref('password')
const link = ref(null)
const linkState = ref('')
const linkError = ref('')
const linkBusy = ref(false)
const LINK_POLL_MS = 2500
const LINK_TTL_MS = 5 * 60 * 1000
let linkTimer = null
let linkDeadline = 0
// Bumped on every start/stop, so a poll that lands after "new code" or sign-out is dropped.
let linkGeneration = 0

const addons = ref([])
// The collection exactly as the account answered last. The backup is written from this, not
// from `addons`, because dragging and ticking mutate `addons` in place: a "before" copy taken
// from it would already carry the changes the person is about to apply.
const saved = ref([])
const baseline = ref('')
const logos = reactive({})
const busy = ref('')
const error = ref('')
const notice = ref('')
const dragIndex = ref(null)
const fileInput = ref(null)
// Board state of every catalog as it was loaded from the account. Catalogs that the
// addon itself marks with a required extra are hidden on Home by design; this snapshot
// lets the UI put them back exactly as they were instead of un-hiding everything.
const origin = reactive({})
const expanded = reactive({})
const BACKUP_PREF = 'sam.backup'
const backupOnSave = ref(localStorage.getItem(BACKUP_PREF) !== 'off')

const loggedIn = computed(() => key.value.length > 0)
const dirty = computed(() => addons.value.length > 0 && snapshot() !== baseline.value)

function setBackupPref() {
  localStorage.setItem(BACKUP_PREF, backupOnSave.value ? 'on' : 'off')
}

function clone(value) {
  // The collection is pure JSON, but Vue wraps state in Proxy objects and those proxies
  // also end up nested inside arrays (a drag reorder stores proxy elements). structuredClone()
  // throws DataCloneError on a proxy and toRaw() only unwraps the outer level, so a JSON
  // round-trip is used instead: it reads through any proxy and keeps the data JSON-shaped.
  return JSON.parse(JSON.stringify(value))
}

function snapshot() {
  return JSON.stringify(
    addons.value.map((a) => ({ t: a.transportUrl, h: catalogsOf(a).map(isOnBoard) })),
  )
}

function rememberOrigin(list) {
  for (const key of Object.keys(origin)) delete origin[key]
  for (const addon of list) origin[addon.transportUrl] = catalogsOf(addon).map(isOnBoard)
}

function originFlag(addon, index) {
  const flags = origin[addon.transportUrl]
  return flags && index < flags.length ? flags[index] : true
}

function detectKey() {
  // the manual authKey input is gone; drop anything an older build stored
  localStorage.removeItem(LEGACY_KEY_STORE)
  sessionStorage.removeItem(LEGACY_KEY_STORE)
  const stored = localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || ''
  if (stored) {
    key.value = stored
    remember.value = !!localStorage.getItem(KEY_STORE)
  }
}

onMounted(async () => {
  const config = await loadConfig()
  authMode.value = config.auth
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    import('./fixture.js').then(({ demoAddons }) => {
      key.value = 'demo'
      addons.value = clone(demoAddons)
      saved.value = clone(demoAddons)
      baseline.value = snapshot()
      rememberOrigin(addons.value)
      addons.value.forEach((addon) => refreshLogo(addon))
    })
    return
  }
  detectKey()
  if (key.value) load()
  // No code is requested on load: a visitor who only looks at the page sends nothing to
  // Stremio. The sign-in card shows a button instead.
})

onUnmounted(stopLink)

// --- device-link sign-in ---------------------------------------------------------
// create gives a short code plus a link on link.stremio.com; the person confirms it on
// stremio.com, and read hands over the same authKey that login returns. Nothing here
// touches the password, so a public instance never asks for one.
function stopLink() {
  if (linkTimer) {
    clearTimeout(linkTimer)
    linkTimer = null
  }
  linkGeneration += 1
}

async function startLink() {
  stopLink()
  const generation = linkGeneration
  link.value = null
  linkError.value = ''
  linkBusy.value = true
  linkState.value = 'Requesting a code…'
  try {
    const created = await createLinkCode()
    if (generation !== linkGeneration) return
    link.value = created
    linkState.value = 'Waiting for confirmation…'
    linkDeadline = Date.now() + LINK_TTL_MS
    linkTimer = setTimeout(() => pollLink(generation, created.code), LINK_POLL_MS)
  } catch (e) {
    if (generation !== linkGeneration) return
    linkState.value = ''
    linkError.value = 'Could not get a code: ' + e.message
  } finally {
    if (generation === linkGeneration) linkBusy.value = false
  }
}

async function pollLink(generation, code) {
  if (generation !== linkGeneration) return
  if (Date.now() > linkDeadline) {
    // the code is dead: drop it and give the button back instead of showing a stale code
    link.value = null
    linkState.value = 'The code expired. Press the button for a new one.'
    return
  }
  try {
    const authKey = await readLinkCode(code)
    if (generation !== linkGeneration) return
    if (authKey) {
      linkState.value = 'Signed in.'
      stopLink()
      key.value = authKey
      keepKey()
      await load()
      return
    }
  } catch (e) {
    if (generation !== linkGeneration) return
    // a network hiccup should not kill the flow: report it and keep asking
    linkState.value = 'Waiting for confirmation… (' + e.message + ')'
  }
  linkTimer = setTimeout(() => pollLink(generation, code), LINK_POLL_MS)
}

async function doLogin() {
  error.value = ''
  busy.value = 'Signing in…'
  try {
    if (!email.value || !password.value) throw new Error('e-mail and password are required')
    key.value = await login(email.value.trim(), password.value)
    password.value = ''
    keepKey()
    await load()
  } catch (e) {
    error.value = 'Sign-in failed: ' + e.message
  } finally {
    busy.value = ''
  }
}

function keepKey() {
  if (remember.value) localStorage.setItem(KEY_STORE, key.value)
  else sessionStorage.setItem(KEY_STORE, key.value)
}

function forget() {
  stopLink()
  localStorage.removeItem(KEY_STORE)
  sessionStorage.removeItem(KEY_STORE)
  key.value = ''
  addons.value = []
  saved.value = []
  baseline.value = ''
  notice.value = ''
  error.value = ''
  link.value = null
  linkState.value = ''
  linkError.value = ''
  if (authMode.value === 'link') startLink()
}

async function load() {
  error.value = ''
  notice.value = ''
  busy.value = 'Loading addons…'
  try {
    const result = await getCollection(key.value)
    if (!result.addons.length) throw new Error('no addons found — this does not look like a Stremio account')
    addons.value = clone(result.addons)
    saved.value = clone(result.addons)
    baseline.value = snapshot()
    rememberOrigin(addons.value)
    result.addons.forEach((addon) => refreshLogo(addon))
    notice.value = `Loaded ${result.addons.length} addons`
  } catch (e) {
    error.value = 'Could not load addons: ' + e.message
  } finally {
    busy.value = ''
  }
}

async function refreshLogo(addon) {
  const t = addon.transportUrl
  if (logos[t] !== undefined) return
  logos[t] = null
  try {
    logos[t] = await resolveLogo(addon)
  } catch {
    logos[t] = null
  }
}

async function save() {
  if (busy.value) return
  if (!addons.value.length) return
  const hidden = addons.value.filter((a) => addonBoardState(a).state === 'hidden').length
  const summary = [
    `Addons: ${addons.value.length}`,
    `Hidden from Home: ${hidden}`,
    backupOnSave.value
      ? 'Backup: the collection as it is in your account now'
      : 'Backup: none',
    'Continue?',
  ].join('\n')
  if (!confirm(summary)) return

  error.value = ''
  notice.value = ''
  busy.value = 'Saving…'
  try {
    if (backupOnSave.value && saved.value.length) exportBackup(saved.value, 'before')
    const payload = clone(addons.value)
    await setCollection(key.value, payload)
    const check = await getCollection(key.value)
    const orderOk = check.addons.map((a) => a.transportUrl).join('\n') === payload.map((a) => a.transportUrl).join('\n')
    const hiddenExpected = payload.filter((a) => addonBoardState(a).state === 'hidden').length
    const hiddenActual = check.addons.filter((a) => addonBoardState(a).state === 'hidden').length
    addons.value = clone(check.addons)
    saved.value = clone(check.addons)
    baseline.value = snapshot()
    check.addons.forEach((addon) => refreshLogo(addon))
    if (!orderOk) {
      notice.value = 'Saved, but the order differs after re-reading — check the addons.'
    } else if (hiddenExpected !== hiddenActual) {
      notice.value = `Order saved, but the Home markers did not stick (${hiddenExpected} → ${hiddenActual}): the server refetched the manifests.`
    } else {
      notice.value = `Saved and verified: ${check.addons.length} addons, order and Home state match.`
    }
  } catch (e) {
    error.value = 'Save failed: ' + e.message
  } finally {
    busy.value = ''
  }
}

function move(from, to) {
  if (from === null || to === null || from === to) return
  const list = toRaw(addons.value).slice()
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  addons.value = list
}

function onDragStart(index, event) {
  dragIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  try {
    event.dataTransfer.setData('text/plain', String(index))
  } catch {
    /* Safari */
  }
}

function onDrop(index) {
  move(dragIndex.value, index)
  dragIndex.value = null
}

// A controlled checkbox does not re-render when a click changes nothing, so the tick
// the browser drew stays on screen and the row lies about its state. Put the DOM back
// in line with the model after every click.
function syncBox(event, state) {
  const box = event && event.target
  if (!box) return
  box.checked = state === 'hidden'
  box.indeterminate = state === 'partial'
}

function toggleBoard(addon, event) {
  setAddonFromOrigin(addon, origin[addon.transportUrl])
  syncBox(event, addonBoardState(addon).state)
}

function catalogKey(catalog, index) {
  return `${catalog.type}/${catalog.id}#${index}`
}

function catalogStatus(addon, catalog, index) {
  const blocked = blockingExtra(catalog)
  if (blocked) return { tone: 'muted', text: `needs ${blocked}` }
  const onBoard = isOnBoard(catalog)
  const was = originFlag(addon, index)
  if (!canToggle(catalog)) return { tone: 'muted', text: 'no genre/search' }
  if (!onBoard && !was) return { tone: 'muted', text: 'hidden by addon' }
  if (!onBoard && was) return { tone: 'warn', text: 'hidden by you' }
  if (onBoard && !was) return { tone: 'warn', text: 'shown by you' }
  return { tone: 'ok', text: 'on Home' }
}

function toggleCatalog(addon, catalog, event) {
  if (!canToggle(catalog)) return
  setOnBoard(catalog, !isOnBoard(catalog))
  const box = event && event.target
  if (box) box.checked = isOnBoard(catalog)
}

function toggleExpanded(addon) {
  const key = addon.transportUrl
  expanded[key] = !expanded[key]
}

function stateOf(addon) {
  return addonBoardState(addon)
}

function risksOf(addon) {
  return riskyCatalogs(addon).map((c) => `${c.type}/${c.id}`)
}

function searchOnly(addon) {
  const cats = catalogsOf(addon).filter(canToggle)
  return cats.length > 0 && cats.every((c) => toggleKind(c) === 'search')
}

function exportBackup(list, stage) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stremio-addons-${stage}-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function pickRestore() {
  fileInput.value?.click()
}

async function restoreFile(event) {
  if (busy.value) return
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''
  try {
    const parsed = JSON.parse(await file.text())
    const list = Array.isArray(parsed) ? parsed : parsed.addons
    if (!Array.isArray(list) || list.length === 0) throw new Error('the file has no addon array')
    if (!list.every((a) => a.transportUrl && a.manifest && a.manifest.name && a.manifest.version)) {
      throw new Error('this is not a Stremio addon list')
    }
    if (!confirm(`Restore from ${file.name}?\nThe current addon order will be replaced.`)) return
    busy.value = 'Restoring…'
    await setCollection(key.value, list)
    await load()
    notice.value = 'Collection restored from file.'
  } catch (e) {
    error.value = 'Restore failed: ' + e.message
  } finally {
    busy.value = ''
  }
}

function flagText(addon) {
  const flags = addon.flags || {}
  const list = []
  if (flags.protected) list.push('protected')
  if (flags.official) list.push('official')
  return list.join(', ')
}
</script>

<template>
  <main class="page">
    <header class="head">
      <div class="brand">
        <span class="mark" aria-hidden="true">SAM</span>
        <div>
          <h1>SAM</h1>
          <p class="sub">Order and Home visibility for your Stremio addons. Changes are written straight to your account.</p>
        </div>
      </div>
      <button v-if="loggedIn" class="ghost" @click="forget">Sign out</button>
    </header>

    <p v-if="error" class="banner err">{{ error }}</p>
    <p v-if="notice" class="banner ok">{{ notice }}</p>
    <p v-if="busy" class="banner busy">{{ busy }}</p>

    <p v-if="!loggedIn" class="disclaimer">
      <template v-if="authMode === 'link'">
        SAM keeps no data on a server. The sign-in code is confirmed on stremio.com, so your Stremio password is never
        entered here; the session key stays in this browser only — in session storage, or in local storage if you tick
        “keep me signed in”. No cookies are set; clearing site data signs you out.
      </template>
      <template v-else>
        SAM keeps no data on a server. Your Stremio session lives in this browser only — in session storage, or in local
        storage if you tick “keep me signed in”. No cookies are set; clearing site data signs you out.
      </template>
    </p>

    <section v-if="!loggedIn" class="card auth">
      <h2>{{ authMode === 'link' ? 'Sign in with a code' : 'Sign in' }}</h2>

      <template v-if="authMode === 'link'">
        <p class="hint link-intro">
          Press GET THE CODE, then scan or click the QR code and confirm on Stremio; this page picks up the
          sign-in by itself.
        </p>
        <div v-if="!link" class="link-idle">
          <button class="primary big" :disabled="linkBusy" @click="startLink">GET THE CODE</button>
        </div>
        <div v-if="link" class="link-box">
          <div class="link-code">{{ link.code }}</div>
          <a
            v-if="link.qrcode"
            class="link-qr-link"
            :href="link.link"
            target="_blank"
            rel="noopener noreferrer"
            title="Open the Stremio sign-in page"
          >
            <img class="link-qr" :src="link.qrcode" alt="QR code for the Stremio sign-in link" />
          </a>
        </div>
        <p v-if="linkError" class="banner err">{{ linkError }}</p>
        <p v-if="linkState" class="hint">{{ linkState }}</p>
      </template>

      <template v-else>
        <form class="row" @submit.prevent="doLogin">
          <input v-model="email" type="email" placeholder="Stremio e-mail" autocomplete="username" />
          <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" />
          <button class="primary" type="submit">Sign in</button>
        </form>
        <p class="hint">Your password goes straight to <code>api.strem.io</code> and is never stored by this app.</p>
      </template>

      <label class="check"><input v-model="remember" type="checkbox" /> keep me signed in on this device</label>
    </section>

    <template v-else>
      <section class="toolbar">
        <button class="ghost" :disabled="!!busy" @click="load">Reload</button>
        <button class="ghost" :disabled="!!busy" @click="pickRestore">Restore from file</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="restoreFile" />
        <span class="spacer" />
        <label class="check backup">
          <input v-model="backupOnSave" type="checkbox" @change="setBackupPref" />
          Back up the order before saving
        </label>
        <span v-if="dirty" class="dirty">unsaved changes</span>
        <button class="primary" :disabled="!dirty || !!busy" @click="save">Save to Stremio</button>
      </section>

      <section class="list">
        <article
          v-for="(addon, index) in addons"
          :key="addon.transportUrl"
          class="card addon"
          :class="{ dragging: dragIndex === index }"
          draggable="true"
          @dragstart="onDragStart(index, $event)"
          @dragover.prevent
          @drop.prevent="onDrop(index)"
          @dragend="dragIndex = null"
        >
          <div class="grip" title="Drag to reorder">⠿</div>
          <div class="num">{{ index + 1 }}</div>
          <div class="logo">
            <img v-if="logos[addon.transportUrl]" :src="logos[addon.transportUrl]" alt="" @error="logos[addon.transportUrl] = null" />
            <span v-else class="mono">{{ monogram(addon) }}</span>
          </div>
          <div class="info">
            <div class="title">
              {{ addon.manifest.name }}
              <span class="ver">{{ addon.manifest.version }}</span>
              <span v-if="flagText(addon)" class="flags">{{ flagText(addon) }}</span>
            </div>
            <div class="meta">
              {{ catalogsOf(addon).length }} catalogs
              <span v-if="stateOf(addon).toggleable">
                · {{ stateOf(addon).toggleable }} can be hidden
              </span>
              <span v-if="risksOf(addon).length" class="warn" :title="'filter has no options: ' + risksOf(addon).join(', ')">
                ⚠ may fail to load
              </span>
              <span v-if="searchOnly(addon)" class="warn" title="The catalogs have no genre, only search: once hidden they stay in search but leave Discover">
                · will move from Discover to search
              </span>
            </div>
            <button class="linkish" :aria-expanded="!!expanded[addon.transportUrl]" @click.stop="toggleExpanded(addon)">
              {{ expanded[addon.transportUrl] ? 'Hide catalogs' : `Show catalogs (${catalogsOf(addon).length})` }}
            </button>
          </div>
          <label class="check board" :class="{ disabled: stateOf(addon).state === 'none' }">
            <input
              type="checkbox"
              :checked="stateOf(addon).state === 'hidden'"
              :indeterminate.prop="stateOf(addon).state === 'partial'"
              :disabled="stateOf(addon).state === 'none'"
              @change="toggleBoard(addon, $event)"
            />
            hide from Home
          </label>
          <div v-if="expanded[addon.transportUrl]" class="catalogs">
            <div v-for="(catalog, ci) in catalogsOf(addon)" :key="catalogKey(catalog, ci)" class="catalog-row">
              <label class="check" :class="{ disabled: !canToggle(catalog) }">
                <input
                  type="checkbox"
                  :checked="isOnBoard(catalog)"
                  :disabled="!canToggle(catalog)"
                  @change="toggleCatalog(addon, catalog, $event)"
                />
                <span class="cname">{{ catalog.name || catalog.id }}</span>
              </label>
              <span class="ctype">{{ catalog.type }}/{{ catalog.id }}</span>
              <span class="cstate" :class="catalogStatus(addon, catalog, ci).tone">
                {{ catalogStatus(addon, catalog, ci).text }}
              </span>
            </div>
          </div>
        </article>
      </section>

      <p class="hint foot">
        The checkbox edits the catalog manifest stored with the addon: a catalog with a required filter is skipped by the
        Home board but stays in Discover (as a dropdown filter) and in search. Only catalogs that already declare
        <code>genre</code> or <code>search</code> can be hidden; for the rest the checkbox stays disabled — otherwise the
        addon would start receiving a filter it does not understand, and a row marked <em>needs …</em> keeps another
        required filter that decides the board on its own. Rows marked <em>hidden by addon</em> were shipped that way by
        the addon itself; unchecking an addon restores every catalog to the state it had when the addons were loaded, so
        the addon's own choices survive. If the addon was already fully off the board at that moment — which is what a
        save from this app leaves behind — unchecking shows all of its catalogs instead, since there is nothing left to
        restore.
      </p>
    </template>

    <footer class="foot-brand">
      <span class="foot-copy">© CrossNetwork</span>
      <span class="foot-note">SAM - Addons Manager for Stremio. SAM is not affiliated with Stremio in any way.</span>
      <a class="foot-link" href="https://github.com/SKBlacksmith/sam" target="_blank" rel="noopener noreferrer">Source Code</a>
      <span class="ver-tag">v{{ version }}</span>
    </footer>
  </main>
</template>
