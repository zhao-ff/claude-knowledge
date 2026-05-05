#!/usr/bin/env npx tsx
/**
 * PDF to Markdown converter via MinerU flash-extract.
 *
 * Splits large PDFs into chunks respecting both page (20) and file size (10MB) limits,
 * sends each to `mineru-open-api flash-extract`, then concatenates the results.
 *
 * Usage:
 *   npx tsx scripts/pdf2md.ts input.pdf -o output.md
 *   npx tsx scripts/pdf2md.ts input.pdf -o output.md --lang en --ocr
 *   npx tsx scripts/pdf2md.ts input.pdf                         # stdout
 *
 * Dependencies:
 *   - mineru-open-api CLI (https://mineru.net/ecosystem)
 *   - pdf-lib (npm)
 */

import { readFile, writeFile, stat, rm, unlink } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { execSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";

const MAX_PAGES = 20;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface Options {
  output?: string;
  lang?: string;
  ocr?: boolean;
  formula?: boolean;
  table?: boolean;
  maxSizeMb?: number;
  keep?: boolean;
}

function parseArgs(): { input: string; opts: Options } {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Usage: npx tsx scripts/pdf2md.ts <input.pdf> [options]

Options:
  -o, --output <path>   Output markdown file (default: stdout)
  --lang <code>         Document language (default: "ch")
  --ocr                 Enable OCR for scanned documents
  --formula             Enable formula recognition
  --table               Enable table recognition
  --max-size <mb>       Max file size per chunk in MB (default: 10)
  --keep                Keep intermediate chunk files after merge
  -h, --help            Show this help
`);
    process.exit(0);
  }

  const input = args[0];
  const opts: Options = {};

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "-o":
      case "--output":
        opts.output = args[++i];
        break;
      case "--lang":
        opts.lang = args[++i];
        break;
      case "--ocr":
        opts.ocr = true;
        break;
      case "--formula":
        opts.formula = true;
        break;
      case "--table":
        opts.table = true;
        break;
      case "--max-size":
        opts.maxSizeMb = Number(args[++i]);
        break;
      case "--keep":
        opts.keep = true;
        break;
    }
  }

  return { input, opts };
}

function buildArgs(chunkPath: string, pageRange: string, opts: Options, outputPath?: string): string[] {
  const out = outputPath || chunkPath.replace(/\.pdf$/i, ".md");
  const args = ["flash-extract", chunkPath, "--pages", pageRange, "-o", out];
  if (opts.lang) args.push("--language", opts.lang);
  if (opts.ocr) args.push("--ocr");
  if (opts.formula === false) args.push("--formula=false");
  if (opts.table === false) args.push("--table=false");
  return args;
}

async function readPdf(pdfPath: string): Promise<{ doc: PDFDocument; data: Buffer }> {
  const data = await readFile(pdfPath);
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  return { doc, data };
}

/** Calculate safe pages-per-chunk respecting both page and size limits. */
function calcChunkSize(
  totalPages: number,
  totalBytes: number,
  maxSizeBytes: number,
): number {
  if (totalPages <= 1) return 1;
  const avgBytesPerPage = totalBytes / totalPages;
  const bySize = Math.floor(maxSizeBytes / avgBytesPerPage);
  return Math.max(1, Math.min(MAX_PAGES, bySize));
}

/** Split PDF pages into chunk files, returning paths. */
async function splitPdf(
  pdfPath: string,
  chunkDir: string,
  pagesPerChunk: number,
  maxSizeBytes: number,
): Promise<string[]> {
  const { doc: srcDoc, data } = await readPdf(pdfPath);
  const totalPages = srcDoc.getPageCount();
  const chunkPaths: string[] = [];
  const m = 1024 * 1024;

  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const chunkDoc = await PDFDocument.create();
    const indices = srcDoc.getPageIndices().slice(start, end);
    const copied = await chunkDoc.copyPages(srcDoc, indices);
    for (const page of copied) chunkDoc.addPage(page);

    const chunkBytes = await chunkDoc.save();
    const chunkPath = join(chunkDir, `chunk-${Math.floor(start / pagesPerChunk) + 1}.pdf`);

    // If even a single chunk exceeds size limit, warn and halve the chunk
    if (chunkBytes.length > maxSizeBytes && pagesPerChunk > 1) {
      const halfChunk = Math.ceil(pagesPerChunk / 2);
      console.error(`  chunk exceeds ${maxSizeBytes / m}MB, re-splitting (${pagesPerChunk} → ${halfChunk} pages per chunk)...`);
      // Clean up already-written chunks from this batch
      for (const p of chunkPaths) await unlink(p).catch(() => {});
      return splitPdf(pdfPath, chunkDir, halfChunk, maxSizeBytes);
    }

    await writeFile(chunkPath, chunkBytes);
    chunkPaths.push(chunkPath);
    console.error(`  chunk ${chunkPaths.length}: pages ${start + 1}-${end} (${(chunkBytes.length / m).toFixed(1)}MB)`);
  }

  return chunkPaths;
}

async function run(): Promise<void> {
  const { input, opts } = parseArgs();

  if (!input.endsWith(".pdf") && !input.match(/\.pdf$/i)) {
    console.error("Error: input must be a PDF file");
    process.exit(1);
  }

  // Verify CLI is available
  try {
    execSync("mineru-open-api flash-extract --help", { stdio: "ignore" });
  } catch {
    console.error("Error: mineru-open-api CLI not found. Install it from https://mineru.net/ecosystem");
    process.exit(1);
  }

  const maxSizeBytes = (opts.maxSizeMb ?? MAX_SIZE_BYTES / (1024 * 1024)) * 1024 * 1024;
  const m = 1024 * 1024;

  console.error(`Reading ${input}...`);
  const fileStat = await stat(input);
  const totalBytes = fileStat.size;
  const { doc: srcDoc } = await readPdf(input);
  const totalPages = srcDoc.getPageCount();
  console.error(`Total: ${totalPages} pages, ${(totalBytes / m).toFixed(1)}MB`);

  // Warn if even a single page is too large
  const avgBytesPerPage = totalBytes / totalPages;
  if (avgBytesPerPage > maxSizeBytes) {
    console.error(`Warning: average page size (${(avgBytesPerPage / m).toFixed(1)}MB) exceeds limit (${maxSizeBytes / m}MB).`);
    console.error("Even a single page may be rejected by the flash-extract API.");
    console.error("Consider using the standard 'extract' command with a token instead.");
  }

  const chunkSize = totalBytes <= maxSizeBytes
    ? MAX_PAGES
    : calcChunkSize(totalPages, totalBytes, maxSizeBytes);

  const needsSplit = totalPages > MAX_PAGES || totalBytes > maxSizeBytes;

  if (!needsSplit) {
    // Single chunk, send directly
    console.error("File within limits, sending directly...");
    const mdPath = opts.output || input.replace(/\.pdf$/i, ".md");
    const args = buildArgs(input, `1-${totalPages}`, opts, mdPath);
    execSync(`mineru-open-api ${args.join(" ")}`, { stdio: "inherit" });
    if (opts.output) {
      // mineru-open-api already wrote to mdPath (= opts.output)
      console.error(`Done: ${opts.output}`);
    } else {
      const md = await readFile(mdPath, "utf-8");
      console.log(md);
    }
    return;
  }

  // Split into size-safe chunks
  console.error(`Splitting into ≤${chunkSize}-page chunks...`);
  const outBase = opts.output
    ? join(dirname(opts.output), basename(opts.output, extname(opts.output)))
    : join(dirname(input), basename(input, extname(input)));
  const chunkDir = join(dirname(outBase), `${basename(outBase)}_chunks`);
  mkdirSync(chunkDir, { recursive: true });
  const chunks = await splitPdf(input, chunkDir, chunkSize, maxSizeBytes);

  // Process each chunk
  const markdownParts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Re-read chunk to get its actual page count for the range string
    const { doc } = await readPdf(chunk);
    const chunkPages = doc.getPageCount();
    const globalStart = i * chunkSize + 1;
    const globalEnd = globalStart + chunkPages - 1;
    const range = `${globalStart}-${globalEnd}`;

    console.error(`[${i + 1}/${chunks.length}] Processing pages ${range}...`);

    const mdPath = chunk.replace(/\.pdf$/i, ".md");
    const args = buildArgs(chunk, `1-${chunkPages}`, opts);
    execSync(`mineru-open-api ${args.join(" ")}`, { stdio: "inherit" });

    const md = await readFile(mdPath, "utf-8");
    markdownParts.push(`<!-- pages ${range} -->\n\n${md}`);
  }

  const finalMd = markdownParts.join("\n\n---\n\n");

  if (opts.output) {
    await writeFile(opts.output, finalMd, "utf-8");
    console.error(`Done: ${opts.output}`);
    if (opts.keep) {
      console.error(`Chunks kept in: ${chunkDir}/`);
    } else {
      await rm(chunkDir, { recursive: true, force: true });
      console.error(`Chunks cleaned up. Use --keep to preserve them.`);
    }
  } else {
    console.log(finalMd);
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
