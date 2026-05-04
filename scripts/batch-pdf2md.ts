#!/usr/bin/env npx tsx
/**
 * Batch convert PDFs from multiple directories to MD, saving outputs to RAW_DIR.
 *
 * Usage:
 *   npx tsx scripts/batch-pdf2md.ts D:\docs\papers D:\docs\reports
 *   npx tsx scripts/batch-pdf2md.ts /home/user/pdfs --raw-dir ./raw
 *   npx tsx scripts/batch-pdf2md.ts /home/user/pdfs --force
 *
 * Scans each source directory recursively for PDFs, converts each via pdf2md.ts,
 * and places the resulting .md file into RAW_DIR (from .env or --raw-dir).
 * Already-converted PDFs are skipped (by filename) unless --force is used.
 */

import "dotenv/config";
import { readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative, dirname, basename, extname } from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF2MD_SCRIPT = join(__dirname, "pdf2md.ts");

interface Options {
  rawDir: string;
  force: boolean;
}

function parseArgs(): { sources: string[]; opts: Options } {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Usage: npx tsx scripts/batch-pdf2md.ts <dir> [dir...] [options]

Arguments:
  dir(s)                  One or more directories to scan for PDFs

Options:
  --raw-dir <path>        Output directory (default: RAW_DIR from .env or ./raw)
  --force                 Re-convert even if .md already exists
  -h, --help              Show this help

Examples:
  npx tsx scripts/batch-pdf2md.ts D:\\docs\\papers D:\\docs\\reports
  npx tsx scripts/batch-pdf2md.ts /home/user/pdfs --raw-dir ./my-raw
  npx tsx scripts/batch-pdf2md.ts /home/user/pdfs --force
`);
    process.exit(0);
  }

  const sources: string[] = [];
  const opts: Options = {
    rawDir: process.env.RAW_DIR || resolve(process.cwd(), "raw"),
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--raw-dir") {
      opts.rawDir = resolve(args[++i]);
    } else if (args[i] === "--force") {
      opts.force = true;
    } else {
      sources.push(resolve(args[i]));
    }
  }

  return { sources, opts };
}

/** Recursively find all .pdf files in a directory. */
function findPdfs(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPdfs(fullPath));
    } else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function run(): void {
  const { sources, opts } = parseArgs();

  // Verify pdf2md.ts exists
  if (!existsSync(PDF2MD_SCRIPT)) {
    console.error(`Error: pdf2md.ts not found at ${PDF2MD_SCRIPT}`);
    process.exit(1);
  }

  // Verify source directories
  const validSources = sources.filter((d) => {
    if (!existsSync(d)) {
      console.error(`Warning: directory not found, skipping: ${d}`);
      return false;
    }
    if (!statSync(d).isDirectory()) {
      console.error(`Warning: not a directory, skipping: ${d}`);
      return false;
    }
    return true;
  });

  if (validSources.length === 0) {
    console.error("Error: no valid source directories provided");
    process.exit(1);
  }

  // Ensure output directory exists
  mkdirSync(opts.rawDir, { recursive: true });

  // Collect all PDFs
  const allPdfs: string[] = [];
  for (const dir of validSources) {
    const pdfs = findPdfs(dir);
    console.error(`  ${pdfs.length} PDF(s) found in ${dir}`);
    allPdfs.push(...pdfs);
  }

  if (allPdfs.length === 0) {
    console.error("No PDFs found in source directories.");
    process.exit(0);
  }

  console.error(`\nTotal: ${allPdfs.length} PDF(s), output to ${opts.rawDir}`);

  // Track results
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const pdfPath of allPdfs) {
    const mdName = basename(pdfPath, extname(pdfPath)) + ".md";
    const outPath = join(opts.rawDir, mdName);

    // Skip if output already exists and not --force
    if (!opts.force && existsSync(outPath)) {
      console.error(`  SKIP ${mdName} (already exists)`);
      skipped++;
      continue;
    }

    console.error(`\n[${converted + skipped + failed + 1}/${allPdfs.length}] Converting ${basename(pdfPath)}...`);

    try {
      execSync(`npx tsx "${PDF2MD_SCRIPT}" "${pdfPath}" -o "${outPath}"`, {
        stdio: "inherit",
        cwd: join(__dirname, ".."),
      });
      // pdf2md.ts outputs merged md and deletes chunks (unless --keep)
      // The output is at outPath
      console.error(`  OK ${mdName}`);
      converted++;
    } catch (err) {
      console.error(`  FAIL ${mdName}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.error(`\nDone: ${converted} converted, ${skipped} skipped, ${failed} failed`);
}

run();
