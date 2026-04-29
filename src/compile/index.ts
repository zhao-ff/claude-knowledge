import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { getConfig } from "../utils/config.js";
import { ingestRawDocs } from "../ingest/index.js";
import { writeSourcesPage, writeWikiIndexPages, writeConceptPage } from "./article.js";
import { updateBacklinks } from "./backlinks.js";
import { sendMessage } from "../anthropic.js";
import { SYSTEM_SUMMARIZE, buildSummarizeUserPrompt, SYSTEM_COMPILE_ARTICLE } from "./prompts.js";
import { wikiPath } from "../utils/fs.js";
import type { RawDocument } from "../ingest/types.js";
import type { CompileResult } from "../types.js";

const MANIFEST_PATH = ".manifest.json";

interface Manifest {
  docHashes: Record<string, string>;
  docConcepts: Record<string, ExtractedConcept[]>;
}

interface ExtractedConcept {
  name: string;
  relevance: "high" | "medium" | "low";
  aliases: string[];
}

interface DocSummary {
  summary: string;
  concepts: ExtractedConcept[];
  relatedTopics: string[];
}

function loadManifest(): Manifest {
  try {
    const raw = readFileSync(wikiPath(MANIFEST_PATH), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { docHashes: {}, docConcepts: {} };
  }
}

function saveManifest(m: Manifest): void {
  const path = wikiPath(MANIFEST_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(m, null, 2));
}

function docHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function basicSummary(doc: RawDocument): DocSummary {
  return {
    summary: doc.frontmatter?.summary as string ?? `A ${doc.category} about "${doc.title}".`,
    concepts: [],
    relatedTopics: doc.tags,
  };
}

async function llmSummary(doc: RawDocument): Promise<DocSummary> {
  const response = await sendMessage(
    [{ role: "user", content: buildSummarizeUserPrompt(doc) }],
    { system: SYSTEM_SUMMARIZE, maxTokens: 8192 },
  );

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }

  return {
    summary: text.slice(0, 500),
    concepts: [],
    relatedTopics: doc.tags,
  };
}

