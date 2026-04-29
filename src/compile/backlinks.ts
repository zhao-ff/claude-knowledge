import { readMdFile, writeMdFile, findMdFiles, wikiPath } from "../utils/fs.js";

/**
 * Scan all wiki markdown files and build a map of [[wiki-links]].
 * Then update each file with a "## Backlinks" section.
 */
export async function updateBacklinks(): Promise<{ updated: number }> {
  const files = await findMdFiles(wikiPath());
  const linkMap = new Map<string, Set<string>>();

  for (const filePath of files) {
    const content = await readMdFile(filePath);
    const links = extractWikiLinks(content);
    for (const target of links) {
      if (!linkMap.has(target)) linkMap.set(target, new Set());
      linkMap.get(target)!.add(filePath);
    }
  }

  let updated = 0;
  for (const filePath of files) {
    const content = await readMdFile(filePath);
    const backlinkTargets = getBacklinkTarget(filePath);
    const incomingLinks = linkMap.get(backlinkTargets);
    if (!incomingLinks || incomingLinks.size === 0) continue;

    const backlinkSection = buildBacklinkSection([...incomingLinks]);
    const newContent = replaceBacklinkSection(content, backlinkSection);
    if (newContent !== content) {
      await writeMdFile(filePath, newContent);
      updated++;
    }
  }

  return { updated };
}

function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    // Handle [[link|display]] — extract the target before the pipe
    const target = match[1].split("|")[0].split("#")[0].trim().toLowerCase();
    if (target) links.push(target);
  }
  return links;
}

function getBacklinkTarget(filePath: string): string {
  // Remove wiki/ prefix and .md extension for matching
  const relative = filePath.replace(/^.*wiki[/\\]/, "").replace(/\.md$/, "").toLowerCase();
  return relative;
}

function buildBacklinkSection(incoming: string[]): string {
  const links = incoming
    .map((f) => {
      const display = f.replace(/^.*wiki[/\\]/, "").replace(/\.md$/, "");
      return `- [${display}](/${display.replace(/\\/g, "/")})`;
    })
    .sort();
  return `\n## Backlinks\n\n${links.join("\n")}\n`;
}

function replaceBacklinkSection(content: string, newSection: string): string {
  // Remove existing backlinks section if present
  const withoutExisting = content.replace(/\n## Backlinks[\s\S]*$/, "");
  return withoutExisting + newSection;
}
