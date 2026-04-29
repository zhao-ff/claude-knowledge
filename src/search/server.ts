import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search } from "./index.js";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Knowledge — Search</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafafa; color: #333; padding: 2rem; }
.container { max-width: 720px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #1a1a2e; }
form { display: flex; gap: .5rem; margin-bottom: 2rem; }
input[type="text"] { flex: 1; padding: .6rem 1rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem; outline: none; }
input[type="text"]:focus { border-color: #6c63ff; }
button { padding: .6rem 1.5rem; background: #6c63ff; color: #fff; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
button:hover { background: #5b52e0; }
.result { background: #fff; padding: 1rem; margin-bottom: .8rem; border-radius: 8px; border: 1px solid #eee; }
.result h3 { margin-bottom: .3rem; }
.result h3 a { color: #6c63ff; text-decoration: none; }
.result h3 a:hover { text-decoration: underline; }
.result .meta { font-size: .8rem; color: #888; margin-bottom: .4rem; }
.result .snippet { font-size: .9rem; color: #555; }
.error { color: #d32f2f; margin-bottom: 1rem; }
.info { font-size: .9rem; color: #888; margin-bottom: 1rem; }
</style>
</head>
<body>
<div class="container">
<h1>Claude Knowledge</h1>
<form id="searchForm">
<input type="text" id="q" name="q" placeholder="Search the wiki..." autofocus>
<button type="submit">Search</button>
</form>
<div id="info" class="info"></div>
<div id="results"></div>
</div>
<script>
const params = new URLSearchParams(location.search);
if (params.has('q')) document.getElementById('q').value = params.get('q');
document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('q').value.trim();
  if (q) location.href = '?q=' + encodeURIComponent(q);
});
async function loadResults() {
  const q = params.get('q');
  if (!q) return;
  document.getElementById('info').textContent = 'Searching...';
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    const data = await res.json();
    const container = document.getElementById('results');
    const info = document.getElementById('info');
    if (data.error) { info.textContent = data.error; return; }
    info.textContent = data.results.length + ' result(s) for "' + q + '"';
    container.innerHTML = data.results.map(r => '<div class="result"><h3><a href="/view?path=' + encodeURIComponent(r.filePath) + '">' + r.title + '</a></h3><div class="meta">' + r.filePath + ' &middot; score: ' + r.score.toFixed(2) + '</div><div class="snippet">' + escapeHtml(r.snippet) + '</div></div>').join('');
  } catch (e) {
    document.getElementById('info').textContent = 'Search failed.';
  }
}
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
loadResults();
</script>
</body>
</html>`;

export function createSearchServer(port: number): void {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (url.pathname === "/api/search") {
      const q = url.searchParams.get("q") ?? "";
      if (!q) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing query parameter 'q'" }));
        return;
      }

      const results = search(q);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ query: q, results }));
      return;
    }

    if (url.pathname === "/view") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        res.writeHead(400);
        res.end("Missing path parameter");
        return;
      }
      try {
        const content = readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("File not found");
      }
      return;
    }

    // Serve the search UI
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });

  server.listen(port, () => {
    console.log(`Search server running at http://localhost:${port}`);
  });
}
