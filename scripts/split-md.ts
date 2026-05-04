#!/usr/bin/env npx tsx
/**
 * Recursively split a markdown file by heading hierarchy until each chunk
 * is under a specified word count limit.
 *
 * Usage:
 *   npx tsx scripts/split-md.ts input.md
 *   npx tsx scripts/split-md.ts input.md --max-words 3000
 *   npx tsx scripts/split-md.ts input.md --max-words 2000 -o chunks/
 *
 * How it works:
 *   1. Detect heading levels used in the file (h1, h2, h3, …)
 *   2. Split at the highest heading level present
 *   3. If any section exceeds --max-words, recurse into it using the next heading level
 *   4. If no deeper heading exists, that oversized section is kept as-is
 *   5. Output numbered chunk files (input-1.md, input-2.md, …)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const DEFAULT_MAX_WORDS = 3000;

interface Options {
  maxWords: number;
  outputDir: string;
}

function parseArgs(): { input: string; opts: Options } {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Usage: npx tsx scripts/split-md.ts <input.md> [options]

Options:
  --max-words <num>   Word count limit per chunk (default: ${DEFAULT_MAX_WORDS})
  -o, --output <dir>  Output directory (default: same as input file)
  -h, --help          Show this help
`);
    process.exit(0);
  }

  const input = resolve(args[0]);
  const opts: Options = { maxWords: DEFAULT_MAX_WORDS, outputDir: dirname(input) };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--max-words":
        opts.maxWords = Number(args[++i]);
        break;
      case "-o":
      case "--output":
        opts.outputDir = resolve(args[++i]);
        break;
    }
  }

  return { input, opts };
}

/** Split content into lines and count "words" (Chinese chars + whitespace-delimited tokens). */
function wordCount(text: string): number {
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return 0;
  // Count CJK characters individually, and non-CJK words by whitespace
  const cjk = (cleaned.match(/[一-鿿㐀-䶿＀-￯]/g) || []).length;
  const nonCjk = cleaned
    .replace(/[一-鿿㐀-䶿＀-￯]/g, " ")
    .split(/[\s]+/)
    .filter(Boolean).length;
  return cjk + nonCjk;
}

/** Detect which heading levels (depth numbers) are used in the content. */
function detectHeadingLevels(content: string): number[] {
  const lines = content.split("\n");
  const levels = new Set<number>();
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s/);
    if (m) levels.add(m[1].length);
  }
  return [...levels].sort((a, b) => a - b);
}

/** Extract section title from a heading line. */
function sectionTitle(line: string): string {
  return line.replace(/^#+\s*/, "").trim();
}

/**
 * Split content into sections at a given heading level.
 * Returns array of { headingLine, bodyLines }.
 */
interface Section {
  heading: string; // e.g. "## Introduction"
  title: string;
  body: string; // heading + body text
}

function splitAtLevel(content: string, level: number): Section[] {
  const pattern = new RegExp(`^#{${level}}\\s`, "m");
  const lines = content.split("\n");
  const sections: Section[] = [];

  let startIdx = -1;
  for (let i = 0; i <= lines.length; i++) {
    const isHeading = i < lines.length && pattern.test(lines[i]);
    const isEnd = i === lines.length;

    if ((isHeading || isEnd) && startIdx !== -1) {
      const sectionLines = lines.slice(startIdx, i);
      sections.push({
        heading: lines[startIdx],
        title: sectionTitle(lines[startIdx]),
        body: sectionLines.join("\n"),
      });
    }

    if (isHeading) startIdx = i;
  }

  return sections;
}

/** Recursively split a content block until all chunks are under maxWords. */
function splitRecursive(
  content: string,
  levels: number[],
  depthIdx: number,
  maxWords: number,
): string[] {
  if (wordCount(content) <= maxWords || depthIdx >= levels.length) {
    return [content];
  }

  const level = levels[depthIdx];
  const sections = splitAtLevel(content, level);

  // If no sections found at this level (shouldn't happen for valid md), bail
  if (sections.length <= 1) {
    return depthIdx + 1 < levels.length
      ? splitRecursive(content, levels, depthIdx + 1, maxWords)
      : [content];
  }

  const result: string[] = [];
  for (const section of sections) {
    const subChunks = splitRecursive(section.body, levels, depthIdx + 1, maxWords);
    result.push(...subChunks);
  }
  return result;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : text + "\n";
}

function run(): void {
  const { input, opts } = parseArgs();

  if (!input.endsWith(".md")) {
    console.error("Error: input must be a .md file");
    process.exit(1);
  }

  const content = readFileSync(input, "utf-8");
  console.error(`Read ${input} (${wordCount(content)} words)`);

  const levels = detectHeadingLevels(content);
  if (levels.length === 0) {
    // No headings at all — just copy as a single chunk
    const base = basename(input, extname(input));
    const outPath = join(opts.outputDir, `${base}-1.md`);
    writeFileSync(outPath, ensureTrailingNewline(content));
    console.error(`No headings found, saved as single chunk: ${outPath}`);
    process.exit(0);
  }

  console.error(`Detected heading levels: ${levels.map((l) => `h${l}`).join(", ")}`);

  const chunks = splitRecursive(content, levels, 0, opts.maxWords);
  console.error(`Split into ${chunks.length} chunk(s)`);

  mkdirSync(opts.outputDir, { recursive: true });

  const base = basename(input, extname(input));
  for (let i = 0; i < chunks.length; i++) {
    const outPath = join(opts.outputDir, `${base}-${i + 1}.md`);
    writeFileSync(outPath, ensureTrailingNewline(chunks[i]));
    console.error(`  ${outPath} (${wordCount(chunks[i])} words)`);
  }
}

run();
