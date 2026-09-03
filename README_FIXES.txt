TIYANSH PROJECT — MOBILE/RESPONSIVE STABILITY FIX

Main fixes:
- Rebuilt 2D plot touch handling around one central Pointer Events controller.
- No immediate pointer capture on taps; pointer capture starts only after a real drag.
- Plot is resolved from plan geometry on pointer-up, independent of SVG event retargeting.
- Small touch-edge forgiveness without huge overlapping hit zones.
- Native touch click duplication removed.
- Map does not move during normal finger jitter.
- Pinch/drag state cleanup hardened.
- Drawer visibility/pointer-events hardened; mobile remains full viewport.
- Responsive resize also listens to visualViewport.
- STATUS glass touch remains isolated from map gestures.
- Gallery/Location remain stacked above zoom controls.
- 3D one-finger tap now ignores camera jitter until drag threshold is crossed.

Use these canonical filenames together in one folder:
index.html
plots-data.js
three-view.js
masterplan.jpg
plots-overlay.svg (reference; index does not need to load it)
