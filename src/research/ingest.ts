import { extractResearchPassages, type ResearchPassageDraft } from "./extract.ts";

export interface ResearchDocumentForIngestion {
  id: string;
  research_run_id: string;
  original_filename: string;
  content_type: string;
  content_sha256: string;
}

export interface ResearchDocumentIngestionPlan {
  source: {
    research_run_id: string;
    source_type: "report";
    title: string;
    url: string;
    publisher: string;
    excerpt: string;
    metadata: Record<string, unknown>;
  };
  passages: Array<ResearchPassageDraft & {
    research_run_id: string;
    research_document_id: string;
    content_sha256: string;
    review_status: "unreviewed";
  }>;
  extraction_method: string;
  truncated: boolean;
}

/**
 * Converts an already-authorized private document into owner-scoped research
 * source and passage records. The caller must verify the document/run owner,
 * read bytes from private storage, and persist these records with the user's
 * JWT/RLS. This function never fetches URLs, executes HTML, or verifies claims.
 */
export function buildResearchDocumentIngestionPlan(
  document: ResearchDocumentForIngestion,
  decodedText: string
): ResearchDocumentIngestionPlan {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(document.id) ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(document.research_run_id)) {
    throw new Error("INVALID_RESEARCH_DOCUMENT_REFERENCE");
  }
  if (!/^[0-9a-f]{64}$/.test(document.content_sha256)) {
    throw new Error("INVALID_RESEARCH_DOCUMENT_HASH");
  }
  const contentType = document.content_type.toLowerCase().split(";")[0].trim();
  if (!["text/plain", "text/html", "text/csv"].includes(contentType)) {
    throw new Error("RESEARCH_DOCUMENT_TYPE_NOT_EXTRACTABLE");
  }
  const extraction = extractResearchPassages({
    content: decodedText,
    contentType,
    filename: document.original_filename
  });
  const title = document.original_filename.replace(/[\/\\\u0000-\u001f]/g, " ").trim().slice(0, 500) || "Uploaded research document";
  const passages = extraction.passages.map((passage) => ({
    ...passage,
    research_run_id: document.research_run_id,
    research_document_id: document.id,
    content_sha256: document.content_sha256,
    review_status: "unreviewed" as const
  }));
  return {
    source: {
      research_run_id: document.research_run_id,
      source_type: "report",
      title,
      url: `gigo://research-document/${document.id}`,
      publisher: "Owner-uploaded research document",
      excerpt: passages.slice(0, 2).map((passage) => passage.passage_text).join("\n\n").slice(0, 5000),
      metadata: {
        ingestion_origin: "private_r2_upload",
        research_document_id: document.id,
        content_type: contentType,
        content_sha256: document.content_sha256,
        extraction_method: extraction.extraction_method,
        passage_count: passages.length,
        truncated: extraction.truncated,
        claim_verification: "not_performed"
      }
    },
    passages,
    extraction_method: extraction.extraction_method,
    truncated: extraction.truncated
  };
}
