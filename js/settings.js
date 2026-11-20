const GRID_KEY = 'sdc-grid';

export function readGridVisible(storage) {
  try {
    return storage.getItem(GRID_KEY) !== 'off';
  } catch (error) {
    return true;
  }
}

export function writeGridVisible(visible, storage) {
  try {
    storage.setItem(GRID_KEY, visible ? 'on' : 'off');
  } catch (error) {
    /* Private mode can refuse storage; the toggle still works for this visit. */
  }
}
