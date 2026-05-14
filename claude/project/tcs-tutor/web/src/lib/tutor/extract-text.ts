/**
 * Server-side helpers for pulling plain text out of an uploaded syllabus
 * file. Supports PDF, DOCX, and plain text. Returns trimmed text or
 * throws with a user-readable message.
 *
 * These imports are inside the functions so Next.js doesn't try to
 * bundle the (Node-only) pdf-parse / mammoth libraries into client
 * code paths.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function extractTextFromFile(file: File): Promise<string> {
  if (!file || !file.size) throw new Error('No file uploaded.');
  if (file.size > MAX_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max 10 MB).`);
  }

  const name = (file.name ?? '').toLowerCase();
  const type = (file.type ?? '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return (await extractPdf(buf)).trim();
  }
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return (await extractDocx(buf)).trim();
  }
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return buf.toString('utf8').trim();
  }
  throw new Error(`Unsupported file type${name ? ` (${name})` : ''}. Use PDF, DOCX, or plain text.`);
}

async function extractPdf(buf: Buffer): Promise<string> {
  try {
    // pdf-parse v2.x uses a class-based API. Convert Buffer → Uint8Array
    // (the lib accepts Buffer, but being explicit makes it consistent
    // across bundlers).
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    await parser.destroy().catch(() => undefined);

    // result.text is undefined for image-only / scanned PDFs.
    // Combine with per-page text if the lib exposes it differently.
    const text = (result as unknown as { text?: string }).text ?? '';
    if (!text.trim()) {
      throw new Error(
        'PDF appears to have no embedded text (likely a scanned image). OCR isn\'t wired up yet — paste the text or upload a text PDF.',
      );
    }
    return text;
  } catch (err) {
    console.error('[extract-text] PDF parse failed:', err);
    throw new Error(`Could not read PDF: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractDocx(buf: Buffer): Promise<string> {
  try {
    const mod = await import('mammoth');
    const mammoth = (mod.default ?? mod) as unknown as {
      extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value ?? '';
  } catch (err) {
    console.error('[extract-text] DOCX parse failed:', err);
    throw new Error(`Could not read DOCX: ${err instanceof Error ? err.message : String(err)}`);
  }
}
