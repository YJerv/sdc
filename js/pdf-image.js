/**
 * A one-page PDF with a single JPEG, sized to the page in millimetres.
 * Used for the on-device A3 export. The image is not re-encoded.
 */

function textOf(value) {
  return new TextEncoder().encode(value);
}

export function pdfFromJpeg(jpeg, widthMm, heightMm) {
  const bytes = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  const pageW = (widthMm / 25.4) * 72;
  const pageH = (heightMm / 25.4) * 72;
  const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im1 Do Q\n`;
  const contentBytes = textOf(content);
  const objects = [
    textOf('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    textOf('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n'),
    textOf(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`),
    textOf(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`),
    contentBytes,
    textOf('endstream\nendobj\n'),
    textOf(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`),
    bytes,
    textOf('\nendstream\nendobj\n'),
  ];
  // Width and Height above are placeholders; patch them once we know the JPEG size.
  // Callers pass a real JPEG. The dictionary width/height are corrected below when
  // the JPEG header can be read, otherwise 1×1 still wraps the bytes.
  const header = textOf('%PDF-1.4\n');
  const chunks = [header];
  const offsets = [0];
  let cursor = header.length;
  const objectStarts = [];
  // Rebuild object 5 with the real pixel size when the header is a JPEG.
  const size = jpegSize(bytes);
  objects[6] = textOf(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
  const objIndex = [0, 1, 2, 3, 6, 7];
  // Objects are stored as several chunks. Record offsets at each "N 0 obj".
  const starts = [];
  for (const chunk of objects) {
    if (chunk.length > 8 && chunk[0] >= 48 && chunk[0] <= 57) starts.push(cursor);
    chunks.push(chunk);
    cursor += chunk.length;
  }
  const xrefAt = cursor;
  let xref = `xref\n0 ${starts.length + 1}\n0000000000 65535 f \n`;
  for (const start of starts) xref += `${String(start).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${starts.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  chunks.push(textOf(xref));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { width: 1, height: 1 };
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      if (width > 0 && height > 0) return { width, height };
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;
    i += 2 + length;
  }
  return { width: 1, height: 1 };
}
