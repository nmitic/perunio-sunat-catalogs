# perunio-sunat-catalogs

The SUNAT catálogos (Peru's electronic-invoicing code tables) as versioned JSON,
with generated TypeScript and Go bindings.

One definition of every code, consumed by `perunio-facturador` (Go, the emission
pipeline), `perunio-backend` (Node) and `perunio-frontend` (React). Codes are
compiled in — there is no runtime fetch, no database read and no network
dependency in any consumer.

## Install

**TypeScript** — pin a tag:

```bash
npm install sunat-catalogs@github:nmitic/perunio-sunat-catalogs#v1.0.0
```

```ts
import { CAT07, CAT07_SELECT_CODES, type Cat07Code } from 'sunat-catalogs/cat07'

const label = CAT07['10'].label
const igvRate = CAT07['10'].afectoIGV ? 0.18 : 0
```

**Go**:

```bash
go get github.com/nmitic/perunio-sunat-catalogs@v1.0.0
```

```go
import sunat "github.com/nmitic/perunio-sunat-catalogs/sunat"

if !sunat.Cat07Valid(code) { /* reject before it reaches SUNAT */ }
scheme := sunat.Cat07TaxScheme(code)
```

Import one catalog at a time. Each is its own export subpath and the package sets
`sideEffects: false`, so a bundle only carries the catálogos it actually uses.

Each catalog ships three files: `.js` (ESM, what Node and Vite load), `.cjs` for
CommonJS runtimes that cannot load ESM at all — jest, run without
`--experimental-vm-modules`, is the one that matters — and `.d.ts` for types. Both
JavaScript builds are rendered from a single body, so they cannot drift apart.

> **Consuming from jest / ts-jest.** The runtime resolves the `require` condition
> and needs no transform, but ts-jest coerces `module` to CommonJS and that
> coercion falls back to Node10 resolution, which ignores `exports` maps — so
> types stop resolving under ts-jest even though `tsc` is fine. Map them directly
> in the test tsconfig:
>
> ```jsonc
> "paths": { "sunat-catalogs/*": ["../node_modules/sunat-catalogs/gen/ts/*"] }
> ```

## Repository layout

```
catalogs/*.json        source of truth — one file per catálogo, hand-edited
meta/
  catalog.schema.json  the file format, additionalProperties: false
  capabilities.json    the capability vocabulary

tools/
  spec.mjs             load + validate; the rules both generators share
  gen-ts.mjs           renders gen/ts
  gensunat/            renders sunat/ (Go, so it can gofmt its own output)
validate.mjs           CLI over tools/spec.mjs — the first step of `npm run gen`

gen/ts/*.{js,cjs,d.ts} generated — TypeScript bindings
sunat/*.go             generated — Go bindings (plus doc.go, the package index)
```

Everything under `catalogs/` and `meta/` is written by hand; everything under
`gen/ts/` and `sunat/` is written by a generator and committed. `npm run check` is
what CI runs: validate, then re-render both targets in memory and diff against
disk.

Only `validate.mjs` enforces the spec. `gensunat` re-checks the minimum it needs
to fail loudly rather than emit broken Go, and otherwise assumes validation has
already passed — which is why `npm run gen` runs it first and why you should never
invoke a generator on its own.

### Why the two output directories are not `gen/ts` and `gen/go`

Because only one of them is part of the public API.

In Go the import path *is* the directory path, so `sunat/` is what consumers type:

```go
import sunat "github.com/nmitic/perunio-sunat-catalogs/sunat"
```

Under `gen/go/` that becomes `import sunat ".../gen/go"` — an import path ending
in `/go` bound to the identifier `sunat`. Legal, but the mismatch between the last
path element and the package name is what trips up goimports, IDE auto-import and
several linters, and `go` is a poor directory name besides.

TypeScript has no such constraint. Nobody writes `gen/ts/cat01.js`; the `exports`
map in `package.json` publishes it as `sunat-catalogs/cat01`, so that directory is
an implementation detail and could be renamed without touching a consumer.

The symmetry is only available on the side where the path is hidden. `sunat/`
therefore sits at the repository root, and moving it later is a breaking change
for every Go import in `perunio-facturador`.

`validate.mjs` sitting at the root rather than in `tools/` has no such
justification — it is a thin CLI over `tools/spec.mjs` and would be at home
alongside it.

## What is in a catalog file

```jsonc
{
  "id": "cat07",
  "sunatCatalog": "07",
  "name": "Tipo de Afectación del IGV",
  "source": "Anexo 8 RS 097-2012/SUNAT (v2.1)",   // cite the resolución, never "the frontend had this list"
  "codePattern": "^[0-9]{2}$",
  "propRefs": { "taxSchemeCode": "cat05" },        // cross-catalog references, resolved at validation time
  "entries": [
    {
      "code": "10",
      "label": "Gravado - Operación Onerosa",      // short, for pickers and badges
      "description": "Gravado - Operación Onerosa", // SUNAT's own wording
      "capabilities": ["emit", "select"],
      "flags": { "afectoIGV": true, "gratuito": false },
      "props": { "taxSchemeCode": "1000" },
      "goName": "GravadoOnerosa"                   // -> const Cat07GravadoOnerosa
    }
  ]
}
```

### Every entry in a file must have the same shape

All entries share the same `flags` and `props` keys. Defaults are written out on
every row; a value that genuinely does not apply is an explicit `null`.

This is a correctness requirement, not a style rule: TypeScript infers an array's
element type from its members, so a file whose entries disagree about their keys
generates a union type and every `entry.props.foo` call site fails to compile.

### Capabilities, not forked lists

A catálogo is defined once, in full. Which subset a given consumer may use is
expressed with capability tokens from `meta/capabilities.json` — never by keeping
a second, shorter copy of the list somewhere.

`display` is implicit on every entry; the rest (`emit`, `select`, `download`,
`void`, `retired`, `internal`, …) are opt-in. The generators emit a tuple and a
predicate per capability, so the Go validator and the React `<Select>` are built
from the same token and cannot drift apart.

### What must never go in

Presentation belongs to the consumer, not here: CSS classes, badge variants, icon
names, route paths, UI ordering, currency symbols, prose help text, English
labels. `meta/catalog.schema.json` sets `additionalProperties: false` to keep them
out.

## Changing a catalog

```bash
npm run gen        # validate, then re-render gen/ts and sunat/
npm run check      # what CI runs: validate + both --check modes
```

Then tag (`v1.3.0`) and push. In each service, bump the dependency and run its
gate:

```bash
# perunio-backend, perunio-frontend
npm install sunat-catalogs@github:nmitic/perunio-sunat-catalogs#v1.3.0
npm run type-check && npm test

# perunio-facturador
go get github.com/nmitic/perunio-sunat-catalogs@v1.3.0
make test && make lint
```

**Land the three PRs in the order facturador → backend → frontend.** The wire is
authoritative, the API follows it, and the UI comes last: a UI offering a code the
wire rejects is the failure mode this repository exists to eliminate.

`gen/ts` and `sunat/` are committed artifacts. Never hand-edit them — CI
regenerates and diffs. Nothing builds on `npm install`, which is why consumers can
depend on a git tag with no build step and no deploy configuration.

### Iterating locally before tagging

```bash
# TypeScript consumers
npm install sunat-catalogs@file:../perunio-sunat-catalogs

# Go consumer — in perunio-facturador/go.mod
replace github.com/nmitic/perunio-sunat-catalogs => ../perunio-sunat-catalogs
```

Remove both before landing.

## Scope

**Included:** the numbered SUNAT catálogos, plus a few Perunio-internal enums
(`"sunatCatalog": null`) that suffer the same duplication.

**Not included:**

- **Ubigeo is now included** (`ubigeo-departamento`, `ubigeo-provincia`,
  `ubigeo-distrito`). It is an INEI dataset rather than a SUNAT catálogo, and was
  originally out of scope — but the frontend copy turned out to be wrong, not
  merely incomplete: 55 distritos carried the código of a different distrito and
  29 códigos were not INEI ubigeos at all. Being wrong about a GRE address is a
  production rejection, so it belongs here with everything else.
- **SUNAT fault codes** (2xxx/3xxx) and Perunio's internal scraper error codes.
  Both are one-repo concerns; neither is a catálogo.
- **CDR response codes.** `ResponseCode == "0"` is a protocol constant.

## Known copies still outside this repo

`perunio-facturador-chrome-plugin/lib/catalogo-03.ts` and `catalogo-06.ts` hold a
fourth copy of the unidades de medida (33 entries, differing from the 41 here) and
the tipos de documento de identidad. The plugin is a separate public repo with its
own bundle budget and was left out of the consolidation; adding it later means two
subpath imports.

## Licence

MIT. The data is published by SUNAT; the JSON encoding, the generators and the
bindings are MIT-licensed.
