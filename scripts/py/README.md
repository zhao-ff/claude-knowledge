# 雪球数据采集工具集

基于 `api.xueqiu.com` 子域名绕过阿里云 WAF，纯 `requests` 调用，无需浏览器、无需 Playwright。

## 快速开始

```bash
cd complete
pip install requests
```

所有脚本在 `complete/` 目录下，直接运行即可。

## 脚本列表

| 脚本 | 功能 | 核心API |
|------|------|---------|
| `xueqiu_api.py` | API 核心封装，提供统一调用接口 | — |
| `xueqiu_hot_posts.py` | 热门栏目帖子采集 | `/statuses/hot/listV3.json` |
| `xueqiu_followers_feed.py` | 关注人帖子+评论聚合 | `/statuses/user_timeline.json` + `/statuses/v3/comments.json` |

---

### 1. xueqiu_hot_posts.py — 热门帖子

获取雪球「热门」栏目下的帖子列表，按热度排序（回复+点赞+转发综合计算）。

```bash
# 获取全部热门帖子（约 60 条）
python xueqiu_hot_posts.py

# 输出为 Markdown 文件
python xueqiu_hot_posts.py --format md

# 限制翻页数
python xueqiu_hot_posts.py --pages 5 --format md -o hot.md
```

**输出格式** (JSON):

```json
[{
  "id": 387031658,
  "url": "https://xueqiu.com/4086512744/387031658",
  "title": "",
  "text": "帖子正文内容...",
  "time": "2026-05-02 09:29:19",
  "user": {"id": 4086512744, "name": "老奈"},
  "stats": {"reply_count": 193, "retweet_count": 3, "like_count": 37},
  "source": "iPhone"
}]
```

**输出格式** (Markdown):

每条帖子包含作者、时间、互动数据、原文链接，适合直接阅读或分享。

---

### 2. xueqiu_followers_feed.py — 关注人内容聚合

遍历所有关注人，获取近 N 天帖子 + 每条帖子的评论，按关注人聚类输出。

```bash
# 近3天数据
python xueqiu_followers_feed.py --days 3

# 自定义输出
python xueqiu_followers_feed.py --days 3 --output data.json

# 限制每人帖子数和评论数
python xueqiu_followers_feed.py --days 3 --max-posts 20 --max-comments 20

# 续跑（跳过已处理的用户）
python xueqiu_followers_feed.py --days 3 --skip-users 10

# Markdown 格式输出
python xueqiu_followers_feed.py --days 3 --format md
```

**输出结构**（JSON，按关注人聚类）：

```json
[{
  "user": {"id": 1786904335, "name": "晚点LatePost"},
  "total_posts": 4,
  "posts": [{
    "post_id": 386966878,
    "time": "2026-05-01 12:30:10",
    "text": "帖子正文",
    "like_count": 15,
    "retweet_count": 3,
    "comments": [
      {"user_name": "用户名", "text": "评论内容", "time": "2026-05-01 13:00:00"}
    ],
    "retweeted": {"user_name": "原帖作者", "text": "原帖内容"}
  }]
}]
```

---

### 3. xueqiu_api.py — 核心 API 封装

基础库，提供 `XueqiuAPI` 类封装所有雪球内容 API。其他脚本依赖此模块。

```python
from xueqiu_api import XueqiuAPI

api = XueqiuAPI()

# 用户帖子
data = api.get_user_statuses(user_id=1247347556, page=1)
all = api.get_all_user_statuses(user_id=1247347556, max_pages=20)

# 帖子评论
data = api.get_comments(status_id=386927404, count=20)
all = api.get_all_comments(status_id=386927404, max_pages=10)

# 关注列表
follows = api.get_follow_list(uid=7767833248, page=1)
all_follows = api.get_all_follows(uid=7767833248)

# 首页 Feed
feed = api.get_home_feed(count=20)
```

## 技术架构

```
┌──────────────────────────────────────────────────┐
│                   api.xueqiu.com                  │
│          (子域名，无 WAF，无需 md5__1038 签名)      │
├──────────────────────────────────────────────────┤
│                                                   │
│   xueqiu_api.py  (核心封装，requests Session)      │
│        ↑                      ↑                    │
│   xueqiu_hot_posts.py   xueqiu_followers_feed.py  │
│   (热门栏目)              (关注人聚合)              │
│                                                   │
└──────────────────────────────────────────────────┘
```

- **WAF 绕过**: 主站 `xueqiu.com` 有阿里云 WAF（JS签名 `md5__1038`），`api.xueqiu.com` 子域名无 WAF，可直接 `requests` 调用
- **自动重试**: 网络错误时自动重建 Session + 指数退避重试
- **编码兼容**: 自动处理 UTF-8 输出，兼容 Windows GBK 终端

## Cookie 更新

`xq_a_token` / `xq_r_token` 会过期，需定期更新：

1. 浏览器打开 `https://xueqiu.com` 并登录
2. F12 → Application → Cookies → 复制 `xq_a_token`、`xq_r_token`、`u`
3. 更新到 `xueqiu_api.py` 中的 `DEFAULT_COOKIES`

## 目录结构

```
Intelligence-analysis/
├── complete/              # 生产脚本（纯 requests，无 Playwright）
│   ├── xueqiu_api.py      #   API 核心封装
│   ├── xueqiu_hot_posts.py   # 热门帖子采集
│   └── xueqiu_followers_feed.py  # 关注人内容聚合
├── playw/                 # Playwright 接口分析脚本（接口探索用）
├── CLAUDE.md              # 项目开发文档
└── README.md              # 本文件
```
