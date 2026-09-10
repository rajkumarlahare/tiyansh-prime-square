# Rekixo Mapper Bundle / Legacy Geometry Recovery

This is an offline, project-scoped recovery/batch-import tool. It does not change the public Worker, Client Admin, RPK runtime, or the normal Super Admin mapping flow.

## Why it exists

Older projects can have accurate manually drawn pixel polygons that pre-date the current normalized D1 mapper. New projects may also receive geometry prepared by AI/CAD/another mapper. The tool converts those coordinates into the same normalized `0..1` polygon format used by current Rekixo projects and generates a reviewable D1 migration.

## Supported input

A plain plot array:

```json
[
  {
    "id": "A-01",
    "points": [[572,1719],[685,1719],[685,1802],[572,1802]],
    "sqft": 5440,
    "sqm": 505.4,
    "sqyd": 604.4,
    "dimensions": "64' × 85'",
    "road": "40' wide CC Road"
  }
]
```

Or a self-describing bundle:

```json
{
  "coordinateSpace": "pixels",
  "sourceWidth": 1200,
  "sourceHeight": 2133,
  "plots": []
}
```

`coordinateSpace: "normalized"` is also supported for mapper backups that already contain `0..1` points. A row may provide `polygon` as a JSON string instead of `points`.

## Generate a migration

```bash
node scripts/build-legacy-plot-migration.mjs \
  --project-id my-project-id \
  --input path/to/plots.json \
  --width 1200 \
  --height 2133 \
  --source-label manual-map-v1 \
  --output drizzle/NNNN_my_project_geometry.sql
```

The project ID is always explicit; the tool has no RPK or Tiyansh default. Pixel coordinates are bounds-checked, duplicate IDs are rejected, and every polygon must contain 3–80 valid points.

## Conflict safety

For an existing `(project_id, plot_id)`, generated SQL updates geometry and plot reference metadata only: `sqft`, `sqm`, `sqyd`, `dimensions`, `road`, `polygon`, and `updated_at`.

It intentionally does **not** overwrite `status`, `notes`, or `featured`. This preserves live Booked/Sold state and client/admin operational data. New rows use the explicit initial status (default `available`).

## Normal new-project path

For a normal new project, keep using Super Admin: create/select project → upload masterplan JPG/PNG/WebP → import CSV/JSON inventory if available → keep PDF as reference → map exact corners manually or with CAD assistant → review → publish. This migration tool is the recovery/batch bridge when accurate geometry already exists outside the current mapper.

## Tiyansh recovery

`drizzle/0008_tiyansh_legacy_geometry_recovery.sql` is generated deterministically from the preserved `public/plots.json` at `1200 × 2133`. It contains all 28 legacy plot boundaries and is hard-scoped to `tiyansh-prime-square`. Existing status/notes/featured are preserved.
