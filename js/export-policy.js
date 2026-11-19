/**
 * One-off unlock hook.
 *
 * Exports are free in this version. A later step can set `unlocked` to false
 * until the drawing has been paid for. Do not add a watermark here.
 */
export const exportPolicy = {
  productId: 'uk.co.yjerv.sdc.drawing',
  unlocked: true,
};

export function canExport() {
  return exportPolicy.unlocked === true;
}
