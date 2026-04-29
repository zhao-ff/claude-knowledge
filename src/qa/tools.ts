import { readFileSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { wikiPath, rawPath } from "../utils/fs.js";
import { search } from "../search/index.js";

function readFileSafely(basePath: string, requestedPath: string): string {
  const normalized = join("/", requestedPath).replace(/^\/+/, "");
  const fullPath = join(basePath, normalized);
  if (!fullPath.startsWith(basePath)) {
    throw new Error("Access denied: path outside allowed directory");
  }
  return readFileSync(fullPath, "utf-8");
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: false };
}

function errorResult(error: string) {
  return { content: [{ type: "text" as const, text: error }], isError: true };
}

export const wikiTools = [
  tool(
    "read_file",
    "Read the full content of a wiki file by its path (relative to the wiki directory). Use this to examine concept pages, source summaries, or the wiki index.",
    {
      path: z.string().describe('Path relative to wiki/ directory, e.g. "concepts/transformer.md"'),
    },
    async ({ path }) => {
      try {
        const content = readFileSafely(wikiPath(), path);
        return textResult(content);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  ),

  tool(
    "read_raw_file",
    "Read a raw source document by its filename. Use this when you need full details from an original article that may not be fully captured in the wiki summary.",
    {
      path: z.string().describe('Filename from raw/ directory, e.g. "example-article.md" or subpath like "papers/attention-is-all-you-need.md"'),
    },
    async ({ path }) => {
      try {
        const content = readFileSafely(rawPath(), path);
        return textResult(content);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  ),

  tool(
    "search_wiki",
    "Search the wiki for relevant pages using keywords. Returns matching pages with titles and snippets.",
    {
      query: z.string().describe("Search keywords to find relevant wiki pages"),
      limit: z.number().optional().default(10).describe("Maximum number of results"),
    },
    async ({ query, limit }) => {
      try {
        const results = search(query, limit);
        return textResult(JSON.stringify(results, null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  ),

  tool(
    "list_concepts",
    "List all concept pages available in the wiki. Returns file names and titles.",
    {},
    async () => {
      try {
        const conceptsDir = wikiPath("concepts");
        let files: string[];
        try {
          files = readdirSync(conceptsDir).filter((f) => f.endsWith(".md"));
        } catch {
          files = [];
        }
        const concepts = files.map((f) => {
          const name = basename(f, extname(f));
          let title = name;
          try {
            const content = readFileSync(join(conceptsDir, f), "utf-8");
            const h1 = content.match(/^#\s+(.+)/m);
            if (h1) title = h1[1].trim();
          } catch { /* use filename */ }
          return { file: f, title };
        });
        return textResult(JSON.stringify(concepts, null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  ),

  tool(
    "list_sources",
    "List all source documents in the wiki. Returns document IDs, categories, tags, and summaries.",
    {},
    async () => {
      try {
        const sourcesPath = wikiPath("SOURCES.md");
        const content = readFileSync(sourcesPath, "utf-8");
        const lines = content.split("\n");
        const tableLines = lines.filter((l) => l.startsWith("|") && !l.includes("---"));
        const dataLines = tableLines.slice(2);
        const sources = dataLines.map((line) => {
          const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells.length >= 4) {
            const docMatch = cells[0].match(/\[\[(.+)\]\]/);
            return { id: docMatch ? docMatch[1] : cells[0], category: cells[1], tags: cells[2], summary: cells[3] };
          }
          return null;
        }).filter(Boolean);
        return textResult(JSON.stringify(sources, null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  ),

  tool(
    "list_raw_files",
    "List all available raw source documents in the raw/ directory. Returns filenames and IDs.",
    {},
    async () => {
      try {
        function walk(dir: string, prefix = ""): Array<{ file: string; id: string }> {
          const results: Array<{ file: string; id: string }> = [];
          try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(dir, entry.name);
              if (entry.isDirectory()) {
                results.push(...walk(fullPath, join(prefix, entry.name)));
              } else if (entry.isFile() && entry.name.endsWith(".md")) {
                const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                results.push({ file: relPath, id: basename(entry.name, extname(entry.name)) });
              }
            }
          } catch { /* directory may not exist */ }
          return results;
        }
        return textResult(JSON.stringify(walk(rawPath()), null, 2));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  ),
];
