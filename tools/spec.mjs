// Loads and validates the catalog spec. Both generators import this so the spec
// is parsed and checked exactly once, in one place, with one set of rules.
//
// Hand-rolled rather than pulling in ajv: the repo ships as a dependency to three
// services and a zero-dependency package is one less thing for them to resolve.
// meta/catalog.schema.json stays a real JSON Schema so editors validate live.

import { readdirSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

const ENTRY_KEYS = ['code', 'label', 'description', 'capabilities', 'flags', 'props', 'goName']
const FILE_KEYS = ['$schema', 'id', 'sunatCatalog', 'name', 'source', 'codePattern', 'propRefs', 'entries']
const REQUIRED_FILE_KEYS = ['id', 'sunatCatalog', 'name', 'source', 'codePattern', 'entries']

/** Thrown with every problem found, not just the first. */
export class SpecError extends Error {
  constructor(problems) {
    super(`spec validation failed:\n  ${problems.join('\n  ')}`)
    this.name = 'SpecError'
    this.problems = problems
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Read, validate and enrich every catalog.
 * @returns {{catalogs: Catalog[], capabilities: Record<string,string>}}
 */
export function load(repoRoot = REPO_ROOT) {
  const problems = []
  const capabilities = JSON.parse(readFileSync(join(repoRoot, 'meta/capabilities.json'), 'utf8'))
  const knownCaps = new Set(Object.keys(capabilities))

  const dir = join(repoRoot, 'catalogs')
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  if (files.length === 0) problems.push('catalogs/ contains no .json files')

  const catalogs = []
  for (const file of files) {
    const path = `catalogs/${file}`
    let raw
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch (err) {
      problems.push(`${path}: not valid JSON — ${err.message}`)
      continue
    }
    const cat = checkFile(raw, path, file, knownCaps, problems)
    if (cat) catalogs.push(cat)
  }

  // Cross-catalog references resolve only once every catalog is parsed.
  const byId = new Map(catalogs.map((c) => [c.id, c]))
  for (const cat of catalogs) {
    for (const [prop, targetId] of Object.entries(cat.propRefs)) {
      const target = byId.get(targetId)
      if (!target) {
        problems.push(`${cat.path}: propRefs.${prop} points at unknown catalog "${targetId}"`)
        continue
      }
      if (!cat.propKeys.includes(prop)) {
        problems.push(`${cat.path}: propRefs.${prop} is declared but no entry carries that prop`)
        continue
      }
      const valid = new Set(target.codes)
      for (const entry of cat.entries) {
        const value = entry.props[prop]
        if (value === null) continue // explicit "no reference" is allowed
        if (typeof value !== 'string' || !valid.has(value)) {
          problems.push(
            `${cat.path}: entry ${entry.code} prop ${prop}=${JSON.stringify(value)} is not a ${targetId} code`,
          )
        }
      }
    }
  }

  if (problems.length) throw new SpecError(problems)
  return { catalogs, capabilities }
}

function checkFile(raw, path, file, knownCaps, problems) {
  if (!isPlainObject(raw)) {
    problems.push(`${path}: top level must be an object`)
    return null
  }
  for (const key of Object.keys(raw)) {
    if (!FILE_KEYS.includes(key)) problems.push(`${path}: unknown top-level key "${key}"`)
  }
  for (const key of REQUIRED_FILE_KEYS) {
    if (!(key in raw)) problems.push(`${path}: missing required key "${key}"`)
  }

  const id = raw.id
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
    problems.push(`${path}: id must match /^[a-z][a-z0-9-]*$/`)
    return null
  }
  if (basename(file, '.json') !== id) {
    problems.push(`${path}: filename must match id ("${id}.json")`)
  }
  if (!(typeof raw.sunatCatalog === 'string' || raw.sunatCatalog === null)) {
    problems.push(`${path}: sunatCatalog must be a string or null`)
  }
  for (const key of ['name', 'source', 'codePattern']) {
    if (typeof raw[key] !== 'string' || raw[key].length === 0) {
      problems.push(`${path}: ${key} must be a non-empty string`)
    }
  }

  const propRefs = raw.propRefs ?? {}
  if (!isPlainObject(propRefs)) problems.push(`${path}: propRefs must be an object`)

  let codeRe = null
  if (typeof raw.codePattern === 'string') {
    if (!raw.codePattern.startsWith('^') || !raw.codePattern.endsWith('$')) {
      problems.push(`${path}: codePattern must be anchored with ^ and $`)
    }
    try {
      codeRe = new RegExp(raw.codePattern)
    } catch (err) {
      problems.push(`${path}: codePattern is not a valid regex — ${err.message}`)
    }
  }

  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    problems.push(`${path}: entries must be a non-empty array`)
    return null
  }

  // The first entry defines the shape every other entry must match. This is not
  // style: TypeScript infers an array's element type from its members, so a file
  // whose entries disagree about flag/prop keys generates a union type and every
  // `e.props.foo` call site fails to compile.
  const first = raw.entries[0]
  const flagKeys = isPlainObject(first?.flags) ? Object.keys(first.flags).sort() : []
  const propKeys = isPlainObject(first?.props) ? Object.keys(first.props).sort() : []

  const seen = new Set()
  const entries = []
  for (const [i, entry] of raw.entries.entries()) {
    const at = `${path}: entry ${i} (${entry?.code ?? '?'})`
    if (!isPlainObject(entry)) {
      problems.push(`${at}: must be an object`)
      continue
    }
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}"`)
    }
    for (const key of ENTRY_KEYS) {
      if (!(key in entry)) problems.push(`${at}: missing required key "${key}"`)
    }

    if (typeof entry.code !== 'string' || entry.code.length === 0) {
      problems.push(`${at}: code must be a non-empty string`)
    } else {
      if (codeRe && !codeRe.test(entry.code)) {
        problems.push(`${at}: code does not match codePattern ${raw.codePattern}`)
      }
      if (seen.has(entry.code)) problems.push(`${at}: duplicate code`)
      seen.add(entry.code)
    }
    for (const key of ['label', 'description']) {
      if (typeof entry[key] !== 'string' || entry[key].length === 0) {
        problems.push(`${at}: ${key} must be a non-empty string`)
      }
    }
    if (typeof entry.goName !== 'string' || !/^[A-Z][A-Za-z0-9]*$/.test(entry.goName)) {
      problems.push(`${at}: goName must match /^[A-Z][A-Za-z0-9]*$/`)
    }

    const caps = entry.capabilities
    if (!Array.isArray(caps)) {
      problems.push(`${at}: capabilities must be an array`)
    } else {
      for (const cap of caps) {
        if (!knownCaps.has(cap)) problems.push(`${at}: unknown capability "${cap}"`)
      }
      if (new Set(caps).size !== caps.length) problems.push(`${at}: duplicate capability`)
      if (caps.includes('display')) {
        problems.push(`${at}: "display" is implicit — remove it`)
      }
      // A picker must never offer a code the pipeline cannot send. `internal` is
      // the one exception and the reason that capability exists: the código is
      // selectable, but what reaches the wire is props.wireEquivalent, so the
      // entry itself is deliberately not emittable.
      if (caps.includes('select') && !caps.includes('emit') && !caps.includes('internal')) {
        problems.push(`${at}: has "select" without "emit" — a code the UI offers must be emittable, unless it is "internal" with a wireEquivalent`)
      }
      if (caps.includes('retired') && caps.includes('emit')) {
        problems.push(`${at}: has both "retired" and "emit" — SUNAT rejects retired codes`)
      }
      if (caps.includes('internal') && typeof entry.props?.wireEquivalent !== 'string') {
        problems.push(`${at}: has "internal" but no props.wireEquivalent naming the code sent instead`)
      }
    }

    for (const [key, values, kind, type] of [
      ['flags', entry.flags, flagKeys, 'boolean'],
      ['props', entry.props, propKeys, null],
    ]) {
      if (!isPlainObject(values)) {
        problems.push(`${at}: ${key} must be an object`)
        continue
      }
      const got = Object.keys(values).sort()
      if (got.join(',') !== kind.join(',')) {
        problems.push(
          `${at}: ${key} keys [${got}] differ from the first entry's [${kind}] — every entry in a file must share one shape`,
        )
      }
      for (const [k, v] of Object.entries(values)) {
        if (type === 'boolean' && typeof v !== 'boolean') {
          problems.push(`${at}: flags.${k} must be a boolean`)
        }
        if (type === null && !(v === null || ['string', 'number', 'boolean'].includes(typeof v))) {
          problems.push(`${at}: props.${k} must be a string, number, boolean or null`)
        }
      }
    }

    entries.push(entry)
  }

  // flags and props are flattened onto the generated entry object, so their keys
  // must not collide with each other or with the fixed fields.
  const reserved = ['code', 'label', 'description']
  for (const key of [...flagKeys, ...propKeys]) {
    if (reserved.includes(key)) {
      problems.push(`${path}: flag/prop "${key}" collides with a reserved entry field`)
    }
  }
  for (const key of flagKeys) {
    if (propKeys.includes(key)) problems.push(`${path}: "${key}" is declared as both a flag and a prop`)
  }

  const codes = entries.map((e) => e.code)
  const capabilityCodes = { display: [...codes] }
  for (const cap of knownCaps) {
    if (cap === 'display') continue
    const matching = entries.filter((e) => e.capabilities?.includes(cap)).map((e) => e.code)
    if (matching.length) capabilityCodes[cap] = matching
  }
  const flagCodes = {}
  for (const key of flagKeys) {
    flagCodes[key] = entries.filter((e) => e.flags[key] === true).map((e) => e.code)
  }

  return {
    path,
    id,
    sunatCatalog: raw.sunatCatalog,
    name: raw.name,
    source: raw.source,
    codePattern: raw.codePattern,
    propRefs,
    entries,
    codes,
    flagKeys,
    propKeys,
    capabilityCodes,
    flagCodes,
  }
}
