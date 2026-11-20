import { canExport } from './export-policy.js';
import { pdfFromJpeg } from './pdf-image.js';

const PX_PER_MM = 4;

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function inlineLogo(svg) {
  if (!svg.includes('icons/jet-logo.png')) return svg;
  const response = await fetch('icons/jet-logo.png');
  if (!response.ok) return svg;
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return svg.replaceAll('icons/jet-logo.png', `data:image/png;base64,${btoa(binary)}`);
}

function rasterise(svg, type, quality) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 420 * PX_PER_MM;
      canvas.height = 297 * PX_PER_MM;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('The drawing could not be exported.'));
      }, type, quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The drawing could not be drawn for export.'));
    };
    image.src = url;
  });
}

export async function exportDrawingPng(svg, filename) {
  if (!canExport()) throw new Error('Export is locked.');
  const blob = await rasterise(await inlineLogo(svg), 'image/png');
  saveBlob(blob, filename);
}

export async function exportDrawingPdf(svg, filename) {
  if (!canExport()) throw new Error('Export is locked.');
  const blob = await rasterise(await inlineLogo(svg), 'image/jpeg', 0.92);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = pdfFromJpeg(jpeg, 420, 297);
  saveBlob(new Blob([pdf], { type: 'application/pdf' }), filename);
}
