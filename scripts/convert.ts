#!/usr/bin/env npx tsx
/**
 * Convert documents to markdown via pandoc and store them in raw/.
 *
 * Reads any pandoc-supported file (docx, epub, html, tex, odt, org, rst,
 * csv, ipynb, pdf, mediawiki, etc.), converts to .md, and writes to
 * $RAW_DIR (default: ./raw/).
 *
 * Usage:
 *   npx tsx scripts/convert.ts document.docx
 *   npx tsx scripts/convert.ts document.docx article.html notes.org
 *   npx tsx scripts/convert.ts ./downloads/
 *   npx tsx scripts/convert.ts ./downloads/ --overwrite
 *   npx tsx scripts/convert.ts book.html --from html
 *   RAW_DIR=./my-raw npx tsx scripts/convert.ts paper.pdf
 *
 * Dependencies:
 *   - pandoc (https://pandoc.org/installing.html)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const RAW_DIR = process.env.RAW_DIR || resolve(process.cwd(), "raw");

interface Options {
  from?: string;
  overwrite: boolean;
  recursive: boolean;
}

function parseArgs(): { paths: string[]; opts: Options } {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Convert documents to markdown via pandoc and store in raw/.

Usage:
  npx tsx scripts/convert.ts <file|dir> [file|dir...] [options]

Arguments:
  file/dir(s)           One or more files or directories to convert

Options:
  -f, --from <format>   Input format (default: auto-detect from extension)
  -o, --overwrite       Overwrite existing .md files in raw/
  --no-recursive        Don't recurse into subdirectories
  -h, --help            Show this help

Formats: docx epub html/htm tex/ltx odt org rst tsv csv txt ipynb pdf mediawiki

Examples:
  npx tsx scripts/convert.ts report.docx
  npx tsx scripts/convert.ts ./papers/ --overwrite
  RAW_DIR=./wiki/raw npx tsx scripts/convert.ts paper.pdf
`);
    process.exit(0);
  }

  const paths: string[] = [];
  const opts: Options = { overwrite: false, recursive: true };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-f":
      case "--from":
        opts.from = args[++i];
        break;
      case "-o":
      case "--overwrite":
        opts.overwrite = true;
        break;
      case "--no-recursive":
        opts.recursive = false;
        break;
      default:
        paths.push(resolve(args[i]));
    }
  }

  return { paths, opts };
}

const EXT_MAP: Record<string, string> = {
  ".docx": "docx",
  ".epub": "epub",
  ".html": "html",
  ".htm": "html",
  ".tex": "latex",
  ".ltx": "latex",
  ".odt": "odt",
  ".org": "org",
  ".rst": "rst",
  ".csv": "csv",
  ".tsv": "tsv",
  ".txt": "markdown",
  ".ipynb": "ipynb",
  ".pdf": "pdf",
  ".mwk": "mediawiki",
  ".wiki": "mediawiki",
};

function guessFormat(filePath: string): string | undefined {
  return EXT_MAP[extname(filePath).toLowerCase()];
}

function convertFile(input: string, opts: Options): string {
  const name = basename(input, extname(input));
  const output = join(RAW_DIR, `${name}.md`);

  if (!opts.overwrite && existsSync(output)) {
    return `  SKIP ${name}.md (already exists)`;
  }

  const fmt = opts.from || guessFormat(input);
  const args = ["--to", "markdown", "--wrap=preserve"];
  if (fmt) args.push("--from", fmt);
  args.push("-o", output, input);

  try {
    execFileSync("pandoc", args, { stdio: ["ignore", "ignore", "pipe"] });
    return `  OK  ${name}.md`;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.error("Error: pandoc not found. Install it:");
      console.error("  sudo apt install pandoc   # Debian/Ubuntu");
      console.error("  brew install pandoc       # macOS");
      console.error("  https://pandoc.org/installing.html");
      process.exit(1);
    }
    const stderr = err.stderr?.toString().trim() || err.message;
    return `  FAIL ${name}.md — ${stderr}`;
  }
}

/** Recursively collect files with known extensions. */
function collectFiles(dir: string, recursive: boolean): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...collectFiles(full, recursive));
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (EXT_MAP[ext]) results.push(full);
    }
  }
  return results;
}

function run(): void {
  const { paths, opts } = parseArgs();

  // Check pandoc availability
  try {
    execFileSync("pandoc", ["--version"], { stdio: "ignore" });
  } catch {
    console.error("Error: pandoc not found. Install it:");
    console.error("  sudo apt install pandoc   # Debian/Ubuntu");
    console.error("  brew install pandoc       # macOS");
    console.error("  https://pandoc.org/installing.html");
    process.exit(1);
  }

  mkdirSync(RAW_DIR, { recursive: true });

  // Collect all files from paths
  const files: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) {
      console.error(`  Warning: path not found, skipping: ${p}`);
      continue;
    }
    if (statSync(p).isDirectory()) {
      files.push(...collectFiles(p, opts.recursive));
    } else {
      files.push(p);
    }
  }

  if (files.length === 0) {
    console.error("No files to convert.");
    process.exit(0);
  }

  console.log(`\nConverting ${files.length} file(s) → ${RAW_DIR}`);
  console.log("─".repeat(50));

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const f of files) {
    const result = convertFile(f, opts);
    console.log(result);
    if (result.includes("OK")) converted++;
    else if (result.includes("SKIP")) skipped++;
    else if (result.includes("FAIL")) failed++;
  }

  console.log("─".repeat(50));
  console.log(`Done: ${converted} converted, ${skipped} skipped, ${failed} failed\n`);
}

run();
