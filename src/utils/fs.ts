import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { glob } from "node:fs/promises";

export async function readMdFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export async function writeMdFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

export async function findMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  for await (const entry of glob(`${dir}/**/*.md`)) {
    results.push(entry);
  }
  return results.sort();
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export function wikiPath(...segments: string[]): string {
  return join(process.cwd(), "wiki", ...segments);
}

export function rawPath(...segments: string[]): string {
  return join(process.cwd(), "raw", ...segments);
}

export function relativePath(absolutePath: string): string {
  return relative(process.cwd(), absolutePath);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
