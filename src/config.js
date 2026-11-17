// Runtime configuration.
//
// One image serves two instances: the entrypoint writes config.json from SAM_AUTH, and
// the SPA reads it before showing the sign-in screen. A public instance runs with
// `link` — the device-link flow, where the password is never entered on this page; a
// private one keeps `password`. The default is the private mode, so a container started
// without the variable behaves like every build before 1.1.0.

const AUTH_MODES = ['link', 'password']
const DEFAULT_AUTH = 'password'

export function normaliseAuth(value) {
  const mode = String(value ?? '').trim().toLowerCase()
  return AUTH_MODES.includes(mode) ? mode : DEFAULT_AUTH
}

export async function loadConfig() {
  // The query override is a development aid (`?demo&auth=link`), never part of a build:
  // a public instance must not offer the password form just because someone asked for it.
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get('auth')
    if (override) return { auth: normaliseAuth(override) }
  }
  try {
    const resp = await fetch('config.json', { cache: 'no-store' })
    if (!resp.ok) return { auth: DEFAULT_AUTH }
    const data = await resp.json()
    return { auth: normaliseAuth(data.auth) }
  } catch {
    return { auth: DEFAULT_AUTH }
  }
}
