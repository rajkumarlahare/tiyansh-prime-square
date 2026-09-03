TIYANSH REAL WEBGL 3D VIEW

Implemented:
- Existing 2D UI and exact plot geometry retained.
- Real WebGL masterplan board; not CSS tilt.
- One finger orbit/rotate.
- Two finger pinch zoom and pan.
- +/- and RST operate in 3D.
- Compass follows 3D rotation.
- Existing plot polygons are clickable in 3D.
- Selected plot extrudes into a raised translucent green prism with vertical walls, top, outline and shadow.
- Search selects/focuses plots in 3D.
- 2D button returns to approved 2D view.
- No external CDN/library required.

Test URL: index.html?view=3d&plot=A-15&focus=1

LATEST CHANGE:
- Selected 3D plot extrusion height reduced by 50% (1.10 -> 0.55 world units).

DESKTOP PLOT CLICK FIX:
- Plot tap/click is now resolved on pointer-up when movement is <= 6px.
- Dragging more than 6px remains map pan and does not open details.
- Works with mouse, touch and pen pointer events.
- 3D plot selection now opens the same plot-details drawer.

PC STATUS FIX
- Status card pointer events are isolated from map pan/pointer capture.
- Desktop mouse click on the STATUS toggle now expands/collapses reliably.
- Status option clicks no longer start map dragging.
