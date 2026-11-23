export type ResearchExtractionMethod = "manual" | "html_text" | "csv_text";
export type ResearchLocatorType = "paragraph" | "row" | "unspecified";

export interface ResearchPassageDraft {
  passage_text: string;
  locator_type: ResearchLocatorType;
  locator_value: string;
  extraction_method: ResearchExtractionMethod;
}

export interface ResearchExtractionResult {
  extraction_method: ResearchExtractionMethod;
  passages: ResearchPassageDraft[];
  truncated: boolean;
}

const MAX_INPUT_CHARS = 500_000;
const MAX_PASSAGES = 50;
const MAX_PASSAGE_CHARS = 12_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function cleanText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\t\u00a0 ]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function splitPassages(text: string, method: ResearchExtractionMethod, locator: ResearchLocatorType): ResearchPassageDraft[] {
  const blocks = text.split(/\n\s*\n/).map(cleanText).filter(Boolean);
  const output: ResearchPassageDraft[] = [];
  for (let i = 0; i < blocks.length && output.length < MAX_PASSAGES; i++) {
    const block = blocks[i];
    for (let offset = 0; offset < block.length && output.length < MAX_PASSAGES; offset += MAX_PASSAGE_CHARS) {
      output.push({
        passage_text: block.slice(offset, offset + MAX_PASSAGE_CHARS),
        locator_type: locator,
        locator_value: locator === "paragraph" ? String(i + 1) : "",
        extraction_method: method
      });
    }
  }
  return output;
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && quoted && input[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

/**
 * Extract bounded, reviewable text passages from already-decoded source content.
 * This function does not fetch URLs, parse binary PDFs, OCR images, or verify claims.
 */
export function extractResearchPassages(input: {
  content: string;
  contentType: string;
  filename?: string;
}): ResearchExtractionResult {
  if (typeof input.content !== "string" || input.content.length === 0) throw new Error("EMPTY_RESEARCH_CONTENT");
  if (input.content.length > MAX_INPUT_CHARS) throw new Error("RESEARCH_CONTENT_TOO_LARGE");

  const type = input.contentType.toLowerCase().split(";")[0].trim();
  const filename = (input.filename || "").toLowerCase();
  if (type === "application/pdf" || filename.endsWith(".pdf")) {
    throw new Error("PDF_TEXT_EXTRACTION_UNAVAILABLE: provide a text-extracted PDF or use a trusted PDF text extraction worker.");
  }

  if (type === "text/csv" || type === "application/csv" || filename.endsWith(".csv")) {
    const rows = parseCsvRows(input.content);
    const passages = rows.slice(0, MAX_PASSAGES).map((row, index) => ({
      passage_text: row.map((value, cellIndex) => `C${cellIndex + 1}: ${cleanText(value)}`).join(" | ").slice(0, MAX_PASSAGE_CHARS),
      locator_type: "row" as const,
      locator_value: String(index + 1),
      extraction_method: "csv_text" as const
    })).filter(row => row.passage_text.trim());
    return { extraction_method: "csv_text", passages, truncated: rows.length > MAX_PASSAGES };
  }

  if (type === "text/html" || filename.endsWith(".html") || filename.endsWith(".htm")) {
    const text = cleanText(decodeEntities(input.content
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n\n")
      .replace(/<[^>]*>/g, " ")));
    const all = splitPassages(text, "html_text", "paragraph");
    return { extraction_method: "html_text", passages: all, truncated: all.length === MAX_PASSAGES };
  }

  if (type !== "text/plain" && type !== "text/markdown" && type !== "") {
    throw new Error("UNSUPPORTED_RESEARCH_CONTENT_TYPE");
  }
  const all = splitPassages(cleanText(input.content), "manual", "paragraph");
  return { extraction_method: "manual", passages: all, truncated: all.length === MAX_PASSAGES };
}
