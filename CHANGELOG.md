# Changelog

Consumers pin a tag, so every release note should say what a service will see
after bumping — especially any code that stopped being `select` or `emit`, since
that narrows what the UI offers or what the pipeline accepts.

## v1.1.0

Every catálogo reconciled, entry by entry, against
`perunio-facturador/resources/AnexosIyII_Formato1.3.4.xlsx` — the first time the
files were checked as a set against a single authority. **No código entered or
left an `emit` set and no detracción rate moved**, so nothing a service puts on
the wire changes.

### Fixed

- **Cat.16 código `03` was wrong.** It read "Valor referencial unitario en
  operaciones de exportación", which is not a Cat.16 concept; SUNAT defines it as
  **"Tarifas reguladas"**. `flags.referencial` went `false` with it, and the Go
  constant `Cat16ValorReferencialExportacion` is now `Cat16TarifasReguladas`. It
  was unreferenced, so nothing needs updating.
- **`CAT16_REFERENCIAL_CODES` narrowed** from `["02","03"]` to `["02"]`, for the
  same reason. Also unreferenced.
- Cat.16 `02`, Cat.05 `1000`/`2000`/`7152`, Cat.08 `01`/`02`/`03` and Cat.09 `03`
  now carry SUNAT's wording rather than ours — including Cat.05's "IGV"/"ISC"
  prefixes and "Impuesto a la bolsa plastica".
- **Cat.06 código `6` reads "Contributentes"**, reproducing the anexo's own
  misspelling. `label` still says "RUC", which is what a UI renders.

### Added

- **Cat.51 `on-factura` / `on-boleta`**, transcribed from the anexo's `Tipo de
  Comprobante asociado` column: `0112` is factura-only, `0113` boleta-only, the
  other 19 both. `0104` mirrors `0101`; the `retired` pair carries neither.
  Data only — no consumer enforces it yet, so a factura can still declare `0113`.
- Every numbered catálogo's `source` now names the anexo as its authority and
  states, per entry, which of the 10 entries are not in it and why. Seven
  catálogos needed no change at all: Cat.07, 10, 18, 20, 52, 53, 54 — the last
  verified rate by rate, 34 for 34.

### Changed

- `on-boleta` and `on-factura` in `meta/capabilities.json` were worded for nota
  motivos only; they now also cover a tipo de operación.

## v1.0.0

Every SUNAT catálogo this platform uses now lives here. `perunio-facturador`,
`perunio-backend` and `perunio-frontend` declare none of their own, and each has
a committed check that fails the build if one comes back.

### Added

- **30 catálogos, 2447 entries.** Cat.01, 02, 03, 05, 06, 07, 08, 09, 10, 16, 18,
  20, 51, 52, 53, 54; the UBL document/namespace tables; the GRE discriminator;
  PLE tabla 10; the estado and registro enums; and the INEI ubigeo.
- `goConsts: false`, for datasets too large to name one Go constant per row
  (ubigeo's 1874 distritos).
- Capabilities `isc-unit` and `gre-weight`, so a Cat.03 subset is expressed as a
  capability rather than forked into its own list.

### Fixed — data that was wrong, not just duplicated

Consumers should read these as behaviour changes, not refactors:

- **Cat.54.** The frontend's detracciones list had descripciones shifted across
  códigos: its 039 was this 040, its 041 this 036. Rates for 039 (4% → 10%) and
  040 (15% → 4%) change what is withheld. Código 041 does not exist; productos
  carrying it need remapping. Six códigos have no published rate and are not
  selectable — including 028, which the pipeline pins to Cat.51 1003.
- **Ubigeo.** 55 distritos carried the código of a different distrito (CHIMBOTE
  at 022001, which INEI assigns to 021801) and 29 códigos were not INEI ubigeos.
- **Cat.07.** Código 37 was missing from the frontend, which bucketed it as
  inafecto rather than gratuito — wrong totals on any comprobante using it.
- **Cat.20.** The guía form offered 03, 05, 17 and 20, which fail at issue time
  with fault 2800, and omitted 08 and 09, making importación and exportación
  unreachable.
- **Condición de domicilio.** Código 11 is POR VERIFICAR, not "NO APLICABLE";
  01 and 02 are not condición códigos. A predicate testing them always returned
  false, so no receptor was ever flagged as observado.
- **Cat.06.** Código E is the Tarjeta Andina de Migración, not NITE. F, G and H
  were missing everywhere.

### Changed

- `select` implies `emit` only for catálogos with a `sunatCatalog` number, and
  never for an `internal` código — a marker like Cat.51 0104 is selectable and
  travels as its `wireEquivalent`.
- `validate.mjs` rejects a `goName` that collides with a flag or prop accessor.

## Unreleased

### Added

- Repository, spec format, validator and both generators.
- Dual-format TypeScript output: `.js` (ESM), `.cjs` (CommonJS) and `.d.ts`, with
  `import`/`require`/`types` export conditions. The CommonJS build lets
  perunio-backend's jest load the package with no transform configuration.
- `cat16` — Tipo de Precio de Venta Unitario (3 entries). Seeded to prove the
  pipeline end to end. Includes code `03`, which
  `perunio-facturador/internal/xmlbuilder/invoice.go` already accepts but
  `internal/model/catalog.go` never named; confirm it against
  `resources/AjustesValidacionesCPEv20260212.xlsx` before migrating Cat.16.
