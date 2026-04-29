import matter from "gray-matter";
import { basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { readMdFile, findMdFiles, fileExists, rawPath } from "../utils/fs.js";
import type { SourceCategory } from "../types.js";
import type { RawDocument, IngestOptions, IngestResult } from "./types.js";

function detectCategory(frontmatter: Record<string, unknown>, content: string): SourceCategory {
  const categoryStr = String(frontmatter.category ?? frontmatter.type ?? "").toLowerCase();
  if (["article", "paper", "repo", "dataset", "image"].includes(categoryStr)) {
    return categoryStr as SourceCategory;
  }
  // Heuristic: if content has a DOI or arXiv link, it's a paper
  if (/arxiv\.org|doi\.org|\.pdf\b/i.test(content)) return "paper";
  // Default to article
  return "article";
}

function extractTags(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags ?? frontmatter.tag ?? [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function extractSourceUrl(frontmatter: Record<string, unknown>): string | undefined {
  return (
    String(frontmatter.source ?? frontmatter.sourceUrl ?? frontmatter.url ?? frontmatter.link ?? "") || undefined
  );
}

function extractDate(frontmatter: Record<string, unknown>): string | undefined {
  const raw = frontmatter.date ?? frontmatter.created ?? frontmatter.published ?? frontmatter.updated;
  if (!raw) return undefined;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString().slice(0, 10);
}

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function docId(filePath: string): string {
  const name = basename(filePath, extname(filePath));
  // 将空格和特殊字符替换为 -，但保留中文、字母、数字
  return name
    .trim()
    .replace(/[\s_]+/g, "-")           // 空格和下划线转成 -
    .replace(/[^\w\u4e00-\u9fa5-]/g, "") // 保留字母、数字、中文、连字符
    .replace(/-+/g, "-")                // 多个连字符合并成一个
    .replace(/^-|-$/g, "")              // 去掉首尾的 -
    .toLowerCase();
}

export async function ingestRawDocs(options: IngestOptions = {}): Promise<IngestResult> {
  const files = await findMdFiles(rawPath());
  const errors: string[] = [];
  const documents: RawDocument[] = [];

  let manifest: Record<string, string> = {};
  if (options.incremental && options.manifestPath) {
    try {
      const manifestContent = await readMdFile(options.manifestPath);
      manifest = JSON.parse(manifestContent);
    } catch {
      // Start fresh
    }
  }

  for (const filePath of files) {
    try {
      const content = await readMdFile(filePath);
      const hash = computeHash(content);
      const id = docId(filePath);
      // Skip unchanged files in incremental mode
      if (options.incremental && manifest[id] === hash) continue;

      const parsed = matter(content);
      const { data, content: body } = parsed;

      const doc: RawDocument = {
        id,
        title: String(data.title ?? data.Name ?? basename(filePath, extname(filePath))),
        sourceUrl: extractSourceUrl(data),
        date: extractDate(data),
        tags: extractTags(data),
        category: detectCategory(data, content),
        filePath,
        content: body.trim(),
        frontmatter: data,
      };

      documents.push(doc);
      manifest[id] = hash;
    } catch (err) {
      errors.push(`Error processing ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { documents, errors };
}
