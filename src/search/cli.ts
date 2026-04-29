import { search } from "./index.js";
import { relativePath } from "../utils/fs.js";
import type { SearchResult } from "../types.js";

export interface SearchCliOptions {
  format?: "markdown" | "json";
  limit?: number;
}

export function searchCli(query: string, opts: SearchCliOptions = {}): void {
  const results = search(query, opts.limit ?? 20);
  const format = opts.format ?? "markdown";

  if (format === "json") {
    console.log(JSON.stringify({ query, results }, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No results found for "${query}".`);
    return;
  }

  console.log(`# Search Results for "${query}"\n`);
  console.log(`Found ${results.length} result(s).\n`);

  for (const r of results) {
    console.log(`## ${r.title}`);
    console.log(`Path: ${relativePath(r.filePath)}`);
    console.log(`Score: ${r.score.toFixed(2)}`);
    if (r.snippet) console.log(`\n${r.snippet}`);
    console.log("");
  }
}
