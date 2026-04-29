---
title: "Quickstart"
source: "https://code.claude.com/docs/en/agent-sdk/quickstart"
author:
published:
created: 2026-04-28
description: "Get started with the Python or TypeScript Agent SDK to build AI agents that work autonomously"
tags:
  - "clippings"
---
Use the Agent SDK to build an AI agent that reads your code, finds bugs, and fixes them, all without manual intervention.

**What you’ll do:**

1. Set up a project with the Agent SDK
2. Create a file with some buggy code
3. Run an agent that finds and fixes the bugs automatically

## Prerequisites

- **Node.js 18+** or **Python 3.10+**
- An **Anthropic account** ([sign up here](https://platform.claude.com/))

## Setup

## Create a buggy file

This quickstart walks you through building an agent that can find and fix bugs in code. First, you need a file with some intentional bugs for the agent to fix. Create `utils.py` in the `my-agent` directory and paste the following code:

```python
def calculate_average(numbers):
    total = 0
    for num in numbers:
        total += num
    return total / len(numbers)

def get_user_name(user):
    return user["name"].upper()
```

This code has two bugs:

1. `calculate_average([])` crashes with division by zero
2. `get_user_name(None)` crashes with a TypeError

## Build an agent that finds and fixes bugs

Create `agent.py` if you’re using the Python SDK, or `agent.ts` for TypeScript:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Agentic loop: streams messages as Claude works
for await (const message of query({
  prompt: "Review utils.py for bugs that would cause crashes. Fix any issues you find.",
  options: {
    allowedTools: ["Read", "Edit", "Glob"], // Tools Claude can use
    permissionMode: "acceptEdits" // Auto-approve file edits
  }
})) {
  // Print human-readable output
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) {
        console.log(block.text); // Claude's reasoning
      } else if ("name" in block) {
        console.log(\`Tool: ${block.name}\`); // Tool being called
      }
    }
  } else if (message.type === "result") {
    console.log(\`Done: ${message.subtype}\`); // Final result
  }
}
```

This code has three main parts:

1. **`query`**: the main entry point that creates the agentic loop. It returns an async iterator, so you use `async for` to stream messages as Claude works. See the full API in the [Python](https://code.claude.com/docs/en/agent-sdk/python#query) or [TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript#query) SDK reference.
2. **`prompt`**: what you want Claude to do. Claude figures out which tools to use based on the task.
3. **`options`**: configuration for the agent. This example uses `allowedTools` to pre-approve `Read`, `Edit`, and `Glob`, and `permissionMode: "acceptEdits"` to auto-approve file changes. Other options include `systemPrompt`, `mcpServers`, and more. See all options for [Python](https://code.claude.com/docs/en/agent-sdk/python#claude-agent-options) or [TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript#options).

The `async for` loop keeps running as Claude thinks, calls tools, observes results, and decides what to do next. Each iteration yields a message: Claude’s reasoning, a tool call, a tool result, or the final outcome. The SDK handles the orchestration (tool execution, context management, retries) so you just consume the stream. The loop ends when Claude finishes the task or hits an error.

The message handling inside the loop filters for human-readable output. Without filtering, you’d see raw message objects including system initialization and internal state, which is useful for debugging but noisy otherwise.

This example uses streaming to show progress in real-time. If you don’t need live output (e.g., for background jobs or CI pipelines), you can collect all messages at once. See [Streaming vs. single-turn mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) for details.

### Run your agent

Your agent is ready. Run it with the following command:

- Python
- TypeScript

```shellscript
python3 agent.py
```

After running, check `utils.py`. You’ll see defensive code handling empty lists and null users. Your agent autonomously:

1. **Read** `utils.py` to understand the code
2. **Analyzed** the logic and identified edge cases that would crash
3. **Edited** the file to add proper error handling

This is what makes the Agent SDK different: Claude executes tools directly instead of asking you to implement them.

If you see “API key not found”, make sure you’ve set the `ANTHROPIC_API_KEY` environment variable in your `.env` file or shell environment. See the [full troubleshooting guide](https://code.claude.com/docs/en/troubleshooting) for more help.

### Try other prompts

Now that your agent is set up, try some different prompts:

- `"Add docstrings to all functions in utils.py"`
- `"Add type hints to all functions in utils.py"`
- `"Create a README.md documenting the functions in utils.py"`

### Customize your agent

You can modify your agent’s behavior by changing the options. Here are a few examples:

**Add web search capability:**

```typescript
const _ = {
  options: {
    allowedTools: ["Read", "Edit", "Glob", "WebSearch"],
    permissionMode: "acceptEdits"
  }
};
```

**Give Claude a custom system prompt:**

```typescript
const _ = {
  options: {
    allowedTools: ["Read", "Edit", "Glob"],
    permissionMode: "acceptEdits",
    systemPrompt: "You are a senior Python developer. Always follow PEP 8 style guidelines."
  }
};
```

**Run commands in the terminal:**

```typescript
const _ = {
  options: {
    allowedTools: ["Read", "Edit", "Glob", "Bash"],
    permissionMode: "acceptEdits"
  }
};
```

With `Bash` enabled, try: `"Write unit tests for utils.py, run them, and fix any failures"`

## Key concepts

**Tools** control what your agent can do:

| Tools | What the agent can do |
| --- | --- |
| `Read`, `Glob`, `Grep` | Read-only analysis |
| `Read`, `Edit`, `Glob` | Analyze and modify code |
| `Read`, `Edit`, `Bash`, `Glob`, `Grep` | Full automation |

**Permission modes** control how much human oversight you want:

| Mode | Behavior | Use case |
| --- | --- | --- |
| `acceptEdits` | Auto-approves file edits and common filesystem commands, asks for other actions | Trusted development workflows |
| `dontAsk` | Denies anything not in `allowedTools` | Locked-down headless agents |
| `auto` (TypeScript only) | A model classifier approves or denies each tool call | Autonomous agents with safety guardrails |
| `bypassPermissions` | Runs every tool without prompts | Sandboxed CI, fully trusted environments |
| `default` | Requires a `canUseTool` callback to handle approval | Custom approval flows |

The example above uses `acceptEdits` mode, which auto-approves file operations so the agent can run without interactive prompts. If you want to prompt users for approval, use `default` mode and provide a [`canUseTool` callback](https://code.claude.com/docs/en/agent-sdk/user-input) that collects user input. For more control, see [Permissions](https://code.claude.com/docs/en/agent-sdk/permissions).

## Troubleshooting

### API error thinking.type.enabled is not supported for this model

Claude Opus 4.7 replaces `thinking.type.enabled` with `thinking.type.adaptive`. Older Agent SDK versions fail with the following API error when you select `claude-opus-4-7`:

```text
API Error: 400 {"type":"invalid_request_error","message":"\"thinking.type.enabled\" is not supported for this model. Use \"thinking.type.adaptive\" and \"output_config.effort\" to control thinking behavior."}
```

Upgrade to Agent SDK v0.2.111 or later to use Opus 4.7.

## Next steps

Now that you’ve created your first agent, learn how to extend its capabilities and tailor it to your use case:

- **[Permissions](https://code.claude.com/docs/en/agent-sdk/permissions)**: control what your agent can do and when it needs approval
- **[Hooks](https://code.claude.com/docs/en/agent-sdk/hooks)**: run custom code before or after tool calls
- **[Sessions](https://code.claude.com/docs/en/agent-sdk/sessions)**: build multi-turn agents that maintain context
- **[MCP servers](https://code.claude.com/docs/en/agent-sdk/mcp)**: connect to databases, browsers, APIs, and other external systems
- **[Hosting](https://code.claude.com/docs/en/agent-sdk/hosting)**: deploy agents to Docker, cloud, and CI/CD
- **[Example agents](https://github.com/anthropics/claude-agent-sdk-demos)**: see complete examples: email assistant, research agent, and more