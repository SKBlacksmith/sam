# SAM — Addons Manager for Stremio

SAM is a small, self-hosted web app for a Stremio account: reorder installed addons and
hide an addon's catalogs from the Home board while keeping them in Discover.

No backend, no telemetry, no external CDNs: a static SPA talking to `api.strem.io`
straight from the browser (the API allows any origin).

## What it does

- **Sign-in modes** — the image is one artifact for two instances; `SAM_AUTH` decides how
  people sign in (see [Sign-in modes](#sign-in-modes)). A public instance never renders a
  password field.
- **Login** — Stremio e-mail and password (`/api/login`) on a private instance, or a
  device-link code on a public one; the session key the API returns stays in this browser and
  is never sent anywhere else.
- **Order** — drag rows; the array order in the addon collection is the row order on Home.
- **Hide from Home** — a per-addon checkbox. It flips `isRequired` on an existing
  `genre` (preferred) or `search` extra of each catalog. A catalog with a required extra
  is never requested with an empty extra, so the board skips it while Discover keeps it
  (with a filter dropdown). Catalogs without `genre`/`search` cannot be toggled — the
  checkbox stays disabled instead of inventing a filter the addon does not understand.
- **Per-catalog list** — expand an addon to see every catalog and its state (`on Home`,
  `hidden by addon`, `hidden by you`, `shown by you`); unchecking the addon returns each
  catalog to the state it had before you touched it. When the addon was already fully off
  the board at load time — the state a save from SAM leaves behind — there is nothing to
  restore, so unchecking shows all of its catalogs.
- **Safety** — an optional JSON copy of the current setup is downloaded before saving
  (on by default), a file like that can be restored later, and after saving the app
  re-reads the account and verifies order and Home state.

## Sign-in modes

One image runs both instances. `SAM_AUTH` is read at container start and written into
`config.json`, which the app fetches before it draws the sign-in screen — nothing is rebuilt.

- **`password`** (default) — the app asks for the Stremio e-mail and password and sends them
  straight to `api.strem.io`; the session key stays in the browser. Meant for a private,
  LAN-only instance: that key is as good as the account password for the addon API.
- **`link`** — device-link sign-in. Nothing is requested from Stremio on page load: the card
  shows a single **GET THE CODE** button, and only pressing it calls
  `link.stremio.com/api/v2/create`. The answer is shown as the code, a clickable QR and the
  link; the person confirms it on stremio.com, and the app collects the session key by
  polling (`link.stremio.com/api/v2/read`). No password field is rendered at all, so a public
  instance never asks for a Stremio password.

```sh
# private instance (default)
docker run -d --name sam -p 8095:80 ghcr.io/skblacksmith/sam:latest

# public instance: same image, different mode, loopback behind a reverse proxy
docker run -d --name sam -p 127.0.0.1:8096:80 -e SAM_AUTH=link ghcr.io/skblacksmith/sam:latest
```

With compose, set it in the service environment:

```yaml
environment:
  SAM_AUTH: link
```

Without Docker, serve `dist/` with any static server and write `config.json` next to
`index.html` (`{"auth":"link"}` or `{"auth":"password"}`); an invalid or missing file falls
back to `password`.

Both modes end with the same session key, so ordering, Home visibility, backup and restore
behave identically. The API answers "not confirmed yet" and "expired" with the same error, so
the page waits five minutes and then offers a new code.

## Requirements

- Node.js 22 or newer with npm — only to build from source;
- Docker with Compose v2 — for the container.

## Build from source

```sh
npm ci
npm run build      # -> dist/
npm run dev        # http://127.0.0.1:5173
```

`?demo` under `npm run dev` loads a local fixture (the Cinemeta manifest plus synthetic
addons covering every catalog state) for layout checks, and `?auth=link` previews the public
sign-in mode; production builds include neither.

Container built locally:

```sh
docker build -t sam:latest .
docker run -d --name sam -p 8095:80 --restart unless-stopped sam:latest
```

`docker compose up -d --build` does the same and picks up the compose file in this repo.

## Run the published image

Every git tag `v*` publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to the
GitHub Container Registry:

```sh
docker run -d --name sam -p 8095:80 --restart unless-stopped ghcr.io/skblacksmith/sam:latest
```

`latest` moves to the newest release on every tag; pin a version tag instead when you need one
frozen build.

Or copy `compose.yaml`, adjust the port binding, and run:

```sh
docker compose up -d
```

The compose file points at the published image; there is no build step and no Node.js on
the host. Set `build: .` (and drop `image:`) to build a local checkout instead.

## Known limits

- The Home toggle edits manifests, not addon servers: streams still come from the addon.
- A required `genre` with an empty `options` list may break that catalog — the UI warns.
- `search`-only catalogs leave Discover and stay reachable through Search.
- A catalog marked `needs …` keeps another required filter (`skip`, ids): `genre`/`search`
  cannot override it, so the catalog stays off the board and its checkbox is disabled.
- Stremio may refresh manifests on login (`addonCollectionGet` with `update: true`);
  the app reports it if the saved board state does not survive the re-read.

## Public instance

The app is static and stores nothing on the server, so it can sit behind Caddy or nginx.
TLS is mandatory: the sign-in form receives a Stremio password and the session key lives
in the browser.

## License

GNU Affero General Public License v3.0 or later — see `LICENSE`. The AGPL covers network
use: if you run a modified version as a service, you must offer its source to the users of
that service. Bundled dependencies (Vue, Vite) are MIT and compatible with the AGPL; see
`NOTICE.md`.

---

SAM - Addons Manager for Stremio by CrossNetwork.
