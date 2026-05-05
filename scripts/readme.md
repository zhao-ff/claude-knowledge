# Scripts

辅助脚本，用 `npx tsx` 运行。

| 脚本 | 用途 |
|------|------|
| [convert.ts](convert.ts) | 用 pandoc 将文档 (docx/html/pdf/tex/…) 批量转为 .md 放入 `raw/` |
| [pdf2md.ts](pdf2md.ts) | 用 MinerU API 将 PDF 转为 markdown（支持分块合并） |
| [batch-pdf2md.ts](batch-pdf2md.ts) | 批量扫描目录，对每个 PDF 调用 pdf2md.ts 转换 |
| [split-md.ts](split-md.ts) | 按标题层级递归拆分大的 markdown 文件 |
| [transcribe.ts](transcribe.ts) | 下载视频/音频 URL 并用 Whisper 转录为 txt |

---

## convert.ts

依赖: **pandoc** (`sudo apt install pandoc`)

```bash
npx tsx scripts/convert.ts report.docx
npx tsx scripts/convert.ts ./papers/ --overwrite
npx tsx scripts/convert.ts book.html --from html
```

- 自动识别格式（docx、epub、html、tex、odt、pdf、ipynb…）
- 已存在的跳过（除非 `--overwrite`）
- 支持 `RAW_DIR` 环境变量自定义输出目录

## pdf2md.ts

依赖: **mineru-open-api** CLI + **pdf-lib**

```bash
npx tsx scripts/pdf2md.ts input.pdf -o output.md
npx tsx scripts/pdf2md.ts input.pdf -o output.md --lang en --ocr
```

- 自动分块（20 页 / 10MB 限制），调用 MinerU flash-extract API 后合并
- 支持 OCR、公式识别、表格识别

## batch-pdf2md.ts

```bash
npx tsx scripts/batch-pdf2md.ts /path/to/pdfs/
npx tsx scripts/batch-pdf2md.ts /path/to/pdfs/ --force
```

- 递归扫描目录中的 PDF，逐一调用 pdf2md.ts
- 跳过已有文件（除非 `--force`）

## split-md.ts

```bash
npx tsx scripts/split-md.ts input.md
npx tsx scripts/split-md.ts input.md --max-words 2000 -o chunks/
```

- 检测标题层级，从 h1 开始逐层拆分，直到每块低于字数限制
- 无标题时原样输出单文件

## transcribe.ts

依赖: **yt-dlp** + **openai-whisper** (`pip install yt-dlp openai-whisper`)

```bash
npx tsx scripts/transcribe.ts https://youtu.be/xxxxx
npx tsx scripts/transcribe.ts https://youtu.be/xxxxx --model small --language en
npx tsx scripts/transcribe.ts https://youtu.be/xxxxx -o ./my-raw
```

- yt-dlp 下载音频（WAV），whisper 转录
- 输出 `.md` 文件：front matter 记录视频地址，正文为转录文字
- 输出默认放入 `raw/`，临时文件自动清理
- 支持 `RAW_DIR` 环境变量自定义输出目录
