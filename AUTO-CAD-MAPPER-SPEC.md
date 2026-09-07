# Rekixo Auto CAD Plot Mapper — Locked Project Specification

This file is the implementation checklist for every present and future client project. Do not remove a requirement simply because a particular customer does not provide all source files.

## Non-negotiable architecture

1. **Tiyansh remains a completed/locked reference project.** New customer uploads must never overwrite or inherit Tiyansh masterplan, polygons, contact details, branding, gallery, admin inventory, or coordinate assumptions.
2. **Each project owns its coordinate system.** Store/use `mapWidth` and `mapHeight`; never force all projects into 1200×2133. Polygons are stored normalized in the range 0..1 so replacement masterplan resolutions remain compatible.
3. **One plot geometry source drives everything:** Super Admin mapper, public 2D click target, public 3D extrusion/highlight, client admin status, and plot detail drawer.
4. **Source responsibilities:**
   - Masterplan image = visual appearance.
   - DWG/DXF = exact/engineering geometry when available.
   - CSV/JSON plot sheet = authoritative plot ID, area, dimensions, facing/road and notes.
   - PDF = original technical/reference document. A scanned PDF is not silently OCR-guessed.
   - D1 = live business/status data.
   - R2 = project source/generated assets.
5. **Automatic CAD matching is review-first.** Never silently publish a guessed plot. Only exact plot IDs present in the imported inventory are eligible for auto-publish; unmatched/ambiguous candidates remain in Review.

## New project workflow

1. Create client project and admin access.
2. Upload high-resolution masterplan. Preserve aspect ratio; downscale only for practical mapping limits, never letterbox/stretch to Tiyansh dimensions.
3. Upload DWG/DXF. Store original CAD in R2. Parse closed polylines and text labels into project CAD geometry JSON.
4. Import plot inventory CSV/JSON. Existing polygon/status are preserved when business data is re-imported.
5. Upload technical PDF reference.
6. Calibrate CAD to rendered masterplan using at least four well-spread control-point pairs. Allow extra pairs and least-squares fitting.
7. Transform all CAD candidates through the homography.
8. Match CAD labels only against authoritative inventory IDs.
9. Review overlay and unmatched plots.
10. Publish matched plots in one operation. Remaining plots go to Precise Manual Fallback.
11. Verify Live Preview in 2D and 3D before handoff.

## CAD requirements

- Accept `.dwg` and `.dxf` up to project upload limits.
- Parser dependency must be pinned and lockfile-integrity verified.
- AC1021 (AutoCAD 2007/2008/2009) must be supported for the RPK source file.
- Extract closed polyline candidates, layer name, centroid, normalized CAD points and text/MText labels.
- Keep original source file even if auto-parse fails so a DXF replacement/manual review can recover without re-onboarding the project.
- Do not depend on native executables inside Cloudflare Workers.

## Calibration requirements

- Four points minimum; points must be spread across the site and not collinear.
- Solve a projective 3×3 homography.
- Coordinates remain normalized and resolution-independent.
- Show transformed CAD overlay on the masterplan before publish.
- Save homography and calibration quality metadata per project.
- Recalibration must not delete inventory/business data.

## Precise manual fallback requirements

- Default shape for perspective renders is **4-corner quadrilateral**, not an axis-aligned 2-tap rectangle.
- Support arbitrary irregular polygons.
- Tap adds a vertex; ordinary finger movement pans the scrollable image without requiring a Select/Move toggle.
- Placed vertices are draggable.
- While dragging, show a magnifier/crosshair loupe.
- Snap first to existing plot vertices, then to existing plot edges within a touch-friendly pixel threshold.
- Undo, clear, edit existing geometry and remove geometry while preserving inventory details.
- Confirm automatically advances to the next unmapped inventory plot.

## Masterplan quality requirements

- Preserve source aspect ratio.
- Mapping copy may be high resolution (up to configured dimensions/pixel/byte limits).
- Do not force a sub-1MB mapping image where tiny plot boundaries become inaccurate.
- Public optimization may be separate from the mapping source; geometry must remain normalized so image replacement is safe.

## Plot sheet requirements

CSV/JSON must support equivalent headers for:

- Plot ID / Plot No / Lot No
- sqft and/or sqm and/or sqyd
- dimensions
- facing / road access
- optional notes

If one area unit is supplied, derive the other units. Import must preserve an already-mapped polygon and current booking/sold status.

## Public 2D/3D requirements

- Public map dimensions come from project settings (legacy Tiyansh fallback only: 1200×2133).
- Dynamic SVG viewBox, map world sizing, hit testing, focus/zoom and 3D world calculations use the current project's dimensions.
- 3D texture is the current project's masterplan, not a hard-coded Tiyansh image.
- Public plot search must support numeric IDs such as `1`, `141`, `D1` as well as legacy Tiyansh IDs.
- Status colors and detail drawers continue to use live D1 data.

## Mobile usability requirements

- Super Admin must be usable from Android Chrome.
- No workflow should require a desktop-only hover interaction.
- Mapping canvas supports high zoom and scrolling/panning.
- Controls remain reachable in portrait; fullscreen is optional.
- Large plot inventories show Mapped / Auto / Review state per row.
- A user should normally review exceptions, not trace hundreds of plots manually.

## Safety / isolation / data integrity

- Every read/write remains project-scoped.
- Super Admin-only source assets (CAD, generated CAD geometry, imported plot sheet) must not become public endpoints.
- Technical PDF/masterplan may be served according to existing project/public rules.
- Tiyansh mapper write lock remains enforced server-side, not only hidden in UI.
- Upload format/size validation remains server-side.
- Homography settings keys are allow-listed.
- Bulk plot writes are bounded/chunked for D1.
- Re-import never silently changes live sold/booked status or deletes a polygon.

## RPK reference project acceptance criteria

- RPK masterplan is landscape and must retain its own aspect ratio.
- Plot inventory contains plots 1–141 plus D1–D5 (146 total) when the verified plot sheet is imported.
- RPK AC1021 DWG is stored and parsed where CAD entities permit.
- CAD/image calibration can be completed with four or more pairs.
- Auto-matched polygons are visibly overlaid before publish.
- 2D and 3D use exactly the same saved normalized polygons.
- Any plot that cannot be confidently matched remains Review, never guessed.

## Release gate

Before production push:

- Static syntax checks pass.
- Mapper/security/rendered HTML tests pass after CI build.
- Git diff whitespace check passes.
- `.sites-runtime/`, `node_modules/`, source customer files and local logs are not committed accidentally.
- GitHub Actions Ubuntu performs the authoritative dependency install/build because Android Termux cannot install the `workerd` native package.
- Both Tiyansh Client Worker and Rekixo Super Admin Worker deploy successfully.
