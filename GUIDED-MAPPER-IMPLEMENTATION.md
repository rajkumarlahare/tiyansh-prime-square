# Tiyansh / Rekixo — Guided Multi-Project Plot Mapper

Date: 2026-09-07

## Goal implemented

A new customer project now uses the existing Tiyansh website/admin experience as a reusable project template without sharing Tiyansh plot inventory or masterplan assets.

Owner workflow:

1. Create/select a client project in Super Admin.
2. Open **Plot Mapper**.
3. Upload the project's masterplan image. The browser normalizes it to the same 1200×2133 coordinate plane used by the Tiyansh 2D/3D engine.
4. Optionally upload the original technical PDF as a project-scoped reference drawing.
5. Select Plot 1 boundary.
   - Rectangle: two opposite taps.
   - Irregular: tap each corner, then finish boundary.
6. Fill plot number, dimensions, area and road access.
7. Press **Confirm & start next**.
8. The polygon and plot details are saved to the selected project's D1 rows.
9. The mapper immediately resets to the next plot number and starts boundary selection again.
10. Public website loads the same saved polygon for SVG hit-testing and the WebGL 3D overlay.

## Important architecture rules

- `tiyansh-prime-square` remains the completed reference project and its masterplan is locked in the mapper.
- Every project keeps its own `plots`, `settings`, `gallery`, admin users and mapper assets.
- New client admins do not inherit `public/plots.json`; that bundled inventory is used only by the completed Tiyansh project.
- New public sites remove Tiyansh static polygons before rendering project polygons.
- Public map is hidden until the project context resolves, preventing a new customer from seeing/clicking a Tiyansh fallback map during loading.
- 3D is disabled until that project's masterplan is available.
- The 3D engine can replace both the project plot set and masterplan texture at runtime.
- A `/preview/<projectId>` route provides a customer-site preview before a custom domain is attached.
- New projects receive neutral brand/contact settings at creation instead of Tiyansh values.

## Image + PDF design

The raster masterplan image is the canonical mapping surface because both SVG hit areas and WebGL need one deterministic coordinate plane/texture. The source PDF is stored project-by-project as the original technical reference. This avoids having the browser's PDF viewer introduce page chrome, zoom or coordinate drift into plot boundaries.

If a future requirement is **PDF-only mapping**, add a controlled PDF.js rasterization step that converts the selected PDF page to the same 1200×2133 mapping surface before selection. Do not map directly on the native browser PDF viewer.

## Main changed files

- `app/plot-mapper.tsx` — guided one-plot-at-a-time mapper and image normalization.
- `app/globals.css` — guided mapper workflow UI.
- `app/api/super-mapper/route.ts` — existing owner mapper API used per project; validates polygons/assets and protects Tiyansh masterplan.
- `public/project/index.html` — dynamic project polygons/branding/masterplan and isolation.
- `public/project/three-view.js` — runtime `setPlots()` and `setImageSrc()` support.
- `app/project-context.ts` — project preview context.
- `app/preview/[projectId]/page.tsx` — shareable project preview route.
- `app/admin-dashboard.tsx` — customer admin isolation and per-project preview/masterplan.
- `app/admin/page.tsx` — passes the authenticated project ID to the client admin dashboard.
- `app/api/admin/users/route.ts` — seeds neutral per-project settings for new customers.
- `app/api/public-data/route.ts` — returns current project identity + project-scoped data.
- `app/api/data/route.ts` — authenticated tenant-scoped admin data.
- tests under `tests/` — multi-client/guided mapper assertions.

## Verification performed in this workspace

- JavaScript syntax check for `public/project/three-view.js`: PASS.
- All inline JavaScript in `public/project/index.html`: PASS.
- TypeScript parser/transpile syntax scan across 92 `.ts/.tsx` files: 0 syntax-error files.
- Targeted repository tests: 6/6 PASS.

A full fresh npm production build could not be completed in this sandbox because npm registry downloads returned DNS `EAI_AGAIN`. This is an environment/network limitation, not a code test failure. Run the repository's normal fresh install/build/test on the deployment machine before production deployment.

## Recommended production verification

```bash
npm ci
npm run test
npm run deploy
```

Then verify with two different customer projects:

- Upload different masterplan images.
- Map at least two plots in each.
- Confirm one project never shows the other project's polygons/image/gallery/settings.
- Open each plot in 2D and 3D.
- Change a plot status from that customer's Client Admin and refresh the public site.
- Confirm Tiyansh remains unchanged.
