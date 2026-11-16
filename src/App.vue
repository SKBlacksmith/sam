<script setup>
import { computed, onMounted, reactive, ref, toRaw } from 'vue'
import { login, getCollection, setCollection } from './api.js'
import { addonBoardState, setAddonOnBoard, riskyCatalogs, catalogsOf, isOnBoard, canToggle, toggleKind } from './board.js'
import { resolveLogo, monogram } from './logo.js'

const KEY_STORE = 'sam.authKey'
const key = ref('')
const remember = ref(false)
const authKeyInput = ref('')
const email = ref('')
const password = ref('')

const addons = ref([])
const baseline = ref('')
const logos = reactive({})
const busy = ref('')
const error = ref('')
const notice = ref('')
const dragIndex = ref(null)
const fileInput = ref(null)

const loggedIn = computed(() => key.value.length > 0)
const dirty = computed(() => addons.value.length > 0 && snapshot() !== baseline.value)

function clone(value) {
  // Vue wraps component state in Proxy objects and structuredClone() refuses to clone a
  // proxy (DataCloneError). toRaw() unwraps the outer proxy; the collection itself is
  // plain JSON freshly parsed from the API, so the raw value is safely cloneable.
  return structuredClone(toRaw(value))
}

function snapshot() {
  return JSON.stringify(
    addons.value.map((a) => ({ t: a.transportUrl, h: catalogsOf(a).map(isOnBoard) })),
  )
}

function detectKey() {
  const stored = localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || ''
  if (stored) {
    key.value = stored
    remember.value = !!localStorage.getItem(KEY_STORE)
  }
}

onMounted(() => {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    import('./fixture.js').then(({ demoAddons }) => {
      key.value = 'demo'
      addons.value = clone(demoAddons)
      baseline.value = snapshot()
      addons.value.forEach((addon) => refreshLogo(addon))
    })
    return
  }
  detectKey()
  if (key.value) load()
})

async function doLogin() {
  error.value = ''
  busy.value = 'Signing in…'
  try {
    if (!email.value || !password.value) throw new Error('e-mail and password are required, or paste an authKey')
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

function useKey() {
  const value = authKeyInput.value.replaceAll('"', '').trim()
  if (!value) {
    error.value = 'Empty authKey'
    return
  }
  key.value = value
  authKeyInput.value = ''
  keepKey()
  load()
}

function keepKey() {
  if (remember.value) localStorage.setItem(KEY_STORE, key.value)
  else sessionStorage.setItem(KEY_STORE, key.value)
}

function forget() {
  localStorage.removeItem(KEY_STORE)
  sessionStorage.removeItem(KEY_STORE)
  key.value = ''
  addons.value = []
  baseline.value = ''
  notice.value = ''
  error.value = ''
}

async function load() {
  error.value = ''
  notice.value = ''
  busy.value = 'Loading collection…'
  try {
    const result = await getCollection(key.value)
    if (!result.addons.length) throw new Error('the collection is empty — this does not look like a Stremio account')
    addons.value = clone(result.addons)
    baseline.value = snapshot()
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
  if (!addons.value.length) return
  const hidden = addons.value.filter((a) => addonBoardState(a).state === 'hidden').length
  const summary = [
    `Addons: ${addons.value.length}`,
    `Hidden from Home: ${hidden}`,
    'A copy of the current collection will be downloaded before writing.',
    'Continue?',
  ].join('\n')
  if (!confirm(summary)) return

  error.value = ''
  notice.value = ''
  busy.value = 'Saving…'
  try {
    exportBackup('before')
    const payload = clone(addons.value)
    await setCollection(key.value, payload)
    const check = await getCollection(key.value)
    const orderOk = check.addons.map((a) => a.transportUrl).join('\n') === payload.map((a) => a.transportUrl).join('\n')
    const hiddenExpected = payload.filter((a) => addonBoardState(a).state === 'hidden').length
    const hiddenActual = check.addons.filter((a) => addonBoardState(a).state === 'hidden').length
    addons.value = clone(check.addons)
    baseline.value = snapshot()
    check.addons.forEach((addon) => refreshLogo(addon))
    if (!orderOk) {
      notice.value = 'Saved, but the order differs after re-reading — check the collection.'
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
  const list = addons.value.slice()
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

function toggleBoard(addon) {
  const state = addonBoardState(addon)
  setAddonOnBoard(addon, state.state === 'hidden')
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

function exportBackup(stage) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const blob = new Blob([JSON.stringify(addons.value, null, 2)], { type: 'application/json' })
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
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''
  try {
    const parsed = JSON.parse(await file.text())
    const list = Array.isArray(parsed) ? parsed : parsed.addons
    if (!Array.isArray(list) || list.length === 0) throw new Error('the file has no addon array')
    if (!list.every((a) => a.transportUrl && a.manifest)) throw new Error('this is not a Stremio collection')
    if (!confirm(`Restore from ${file.name}? The current collection will be replaced.`)) return
    busy.value = 'Restoring…'
    exportBackup('before-restore')
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
          <p class="sub">Addons Manager for Stremio — order, logos and Home visibility. The collection is written straight to your account.</p>
        </div>
      </div>
      <button v-if="loggedIn" class="ghost" @click="forget">Sign out</button>
    </header>

    <p v-if="error" class="banner err">{{ error }}</p>
    <p v-if="notice" class="banner ok">{{ notice }}</p>
    <p v-if="busy" class="banner busy">{{ busy }}</p>

    <section v-if="!loggedIn" class="card auth">
      <h2>Sign in</h2>
      <form class="row" @submit.prevent="doLogin">
        <input v-model="email" type="email" placeholder="Stremio e-mail" autocomplete="username" />
        <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" />
        <button class="primary" type="submit">Sign in</button>
      </form>
      <p class="hint">The password goes straight to <code>api.strem.io</code> and is never stored. Alternatively, paste a session key from
        <code>web.stremio.com</code>: <code>JSON.parse(localStorage.getItem("profile")).auth.key</code>.</p>
      <form class="row" @submit.prevent="useKey">
        <input v-model="authKeyInput" type="password" placeholder="authKey" autocomplete="off" />
        <button class="ghost" type="submit">Use key</button>
      </form>
      <label class="check"><input v-model="remember" type="checkbox" /> remember the key on this device</label>
    </section>

    <template v-else>
      <section class="toolbar">
        <button class="ghost" :disabled="!!busy" @click="load">Reload</button>
        <button class="ghost" :disabled="!!busy" @click="pickRestore">Restore from file</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="restoreFile" />
        <span class="spacer" />
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
          </div>
          <label class="check board" :class="{ disabled: stateOf(addon).state === 'none' }">
            <input
              type="checkbox"
              :checked="stateOf(addon).state === 'hidden'"
              :indeterminate.prop="stateOf(addon).state === 'partial'"
              :disabled="stateOf(addon).state === 'none'"
              @change="toggleBoard(addon)"
            />
            hide from Home
          </label>
        </article>
      </section>

      <p class="hint foot">
        The checkbox edits the catalog manifest inside the collection: a catalog with a required filter is skipped by the
        Home board but stays in Discover (as a dropdown filter) and in search. Only catalogs that already declare
        <code>genre</code> or <code>search</code> can be hidden; for the rest the checkbox stays disabled — otherwise the
        addon would start receiving a filter it does not understand.
      </p>
    </template>

    <footer class="foot-brand">SAM - Addons Manager for Stremio by CrossNetwork.</footer>
  </main>
</template>
