import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { SearchResult } from "../types.js";
import { wikiPath } from "../utils/fs.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "this", "that", "these", "those", "it", "its", "they", "them", "their",
  "we", "us", "our", "you", "your", "he", "she", "him", "her", "his",
  "not", "no", "nor", "so", "if", "then", "than", "too", "very", "just",
  "about", "also", "into", "over", "such", "each", "only", "other", "some",
  "more", "most", "many", "much", "like", "how", "what", "which", "who",
  "all", "both", "each", "few", "own", "same",
]);

interface IndexEntry {
  count: number;
}

type InvertedIndex = Map<string, Map<string, IndexEntry>>;

let cachedIndex: { index: InvertedIndex; docCount: number; docTitles: Map<string, string> } | null = null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function walkMdFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkMdFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist yet
  }
  return files;
}

function extractTitle(content: string, filePath: string): string {
  // Try to extract title from markdown H1
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1].trim();
  // Fall back to filename
  return basename(filePath, ".md");
}

export function buildIndex(): { index: InvertedIndex; docCount: number; docTitles: Map<string, string> } {
  const index: InvertedIndex = new Map();
  const docTitles = new Map<string, string>();
  const allFiles = walkMdFiles(wikiPath());

  for (const filePath of allFiles) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const title = extractTitle(content, filePath);
      docTitles.set(filePath, title);

      const terms = tokenize(content);
      const termCounts = new Map<string, number>();
      for (const term of terms) {
        termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
      }

      for (const [term, count] of termCounts) {
        if (!index.has(term)) index.set(term, new Map());
        index.get(term)!.set(filePath, { count });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { index, docCount: allFiles.length, docTitles };
}

export function getIndex(): { index: InvertedIndex; docCount: number; docTitles: Map<string, string> } {
  if (!cachedIndex) {
    cachedIndex = buildIndex();
  }
  return cachedIndex;
}

export function clearCache(): void {
  cachedIndex = null;
}

export function search(query: string, limit = 20): SearchResult[] {
  const { index, docCount, docTitles } = getIndex();
  if (docCount === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scores = new Map<string, number>();
  const snippets = new Map<string, string>();

  for (const term of queryTerms) {
    const postings = index.get(term);
    if (!postings) continue;

    const df = postings.size;
    const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));

    for (const [filePath, entry] of postings) {
      const tf = 1 + Math.log(entry.count);
      scores.set(filePath, (scores.get(filePath) ?? 0) + tf * idf);
    }
  }

  const sorted = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  return sorted.map(([filePath, score]) => {
    const title = docTitles.get(filePath) ?? basename(filePath, ".md");
    const snippet = generateSnippet(filePath, queryTerms);
    return { filePath, title, score, snippet };
  });
}

function generateSnippet(filePath: string, queryTerms: string[]): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const bodyLines = lines.filter((l) => !l.startsWith("#") && l.trim().length > 0);

    // Find the line with the highest density of query terms
    let bestLine = 0;
    let bestScore = 0;
    for (let i = 0; i < bodyLines.length; i++) {
      const lower = bodyLines[i].toLowerCase();
      const score = queryTerms.filter((t) => lower.includes(t)).length;
      if (score > bestScore) {
        bestScore = score;
        bestLine = i;
      }
    }

    if (bodyLines.length === 0) return "";
    const snippet = bodyLines[bestLine].trim();
    return snippet.length > 200 ? snippet.slice(0, 200) + "..." : snippet;
  } catch {
    return "";
  }
}
