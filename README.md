# SAM — Addons Manager for Stremio

SAM is a small, self-hosted web app for a Stremio account: reorder installed addons,
repair broken addon icons, and hide an addon's catalogs from the Home board while
keeping them in Discover. The letter mark and footer are part of the brand:
`SAM - Addons Manager for Stremio by CrossNetwork.`

No backend, no telemetry, no external CDNs: a static SPA talking to `api.strem.io`
straight from the browser (the API allows any origin).

## What it does

- **Login** with the Stremio e-mail and password (`/api/login`); the session key the API
  returns stays in this browser and is never sent anywhere else.
- **Order** — drag rows; the array order in the addon collection is the row order on Home.
- **Logos** — the stored manifest is a snapshot and often has no `logo`, a dead URL or a
  relative path. Resolution chain: stored logo → live `<transportUrl>/manifest.json` →
  host `favicon.ico` → monogram tile. Hits are cached for a week in `localStorage`,
  failures for 15 minutes so a fixed icon shows up without waiting.
- **Hide from Home** — a per-addon checkbox. It flips `isRequired` on an existing
  `genre` (preferred) or `search` extra of each catalog. A catalog with a required extra
  is never requested with an empty extra, so the board skips it while Discover keeps it
  (with a filter dropdown). Catalogs without `genre`/`search` cannot be toggled — the
  checkbox stays disabled instead of inventing a filter the addon does not understand.
- **Per-catalog list** — expand an addon to see every catalog and its state (`on Home`,
  `hidden by addon`, `hidden by you`, `shown by you`); unchecking the addon returns each
  catalog to the state it had before you touched it.
- **Safety** — an optional JSON copy of the current setup is downloaded before saving
  (on by default), a file like that can be restored later, and after saving the app
  re-reads the account and verifies order and Home state.

## Requirements

- Node.js 22 or newer with npm — only to build from source;
- Docker with Compose v2 — for the container.

## Build from source

```sh
npm ci
npm run build      # -> dist/
npm run dev        # http://127.0.0.1:5173
```

`?demo` under `npm run dev` loads a local fixture (Cinemeta manifest and two synthetic
addons) for layout checks; production builds do not include it.

Container built locally:

```sh
docker build -t sam:1.0.2 .
docker run -d --name sam -p 8095:80 --restart unless-stopped sam:1.0.2
```

`docker compose up -d --build` does the same and picks up the compose file in this repo.

## Run the published image

Every git tag `v*` publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to the
GitHub Container Registry:

```sh
docker run -d --name sam -p 8095:80 --restart unless-stopped ghcr.io/skblacksmith/sam:1.0.2
```

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
