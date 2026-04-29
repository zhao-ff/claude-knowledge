import { Command } from "commander";
import { compileWiki } from "../compile/index.js";
import { searchCli } from "../search/cli.js";
import { createSearchServer } from "../search/server.js";
import { askQuestion } from "../qa/index.js";
import { getConfig } from "../utils/config.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("claude-knowledge")
    .description("LLM-powered personal knowledge base system")
    .version("0.1.0");

  program
    .command("compile")
    .description("Compile raw source documents into the wiki")
    .action(async () => {
      await compileWiki();
    });

  program
    .command("query")
    .description("Ask a question against the wiki")
    .argument("<question>", "the question to answer")
    .action(async (question: string) => {
      console.log(`Researching: "${question}"\n`);
      const result = await askQuestion(question);
      console.log(result.answer);
      if (result.sources.length > 0) {
        console.log("\n## Sources");
        result.sources.forEach((s) => console.log(`- ${s}`));
      }
    });

  program
    .command("search")
    .description("Search the wiki")
    .argument("<query>", "search query")
    .option("-f, --format <type>", "output format (markdown|json)", "markdown")
    .option("-l, --limit <n>", "max results", "20")
    .action((query: string, opts: { format?: string; limit?: string }) => {
      searchCli(query, {
        format: opts.format as "markdown" | "json" | undefined,
        limit: Number(opts.limit),
      });
    });

  program
    .command("search-server")
    .description("Start the search web UI")
    .option("-p, --port <port>", "port number", String(getConfig().searchPort))
    .action((opts: { port?: string }) => {
      createSearchServer(Number(opts.port));
    });

  program
    .command("lint")
    .description("Run health checks on the wiki")
    .action(() => {
      console.log("lint: not yet implemented");
    });

  program
    .command("output")
    .description("Generate output (slides, charts, etc.)")
    .argument("<format>", "output format (slides, chart)")
    .argument("[topic]", "topic to visualize")
    .action((format: string, topic?: string) => {
      const topicStr = topic ? ` (topic: ${topic})` : "";
      console.log(`output: not yet implemented (format: ${format}${topicStr})`);
    });

  return program;
}
