/** Zoom and pan for a drawing sheet, shared by the preview and the edit page. */

export function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(8, Math.max(0.35, zoom));
}

export function zoomBy(zoom, factor) {
  return clampZoom(zoom * factor);
}

export function panBy(pan, dx, dy) {
  return { x: pan.x + dx, y: pan.y + dy };
}

/**
 * How far, in sheet millimetres, a tap should reach.
 * A 44px target stays tappable as the sheet is zoomed.
 */
export function hitSlopMm(zoom, pxPerMm = 2.6) {
  return 44 / Math.max(clampZoom(zoom) * pxPerMm, 0.4);
}
