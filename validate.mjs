#!/usr/bin/env node
// Validates catalogs/*.json. Run standalone (`node validate.mjs`) or as the first
// step of CI, before either generator runs.

import { load, SpecError } from './tools/spec.mjs'

try {
  const { catalogs } = load()
  const entries = catalogs.reduce((n, c) => n + c.entries.length, 0)
  console.log(`ok — ${catalogs.length} catalog(s), ${entries} entries`)
  for (const c of catalogs) {
    const cat = c.sunatCatalog === null ? 'perunio-internal' : `Cat.${c.sunatCatalog}`
    console.log(`  ${c.id.padEnd(10)} ${String(c.entries.length).padStart(3)} entries  ${cat} — ${c.name}`)
  }
} catch (err) {
  if (err instanceof SpecError) {
    console.error(err.message)
    process.exit(1)
  }
  throw err
}
