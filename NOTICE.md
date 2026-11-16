# External components and licensing

SAM is licensed under the GNU Affero General Public License v3.0 or later. The AGPL adds
a network clause: if a modified version is run as a service, its source must be offered
to the users of that service (section 13).

This project is an independent implementation. It contains no code from
`pancake3000/stremio-addon-manager` or `redd-ravenn/stremio-addon-manager`.

Runtime and build dependencies:

| Component | Version | License | Use |
|---|---|---|---|
| Vue | 3.5.x | MIT | UI framework |
| Vite | 7.x | MIT | build tool |
| @vitejs/plugin-vue | 6.x | MIT | SFC compilation |

Protocol facts (endpoints, manifest fields, board behaviour) were derived from the
public Stremio sources: `Stremio/stremio-core`, `Stremio/stremio-web`,
`Stremio/stremio-addon-sdk`. No code is copied from them; the behaviour is documented
in `src/board.js`.

`api.strem.io` is a third-party service used at runtime; this project is not
affiliated with Stremio.

MIT and the AGPL are compatible in this direction: MIT-licensed code can be distributed
as part of an AGPL-licensed work, as long as the MIT notices are kept.
