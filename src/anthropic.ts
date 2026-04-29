import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "./utils/config.js";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    const config = getConfig();
    client = new Anthropic({
      apiKey: config.anthropicApiKey,
      baseURL: config.baseURL
    });
  }
  return client;
}

export interface MessageOptions {
  system?: string;
  maxTokens?: number;
  thinking?: Anthropic.Messages.ThinkingConfigParam;
  tools?: Anthropic.Messages.Tool[];
  toolChoice?: Anthropic.Messages.ToolChoice;
}

export async function sendMessage(
  messages: Anthropic.Messages.MessageParam[],
  opts: MessageOptions = {},
) {
  const c = getClient();
  return c.messages.create({
    model: "deepseek-v4-flash",
    max_tokens: opts.maxTokens ?? 8192,
    system: opts.system,
    thinking: opts.thinking,
    tools: opts.tools,
    tool_choice: opts.toolChoice,
    messages,
  });
}
