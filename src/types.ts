export type SourceCategory = "article" | "paper" | "repo" | "dataset" | "image";

export interface SourceDoc {
  id: string;
  title: string;
  sourceUrl?: string;
  date?: string;
  tags: string[];
  category: SourceCategory;
  filePath: string;
  content: string;
  summary?: string;
}

export interface Concept {
  name: string;
  aliases: string[];
  summary: string;
  relatedConcepts: string[];
  sourceIds: string[];
}

export interface WikiDoc {
  filePath: string;
  title: string;
  content: string;
  backlinks: string[];
  tags: string[];
}

export interface CompileResult {
  newDocs: number;
  updatedDocs: number;
  errors: string[];
}

export interface SearchResult {
  filePath: string;
  title: string;
  score: number;
  snippet: string;
}

export interface QAResult {
  question: string;
  answer: string;
  sources: string[];
}

export interface LintIssue {
  severity: "warning" | "error";
  message: string;
  filePath?: string;
  suggestion?: string;
}
