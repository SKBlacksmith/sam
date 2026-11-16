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

export const demoAddons = [cinemetaAddon, plain, searchOnly]
