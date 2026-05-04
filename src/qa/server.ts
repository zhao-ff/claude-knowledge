import { createServer } from "node:http";
import { askQuestion } from "./index.js";

export function createQueryServer(port: number): void {
  const server = createServer(async (req, res) => {
    // CORS headers for browser access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // GET /api/query?q=what+is+transformer
    if (url.pathname === "/api/query" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      if (!q) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing query parameter 'q'" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      try {
        const result = await askQuestion(q);
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // POST /api/query
    //   Text Generator format:  { "messages": [{ "role": "user", "content": "..." }] }
    //   Direct format:          { "question": "..." }
    if (url.pathname === "/api/query" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        let question: string;
        try {
          const parsed = JSON.parse(body);
          if (parsed.messages?.length) {
            const msgs = parsed.messages;
            let lastUser = "";
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].role === "user") { lastUser = msgs[i].content; break; }
            }
            question = lastUser;
          } else {
            question = parsed.question ?? "";
          }
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                'Invalid JSON body. Supported formats:\n' +
                '  { "messages": [{ "role": "user", "content": "..." }] }\n' +
                '  { "question": "..." }',
            })
          );
          return;
        }

        if (!question) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "No question found in request body. " +
                'Provide either "messages" array or "question" field.',
            })
          );
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        try {
          const result = await askQuestion(question);
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    console.log(`Query API server running at http://localhost:${port}`);
    console.log(`  GET  /api/query?q=<question>`);
    console.log(`  POST /api/query  { "question": "..." }`);
  });
}
