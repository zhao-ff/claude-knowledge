import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Config {
  anthropicApiKey: string;
  baseURL: string;
  model: string;
  wikiDir: string;
  rawDir: string;
  searchPort: number;
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(".env", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  } catch {
    // .env not found, use process.env
  }
  return env;
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;

  const env = loadEnv();

  cached = {
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "",
    baseURL: env.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? "",
    model: env.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? "",
    wikiDir: env.WIKI_DIR ?? process.env.WIKI_DIR ?? join(process.cwd(), "wiki"),
    rawDir: env.RAW_DIR ?? process.env.RAW_DIR ?? join(process.cwd(), "raw"),
    searchPort: Number(env.SEARCH_PORT ?? process.env.SEARCH_PORT ?? 3456),
  };

  return cached;
}
