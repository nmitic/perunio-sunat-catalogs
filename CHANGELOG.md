# Changelog

Consumers pin a tag, so every release note should say what a service will see
after bumping — especially any code that stopped being `select` or `emit`, since
that narrows what the UI offers or what the pipeline accepts.

## Unreleased

### Added

- Repository, spec format, validator and both generators.
- `cat16` — Tipo de Precio de Venta Unitario (3 entries). Seeded to prove the
  pipeline end to end. Includes code `03`, which
  `perunio-facturador/internal/xmlbuilder/invoice.go` already accepts but
  `internal/model/catalog.go` never named; confirm it against
  `resources/AjustesValidacionesCPEv20260212.xlsx` before migrating Cat.16.
