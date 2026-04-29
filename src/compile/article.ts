import { writeMdFile, ensureDir, wikiPath } from "../utils/fs.js";

export interface ConceptPage {
  name: string;
  markdown: string;
  relatedConcepts: string[];
  sourceIds: string[];
}

export function generateSimpleConceptPage(concept: ConceptPage): string {
  const backlinksSection =
    concept.relatedConcepts.length > 0
      ? `\n## Related\n\n${concept.relatedConcepts.map((c) => `- [[${c}]]`).join("\n")}\n`
      : "";

  const sourcesSection =
    concept.sourceIds.length > 0
      ? `\n## Sources\n\n${concept.sourceIds.map((s) => `- [[${s}]]`).join("\n")}\n`
      : "";

  return `${concept.markdown}\n${backlinksSection}${sourcesSection}`;
}

export async function writeConceptPage(concept: ConceptPage): Promise<string> {
  const filePath = wikiPath("concepts", `${concept.name.toLowerCase().replace(/\s+/g, "-")}.md`);
  await ensureDir(wikiPath("concepts"));
  await writeMdFile(filePath, generateSimpleConceptPage(concept));
  return filePath;
}

export async function writeSourcesPage(
  sources: Array<{ id: string; title: string; summary: string; category: string; tags: string[] }>,
): Promise<string> {
  await ensureDir(wikiPath());

  const lines = ["# Source Documents\n", "| Document | Category | Tags | Summary |", "|----------|----------|------|---------|"];

  for (const s of sources) {
    const tags = s.tags.join(", ");
    lines.push(`| [[${s.id}]] | ${s.category} | ${tags} | ${s.summary || "*awaiting summary*"} |`);
  }

  const content = lines.join("\n") + "\n";
  const filePath = wikiPath("SOURCES.md");
  await writeMdFile(filePath, content);
  return filePath;
}

export async function writeWikiIndexPages(sectionCount: number): Promise<string> {
  const content = `# Claude Knowledge Wiki\n\nWelcome to the auto-generated wiki.\n\n## Sections\n\n- [[SOURCES|Source Documents]] — ${sectionCount} documents\n- [[concepts/index|Concepts]]\n`;
  const filePath = wikiPath("index.md");
  await writeMdFile(filePath, content);
  return filePath;
}
