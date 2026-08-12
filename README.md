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

- **Ubigeo.** An INEI dataset, not a SUNAT catálogo — different publisher, cadence
  and licence. It lives in `perunio-frontend/src/data/ubigeo-peru.ts` and is
  incomplete (536 of 1874 districts); completing it is its own project.
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
