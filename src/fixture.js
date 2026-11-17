// Dev-only fixture for visual checks (`?demo` with `npm run dev`). Never used in a build.
import cinemeta from './cinemeta-demo.json'

const cinemetaAddon = {
  transportUrl: 'https://v3-cinemeta.strem.io/',
  manifest: cinemeta,
  flags: { official: true, protected: true },
}

const plain = {
  transportUrl: 'https://example.org/addon/',
  manifest: {
    id: 'org.example.plain',
    version: '1.2.0',
    name: 'Plain streams',
    description: 'No catalog declarations at all',
    types: ['movie'],
    resources: ['stream'],
    catalogs: [],
    behaviorHints: { configurable: true },
  },
  flags: { official: false, protected: false },
}

const searchOnly = {
  transportUrl: 'https://example.net/search/',
  manifest: {
    id: 'org.example.search',
    version: '0.9.1',
    name: 'Search-only catalog',
    types: ['series'],
    resources: ['catalog'],
    catalogs: [
      { type: 'series', id: 'search', name: 'Search results', extra: [{ name: 'search', isRequired: false }] },
      { type: 'series', id: 'no-extra', name: 'Bare catalog' },
    ],
    behaviorHints: {},
  },
  flags: { official: false, protected: false },
}

const allHidden = {
  transportUrl: 'https://example.com/hidden/',
  manifest: {
    id: 'org.example.hidden',
    version: '2.0.0',
    name: 'Every catalog hidden by the addon',
    description: 'Both catalogs require genre — the state a save from SAM leaves behind',
    types: ['movie'],
    resources: ['catalog'],
    catalogs: [
      { type: 'movie', id: 'new', name: 'New', extra: [{ name: 'genre', isRequired: true, options: ['2026'] }] },
      { type: 'movie', id: 'year', name: 'By year', extra: [{ name: 'genre', isRequired: true, options: ['2025'] }] },
    ],
    behaviorHints: {},
  },
  flags: { official: false, protected: false },
}

const blocked = {
  transportUrl: 'https://example.com/blocked/',
  manifest: {
    id: 'org.example.blocked',
    version: '1.0.0',
    name: 'Blocked by another filter',
    description: 'skip is required, so genre cannot put the catalog back on the board',
    types: ['series'],
    resources: ['catalog'],
    catalogs: [
      { type: 'series', id: 'paged', name: 'Paged', extra: [{ name: 'skip', isRequired: true }, { name: 'genre', options: ['Drama'] }] },
    ],
    behaviorHints: {},
  },
  flags: { official: false, protected: false },
}

export const demoAddons = [cinemetaAddon, plain, searchOnly, allHidden, blocked]
