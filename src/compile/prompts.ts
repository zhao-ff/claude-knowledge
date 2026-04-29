export const SYSTEM_SUMMARIZE = `You are a research assistant that extracts structured knowledge from documents.

Given a source document, produce:
1. A concise 2-3 sentence summary
2. Key concepts (3-10) extracted from the document
3. Related topics or fields the document touches on

Output valid JSON with this shape:
{
  "summary": "string",
  "concepts": [{"name": "string", "relevance": "high|medium|low", "aliases": ["string"]}],
  "relatedTopics": ["string"]
}`;

export function buildSummarizeUserPrompt(doc: { title: string; content: string; sourceUrl?: string }): string {
  return `Title: ${doc.title}${doc.sourceUrl ? `\nSource: ${doc.sourceUrl}` : ""}\n\n---\n\n${doc.content.slice(0, 8000)}`;
}

export const SYSTEM_COMPILE_ARTICLE = `You are a technical writer creating wiki articles.

Given a concept name and source documents, write a comprehensive markdown article that:
- Has a clear title and concise description
- Explains the concept thoroughly
- References source documents with links like [[source-id]]
- Links to related concepts with [[concept-name]]
- Includes a "## Sources" section listing all referenced source documents
- Uses markdown formatting (headings, lists, code blocks as needed)

Return the article as a JSON object:
{
  "title": "string",
  "markdown": "string (the full article content)",
  "relatedConcepts": ["string"]
}`;

export const SYSTEM_BACKLINKS = `You are a wiki curator finding connections between documents.

Given a list of wiki pages, identify meaningful cross-references between them.
Output valid JSON:
{
  "links": [
    {"from": "page-path", "to": "page-path", "reason": "why they are related"}
  ]
}

Only include genuine thematic connections, not superficial ones.`;

export function buildConceptsUserPrompt(concepts: Array<{ name: string; sourceIds: string[] }>): string {
  return `Extracted concepts:\n${concepts.map((c) => `- ${c.name} (from: ${c.sourceIds.join(", ")})`).join("\n")}\n\nGroup related concepts and identify the most important ones for the wiki.`;
}
