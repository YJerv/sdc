import { prepareModel, projectViews, viewFrames } from './geometry.js';
import { composeSheet } from './sheet.js';

/**
 * Build an A3 third-angle drawing from an occt-import-js result.
 * `front` is negY, posY, negX, posX, negZ or posZ. `turn` is quarter-turns
 * (0–3) of the sheet before the views are generated.
 */
export function createDrawing(result, options = {}) {
  const model = prepareModel(result);
  const frames = viewFrames(options.front || 'negY', options.turn || 0);
  const views = projectViews(model, frames);
  return composeSheet({ model, views, options });
}
