/** Display helpers. British formatting, millimetres. */

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) {
    return `${(bytes / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} KB`;
  }
  return `${(bytes / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MB`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

export function formatMm(value) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Overall size, X × Y × Z, in millimetres. */
export function formatBox(box) {
  if (!box) return '—';
  const [x, y, z] = box.size;
  return `X ${formatMm(x)} × Y ${formatMm(y)} × Z ${formatMm(z)} mm`;
}
