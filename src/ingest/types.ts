import type { SourceCategory } from "../types.js";

export interface IngestResult {
  documents: RawDocument[];
  errors: string[];
}

export interface RawDocument {
  id: string;
  title: string;
  sourceUrl?: string;
  date?: string;
  tags: string[];
  category: SourceCategory;
  filePath: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface IngestOptions {
  /** If true, only return documents changed since last ingest */
  incremental?: boolean;
  /** Manifest file path for tracking changes */
  manifestPath?: string;
}