export async function compileWiki(): Promise<CompileResult> {
  const config = getConfig();
  const hasApiKey = Boolean(config.anthropicApiKey);

  if (!hasApiKey) {
    console.log("No Anthropic API key found. Running in basic mode (frontmatter summaries only).");
  }

  console.log(`Ingesting raw documents from ${config.rawDir}...`);
  const { documents, errors } = await ingestRawDocs();

  const result: CompileResult = { newDocs: 0, updatedDocs: 0, errors: [...errors] };

  if (documents.length === 0) {
    console.log("No documents found.");
    return result;
  }

  // Load manifest and identify new/changed docs
  const manifest = loadManifest();
  const changedDocs: RawDocument[] = [];
  const unchangedDocs: RawDocument[] = [];

  for (const doc of documents) {
    const hash = docHash(doc.content);
    if (manifest.docHashes[doc.id] === hash) {
      unchangedDocs.push(doc);
    } else {
      changedDocs.push(doc);
    }
  }

  console.log(`  ${changedDocs.length} new/changed, ${unchangedDocs.length} unchanged`);

  // Summarize only changed documents
  const docSummaries: Array<{
    id: string;
    title: string;
    summary: string;
    category: string;
    tags: string[];
    concepts: ExtractedConcept[];
  }> = [];

  // Recover summaries and concepts for unchanged docs from manifest/SOURCES.md
  if (unchangedDocs.length > 0) {
    try {
      const sourcesRaw = readFileSync(wikiPath("SOURCES.md"), "utf-8");
      const lines = sourcesRaw.split("\n").filter((l) => l.startsWith("|") && !l.includes("---"));
      for (const doc of unchangedDocs) {
        const row = lines.find((l) => l.includes(`[[${doc.id}]]`));
        if (row) {
          const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells.length >= 4) {
            docSummaries.push({
              id: doc.id,
              title: doc.title,
              summary: cells[3],
              category: String(doc.frontmatter?.category ?? doc.category ?? "article"),
              tags: doc.tags,
              concepts: manifest.docConcepts[doc.id] ?? [],
            });
          }
        }
      }
    } catch {
      // If SOURCES.md doesn't exist yet, treat unchanged as changed
      unchangedDocs.length = 0;
    }
  }

  if (changedDocs.length > 0) {
    console.log(`Summarizing ${changedDocs.length} new/changed document(s)...`);

    const tasks = changedDocs.map(async (doc) => {
      const summary = hasApiKey ? await llmSummary(doc) : basicSummary(doc);
      return {
        id: doc.id,
        title: doc.title,
        summary: summary.summary,
        category: doc.category,
        tags: doc.tags,
        concepts: summary.concepts,
      };
    });

    const settled = await Promise.allSettled(tasks);
    for (let i = 0; i < settled.length; i++) {
      const doc = changedDocs[i];
      const s = settled[i];
      if (s.status === "fulfilled") {
        docSummaries.push(s.value);
        console.log(`  ✓ ${doc.id}`);
      } else {
        const msg = `Failed to summarize ${doc.id}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`;
        result.errors.push(msg);
        console.error(`  ✗ ${doc.id}`);
      }
    }

    // Update manifest for changed docs (hashes + concepts)
    for (const doc of changedDocs) {
      manifest.docHashes[doc.id] = docHash(doc.content);
      const entry = docSummaries.find((s) => s.id === doc.id);
      if (entry) manifest.docConcepts[doc.id] = entry.concepts;
    }
    saveManifest(manifest);
  }

  // Write SOURCES.md
  console.log("Writing SOURCES.md...");
  await writeSourcesPage(
    docSummaries.map(({ id, title, summary, category, tags }) => ({ id, title, summary, category, tags })),
  );

  // Generate concept pages (only if concepts changed or no concept pages exist)
  const allConcepts = docSummaries.flatMap((d) =>
    d.concepts.map((c) => ({ ...c, sourceIds: [d.id] })),
  );

  const hasExistingConceptPages = existsSync(wikiPath("concepts"));
  const shouldGenerateConcepts = changedDocs.length > 0 || !hasExistingConceptPages;

  if (allConcepts.length > 0 && hasApiKey && shouldGenerateConcepts) {
    console.log(`Generating ${allConcepts.length} concept page(s)...`);

    const conceptTasks = allConcepts.map(async (concept) => {
      const sourceDocs = documents
        .filter((d) => concept.sourceIds.includes(d.id))
        .map((d) => `[[${d.id}]]: ${d.title}`);

      const prompt = `Concept: ${concept.name}\nAliases: ${concept.aliases.join(", ")}\nRelevance: ${concept.relevance}\n\nSource documents:\n${sourceDocs.join("\n")}\n\nGenerate a wiki article about this concept based on the source documents.`;

      const response = await sendMessage(
        [{ role: "user", content: prompt }],
        { system: SYSTEM_COMPILE_ARTICLE, maxTokens: 2000 },
      );

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const article = JSON.parse(jsonMatch[0]);
        await writeConceptPage({
          name: concept.name,
          markdown: article.markdown,
          relatedConcepts: article.relatedConcepts ?? [],
          sourceIds: concept.sourceIds,
        });
        return concept.name;
      }
      return null;
    });

    const settledConcepts = await Promise.allSettled(conceptTasks);
    for (const s of settledConcepts) {
      if (s.status === "fulfilled" && s.value) {
        console.log(`  ✓ concept: ${s.value}`);
      } else if (s.status === "rejected") {
        const msg = `Failed to generate concept: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`;
        result.errors.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }
  } else if (allConcepts.length === 0) {
    console.log("Skipping concept page generation (no concepts extracted).");
  } else if (shouldGenerateConcepts) {
    console.log("Skipping concept page generation (no API key).");
  } else {
    console.log("Skipping concept page generation (no documents changed).");
  }

  // Write wiki index
  console.log("Writing wiki/index.md...");
  await writeWikiIndexPages(docSummaries.length);

  // Update backlinks
  console.log("Updating backlinks...");
  const { updated } = await updateBacklinks();
  console.log(`  ${updated} page(s) updated with backlinks.`);

  result.newDocs = changedDocs.length;
  result.updatedDocs = 0;
  console.log(`\nDone. ${changedDocs.length} new/changed, ${unchangedDocs.length} unchanged, ${result.errors.length} error(s).`);

  return result;
}
