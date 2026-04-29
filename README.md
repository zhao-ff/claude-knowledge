# Claude Knowledge

LLM 驱动的个人知识库（Wiki）系统。摄取原始文档，由 LLM 编译为结构化 Wiki，提供搜索、问答和可视化工具。

> **核心理念**：数据在 `raw/` 中收集，由 LLM 编译为 `wiki/`（纯 Markdown），通过 CLI 和 Web 进行检索和分析。Wiki 主要由 LLM 维护，人类通过 Obsidian 阅读。

---

## 目录

- [快速开始](#快速开始)
- [工作流](#工作流)
- [CLI 命令参考](#cli-命令参考)
- [目录结构](#目录结构)
- [配置](#配置)
- [Wiki 结构](#wiki-结构)
- [使用场景](#使用场景)

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run build

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API 密钥:
#   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# 4. 放入原始文档（Obsidian Web Clipper 导出的 .md 文件）
cp ~/my-articles/*.md raw/

# 5. 编译 Wiki
node dist/index.js compile

# 6. 搜索
node dist/index.js search "transformer"

# 7. 启动 Web 搜索界面
node dist/index.js search-server
# 访问 http://localhost:3456

# 8. 提问
node dist/index.js query "What is the transformer architecture?"
```

---

## 工作流

```
raw/ (原始文档 .md)
  │
  ├── claude-knowledge compile    ← LLM 摘要 + 提取概念
  │
  ▼
wiki/ (结构化知识库)
  ├── index.md                    ← 首页
  ├── SOURCES.md                  ← 文档索引（含摘要）
  └── concepts/                   ← 概念页面（自动生成）
        ├── transformer.md
        └── attention.md
  │
  ├── claude-knowledge search     ← 全文搜索（CLI / Web）
  ├── claude-knowledge query      ← LLM 问答（自动查阅 Wiki）
  └── claude-knowledge lint       ← 健康检查
```

**典型工作流：**

1. **收集** — 使用 Obsidian Web Clipper 保存网页文章到 `raw/`
2. **编译** — `claude-knowledge compile` → LLM 生成摘要、提取概念、建立反向链接
3. **探索** — 在 Obsidian 中浏览 `wiki/`，或使用 `search`/`search-server`
4. **提问** — `claude-knowledge query` → LLM 在 Wiki 中调研后给出答案
5. **积累** — Q&A 结果和可视化文件可存回 Wiki，知识持续累积

---

## CLI 命令参考

### `compile`

编译原始文档到 Wiki。扫描 `raw/` 中的所有 `.md` 文件，调用 LLM 生成摘要、提取概念、生成概念页面，并建立反向链接。

```bash
node dist/index.js compile
```

**工作模式：**
- **有 API 密钥**：LLM 生成摘要和概念页面
- **无 API 密钥**：使用 frontmatter 中的摘要，跳过概念生成

### `query <question>`

向 Wiki 提问。LLM Agent 会自动使用工具查阅相关页面后给出答案。

```bash
node dist/index.js query "What are the key components of transformers?"
node dist/index.js query "Compare RNNs and transformers"
```

Agent 可用工具：
- `read_file` — 读取 Wiki 文件
- `search_wiki` — 关键词搜索
- `list_concepts` — 列出所有概念
- `list_sources` — 列出所有源文档

### `search <query>`

全文搜索 Wiki。基于 TF-IDF 的倒排索引。

```bash
node dist/index.js search "attention mechanism"              # Markdown 格式
node dist/index.js search "transformer" --format json         # JSON 格式（LLM agent 用）
node dist/index.js search "positional encoding" --limit 5     # 限制结果数
```

### `search-server`

启动 Web 搜索界面。内建 HTTP 服务器，零额外依赖。

```bash
node dist/index.js search-server -p 3456
# → http://localhost:3456
```

API 端点：
- `GET /api/search?q=query` — 返回 JSON 结果
- `GET /view?path=wiki/concepts/transformer.md` — 查看文件内容
- `GET /` — Web 搜索 UI

### `lint`

Wiki 健康检查（待实现）。

```bash
node dist/index.js lint
```

### `output <format> [topic]`

生成输出（待实现）。

```bash
node dist/index.js output slides "topic"
node dist/index.js output chart "topic"
```

---

## 目录结构

```
├── raw/                    ← 原始文档（放入你的 .md 文件）
│   └── example-article.md
├── wiki/                   ← 编译后的 Wiki（自动生成）
│   ├── index.md
│   ├── SOURCES.md
│   └── concepts/
├── src/
│   ├── index.ts            ← 入口
│   ├── types.ts            ← 共享类型
│   ├── anthropic.ts        ← Anthropic SDK 客户端
│   ├── cli/index.ts        ← CLI 命令定义
│   ├── ingest/             ← 文档摄取
│   │   ├── index.ts        ← 扫描 raw/，解析 frontmatter
│   │   └── types.ts
│   ├── compile/            ← Wiki 编译
│   │   ├── index.ts        ← 编译管线编排
│   │   ├── prompts.ts      ← LLM 提示词
│   │   ├── article.ts      ← 页面生成
│   │   └── backlinks.ts    ← 反向链接
│   ├── search/             ← 搜索引擎
│   │   ├── index.ts        ← 倒排索引 + TF-IDF
│   │   ├── server.ts       ← Web UI 服务器
│   │   └── cli.ts          ← CLI 搜索
│   ├── qa/                 ← 问答
│   │   ├── index.ts        ← Agent 编排
│   │   ├── prompts.ts      ← System prompt + 工具定义
│   │   └── tools.ts        ← 工具实现
│   ├── output/             ← 输出格式化（待实现）
│   └── lint/               ← 健康检查（待实现）
├── CLAUDE.md
└── README.md
```

---

## 配置

复制 `.env.example` 为 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

支持的变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥（必需） | — |
| `ANTHROPIC_BASE_URL` | 自定义 API 地址（兼容 Anthropic 的第三方服务） | — |
| `ANTHROPIC_MODEL` | 模型名称 | — |
| `WIKI_DIR` | Wiki 输出目录 | `./wiki` |
| `RAW_DIR` | 原始文档目录 | `./raw` |
| `SEARCH_PORT` | 搜索 Web UI 端口 | `3456` |

---

## Wiki 结构

编译后的 Wiki 遵循以下结构：

```
wiki/
├── index.md                 ← 首页，列出所有板块和文档数量
├── SOURCES.md               ← 文档索引表：ID、分类、标签、LLM 生成的摘要
└── concepts/
    ├── transformer.md       ← 概念页面：详细解释 + [[反向链接]]
    ├── attention.md
    └── ...
```

**关键约定：**
- `[[page-name]]` — Wiki 内部链接，由 `backlinks.ts` 自动解析和维护
- 每个概念页面末尾自动包含 `## Backlinks` 和 `## Sources` 章节
- 所有文件均为纯 Markdown，可在 Obsidian 中直接打开

---

## 使用场景

### 研究人员
保存论文和文章到 `raw/`，编译后获得结构化知识库。通过 `query` 快速查询跨文档的复杂问题。

### 开发者
保存技术博客和文档，编译后获得概念索引。使用 search-server 在网页上快速查找信息。

### 知识管理
Q&A 的结果可以手动存回 Wiki，形成一个自增强的知识系统。每次查询都在积累知识。
