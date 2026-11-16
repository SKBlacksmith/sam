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
  host `favicon.ico` → monogram tile. Results are cached for a week in `localStorage`.
- **Hide from Home** — a per-addon checkbox. It flips `isRequired` on an existing
  `genre` (preferred) or `search` extra of each catalog. A catalog with a required extra
  is never requested with an empty extra, so the board skips it while Discover keeps it
  (with a filter dropdown). Catalogs without `genre`/`search` cannot be toggled — the
  checkbox stays disabled instead of inventing a filter the addon does not understand.
- **Safety** — a JSON copy of the current collection is downloaded before every write;
  the collection can be restored from such a file; after saving the app re-reads the
  collection and verifies order and board state.

## Build

```sh
npm install
npm run build      # dist/
npm run dev        # http://127.0.0.1:5173
```

`?demo` with `npm run dev` loads a local fixture (Cinemeta manifest + two synthetic
addons) for layout checks; production builds do not include it.

## Run

Serve `dist/` over HTTP, e.g. the bundled `compose.yaml` (nginx on port `8095`). Keep it
LAN-only: the browser session is password-equivalent for the account's addon collection.
`docker compose up -d --build` builds `sam:1.0.1` and serves it.

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

MIT — see `LICENSE` and `NOTICE.md`.

---

SAM - Addons Manager for Stremio by CrossNetwork.
