import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { QA_SYSTEM_PROMPT } from "./prompts.js";
import { wikiTools } from "./tools.js";
import type { QAResult } from "../types.js";

const MAX_TURNS = 25;

export async function askQuestion(question: string): Promise<QAResult> {
  // Track which wiki files the agent reads
  const readSources = new Set<string>();

  const mcpServer = createSdkMcpServer({
    name: "wiki-tools",
    tools: wikiTools,
  });

  const stream = query({
    prompt: `${QA_SYSTEM_PROMPT}\n\nQuestion: ${question}`,
    options: {
      model: "deepseek-v4-flash",
      mcpServers: { "wiki-tools": mcpServer },
      // Block all built-in Claude Code tools — agent only gets our MCP wiki tools
      tools: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: MAX_TURNS,
    },
  });

  // Collect the answer from the stream
  const textParts: string[] = [];

  for await (const msg of stream) {
    if (msg.type === "result" && msg.subtype === "success") {
      textParts.push(msg.result);
    }
  }

  const answer = textParts.join("\n").trim();

  // Extract referenced sources from the answer text
  const wikiRefs = answer.match(/\[\[([^\]]+)\]\]/g);
  if (wikiRefs) {
    wikiRefs.forEach((ref) => {
      const name = ref.slice(2, -2);
      readSources.add(name);
    });
  }

  return {
    question,
    answer: answer || "No answer was generated.",
    sources: [...readSources],
  };
}
