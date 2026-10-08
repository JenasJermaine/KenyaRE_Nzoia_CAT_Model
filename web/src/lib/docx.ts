/**
 * Minimal in-browser .docx text extraction (no dependency): reads the zip central directory, inflates
 * word/document.xml with the native DecompressionStream, and keeps one line per paragraph.
 */
const MAX_DOCX_BYTES = 15 * 1024 * 1024;
/** A crafted zip can declare a tiny file that inflates to gigabytes; real document.xml parts are a few MB at most. */
const MAX_XML_BYTES = 20 * 1024 * 1024;

export async function extractDocxText(file: File): Promise<string> {
  if (file.size > MAX_DOCX_BYTES) throw new Error("This Word file is larger than 15 MB. Save a copy without embedded images, or paste the text instead.");
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .docx file (zip directory not found).");
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let e = 0; e < entries; e++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== "word/document.xml") continue;
    if (size > MAX_XML_BYTES || compSize > MAX_DOCX_BYTES) throw new Error("This Word file's text is unusually large and was not opened. Paste the text instead.");
    const start = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
    const raw = buf.slice(start, start + compSize);
    const xmlBytes = method === 0 ? raw : await inflateRaw(raw);
    return documentXmlToText(decoder.decode(xmlBytes));
  }
  throw new Error("No word/document.xml inside this file — is it a Word document?");
}

/** Inflates with a hard output cap, since the declared size in the zip header can lie. */
async function inflateRaw(data: Uint8Array<ArrayBuffer>) {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_XML_BYTES) {
      await reader.cancel();
      throw new Error("This Word file's text is unusually large and was not opened. Paste the text instead.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function documentXmlToText(xml: string) {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((para) =>
      (para.match(/<w:t[^>]*>[\s\S]*?<\/w:t>|<w:tab\/>/g) ?? [])
        .map((t) => (t === "<w:tab/>" ? "\t" : t.replace(/<[^>]+>/g, "")))
        .join("")
        .replace(/&(amp|lt|gt|quot|apos);/g, (_, k: string) => ENTITIES[k]),
    )
    .filter((line) => line.trim())
    .join("\n");
}
