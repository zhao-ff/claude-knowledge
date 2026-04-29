import "dotenv/config";
import { join } from "node:path";

export interface Config {
  anthropicApiKey: string;
  baseURL: string;
  model: string;
  wikiDir: string;
  rawDir: string;
  searchPort: number;
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;

  cached = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "",
    wikiDir: process.env.WIKI_DIR ?? join(process.cwd(), "wiki"),
    rawDir: process.env.RAW_DIR ?? join(process.cwd(), "raw"),
    searchPort: Number(process.env.SEARCH_PORT ?? 3456),
  };

  return cached;
}
