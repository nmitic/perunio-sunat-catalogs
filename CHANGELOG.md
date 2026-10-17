# Changelog

Consumers pin a tag, so every release note should say what a service will see
after bumping — especially any code that stopped being `select` or `emit`, since
that narrows what the UI offers or what the pipeline accepts.

## v1.3.0

Cat.54 gains two props. No código changed rate, umbral or capability.

- `anexo` — where the código sits in R.S. 183-2004/SUNAT: `"1"`, `"2"`, `"3"`,
  `"carga"` (R.S. 073-2006), `"inmueble"` (R.S. 022-2013), `"especial"` (002,
  028, 099, each under its own regime) or `null` (013, 015, no longer in any
  anexo). It decides the comprobante exclusion: a boleta, or any comprobante
  that grants no crédito fiscal, excludes Anexos 2 and 3 but never Anexo 1.
  Go: `sunat.Cat54Anexo`; TS: `CAT54[code].anexo` and `CAT54_ANEXO`.
- `porcentajeAlternativo` — the rate when the conditional one does not hold.
  Only 004 has one (10 %, when the proveedor is not on SUNAT's 4 % listado).

The rules these props feed are written up in
`perunio-facturador/DETRACCIONES.md`.

### What a service sees after bumping

Nothing changes by itself: both props are new reads. Coming from v1.1.0, the
v1.2.0 notes below still apply.

## v1.2.0

Every catálogo re-checked against the SUNAT rule workbooks now in
`perunio-facturador/resources/reglas/`: `reglas-validacion-cpe-2026-08-26.xlsx`,
and `reglas-validacion-gre-2026-09-25.xlsx` for the guía catálogos. The check
covered their struck-through text and *Control de Cambios* sheets. These
workbooks replace `AnexosIyII_Formato1.3.4.xlsx`, the SFS annex v1.1.0 was
reconciled against. That annex has left `resources/` (it is in
perunio-facturador commit `b00a315`), and it was stale:

- its Cat.20 predates GRE 2.0;
- its Cat.51 still listed 0303 and allowed 0202 and 0205 on boletas;
- its Cat.54 rates were the 2015 ones.

No workbook publishes detracción rates, so Cat.54 was checked against the SPOT
itself: R.S. 183-2004/SUNAT and its modifications.

### What a service sees after bumping

- **perunio-frontend: detracciones change money.**
  - **Rates.** 012, 020, 022 and 037 go from 10 % to **12 %**: intermediación
    laboral, mantenimiento y reparación, otros servicios empresariales and demás
    servicios gravados. R.S. 071-2018/SUNAT raised them on 2018-04-01, so every
    detracción the UI has computed for those four since v1.0.0 was 2 points short.
  - **Umbrales.**
    - 001, 003 and 034 (Anexo 1) go from S/700 to **S/2,750**, half the 2026 UIT.
    - 010, 031 and 036 go from S/700 to **0**: Anexo 2 numerales 6, 16 and 21
      apply at any amount.
  - **Picker.** It gains 011, 016, 032, 041, 044 and 045.
  - The comment in `src/sunat/detracciones.ts` calls 12 % the "pre-2023" rate; it
    is the current one.
- **perunio-facturador: six spec goldens change.** Cat.05 9996 `taxCategoryId`
  goes from E to **Z**, which changes the `cac:TaxCategory/cbc:ID` of every
  gratuito subtotal.
  - Run `go test ./internal/xmlbuilder -run TestSpec -update`. The diff is 21
    lines in invoice/11–16, all of them that element.
  - Correct the line in `spec/README.md` that says the builder emits `E` for
    9996.
  - SUNAT's XSL never reads the element, so acceptance does not change.
  - Build, vet and every other test pass against this release.
- **perunio-backend: one test fails.** `src/__tests__/sunat/catalogs.test.ts`
  expects `CAT10_CODES` to have 5 entries, but SUNAT now defines 6. Update that
  assertion and its comment. Type-check and the other 658 tests pass.
- **perunio-frontend: one label changes.** In the guía form, motivo 19 now reads
  "Traslado de mercancía extranjera". It used to read "Traslado a zona primaria",
  a meaning SUNAT dropped in 2022.
  - type-check and check:catalogs pass.
  - type-check:gre fails the same way it does on v1.1.0.
- New: `sunat-catalogs/cat11` and `sunat.Cat11*`, for the resumen diario's
  `InstructionID`, which `summary.go` still writes as literals.

No código entered or left an `emit` or `select` set in Cat.01, 05, 06, 07, 09,
10, 16, 18 or 20. The only código that left an `emit` set is Cat.51 0303, and
nothing consulted it there.

### Fixed — data that was wrong

- **Cat.54.**
  - Rates and umbrales are fixed as listed above.
  - 004's 4 % applies only to proveedores in SUNAT's 4 % list; anyone else pays
    10 %. The source now says so. The value is unchanged.
- **Cat.53 `esCargo`** was false for 45, 46, 51, 52 and 53. SUNAT requires
  `cbc:ChargeIndicator` true for them (ERROR 3114). No consumer reads the flag.
- **Cat.51.**
  - 0303 (pago de regalía petrolera) is now `retired`. SUNAT removed it in 2019
    and rejects it with ERROR 3206.
  - 0202 and 0205 lose `on-boleta`. They are factura-only, and 3206 enforces that.
  - 0101's descripción is "Venta interna no sujeta a Detracción o Percepción", in
    force since 2026-08-01.
- **Cat.20.**
  - 19 is now "Traslado de mercancía extranjera".
  - The source claimed 03, 05, 06, 07 and 17 are CPE-only motivos that fail with
    fault 2800. Both claims were wrong:
    - they are GRE motivos;
    - 2800 is SUNAT's code for the receptor's tipo de documento. SUNAT's error
      for a motivo outside Cat.20 is 3405.
- **Cat.09.**
  - 03 now carries the descripción in force today: "…o atención de reclamo
    respecto de bienes adquiridos o servicios prestados".
  - The source said SUNAT rejects 04, 05 and 08 against a boleta. SUNAT accepts
    them with OBSERV 4367. `on-boleta` still excludes them, but now as this
    platform's own rule.
- **Cat.05** 9996 `taxCategoryId` is Z, the value in SUNAT's guía de elaboración
  for a factura.
- **Cat.03.** The source said KGM is the only unit a guía accepts for peso bruto.
  SUNAT also accepts TNE, and rejects anything else with ERROR 2523. The
  `gre-weight` set is unchanged.
- **ubl-document.** A wrong `UBLVersionID` or `CustomizationID` is rejected
  outright, not silently: ERROR 2074 or 2072, and 2110 or 2112 on a guía.
- Every `source` cited workbooks that are no longer in perunio-facturador's
  `resources/`. Sources now cite `resources/reglas/`, and stale file:line
  references are gone.

### Added

- **cat11, tipo de valor de venta del resumen diario.**
  - 01, 02, 03 and 05 carry `emit`, because the RC builder sends them.
  - 04 is display-only, as are 06–09, which are new for 2027.
- Display-only códigos that SUNAT defines but this platform does not issue:

  | catálogo | códigos |
  |---|---|
  | Cat.01 | 25 |
  | Cat.10 | 13 |
  | Cat.20 | 03, 05, 06, 07, 17 |
  | Cat.51 | 0501–0503, 2002, 2100–2106 |
  | Cat.52 | 2012 |
  | Cat.53 | 07, 20, 54, 61, 62, 63 |
  | Cat.54 | 099 |

- Cat.54 032, 041, 044 and 045 with their rates, and rates for 011 and 016. All
  six carry `emit` and `select`.

### Due on 2027-01-01, not in this release

SUNAT postponed these changes from 2026-08-01 (Control de Cambios of 24.07.2026).
Each affected catálogo's `source` records them too.

- **Cat.11.**
  - 05 becomes `retired`.
  - 06–09 gain `emit`.
  - This ships together with the RC builder change (facturador spec F13).
- **New descripciones.**

  | código | new descripción |
  |---|---|
  | Cat.09 03 | "Corrección por error en la descripción y/o código de producto SUNAT" |
  | Cat.10 03 | "Otros conceptos" |
  | Cat.01 56 | "Comprobante de pago SEAE / DAE-SEAE" |

- Cat.10 13 and Cat.01 25 become valid on the wire.
- Cat.54's Anexo 1 umbral becomes half the 2027 UIT.

### Deliberately unchanged: decisions for the services

- **gre-doc-type EV keeps `emit` and `select`.**
  - SUNAT accepts a GRE por evento only through SEE-SOL (R.S. 123-2022/SUNAT,
    numeral 5.2).
  - The GRE API rejects it with ERROR 3374.
  - Dropping the two capabilities removes EV from the issuance form; see
    facturador spec F8.
- **Cat.03 TNE is not `gre-weight`.** SUNAT accepts it, but the guía stores its
  peso in kilos.
- **Cat.20 03, 05, 06, 07 and 17 stay display-only.**
  - The despatch model lacks the comprador (03) and the proveedor (07).
  - 06 and 17 need a destinatario with RUC.
- **Cat.05 3000 (Impuesto a la Renta) is not carried.**
  - It is used only on the liquidación de compra.
  - SUNAT documents no TaxCategory for it.
- **Cat.54 038, 042, 043, 046 and 047 are not carried.**
  - The workbook lists them, but its Control de Cambios strikes through the row
    that added them.
  - SUNAT's current SPOT anexos do not include them.

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
