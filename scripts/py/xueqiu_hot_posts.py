'''
Author: zff
Date: 2026-05-02
Description: 雪球热门帖子爬虫 — 获取「热门」栏目下的帖子
API: GET /statuses/hot/listV3.json?source=hot&page=&size=
     (api.xueqiu.com 子域名, 无WAF, 无需 md5__1038 签名)
翻页: page 递增 + has_next_page 判断

用法:
  python complete/xueqiu_hot_posts.py                     # 获取所有热门帖子(~60条)
  python complete/xueqiu_hot_posts.py --pages 5           # 限制翻5页
  python complete/xueqiu_hot_posts.py --output hot.json   # 自定义输出
  python complete/xueqiu_hot_posts.py --format md         # Markdown格式
'''
import sys, os
if 'PYTHONIOENCODING' not in os.environ:
    os.environ['PYTHONIOENCODING'] = 'utf-8'

import requests
import json
import time
import re
import argparse
from datetime import datetime

DEFAULT_OUTPUT_DIR = "resources/py-md"

API_BASE = "https://api.xueqiu.com"

COOKIES = {
    "xq_a_token": "14579780e0e4835615ade4a630d1ae2e735cd8ae",
    "xq_r_token": "75917254c6b4ba6a2c70cdf9cec7e939ad565083",
    "xq_is_login": "1",
    "u": "7767833248",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://xueqiu.com/",
}


def clean_html(text):
    """去掉HTML标签, 保留 img title 中的可读文本"""
    if not text:
        return ''
    text = re.sub(r'<img[^>]*title="([^"]*)"[^>]*>', r'\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


def fmt_time(ts):
    """毫秒时间戳 → 字符串"""
    return datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%d %H:%M:%S') if ts else ''


def fetch_hot_posts(max_pages=20):
    """
    获取热门栏目帖子
    API: /statuses/hot/listV3.json?source=hot&page=&size=
    - size=20 时每页返回约 11 条
    - 通过 page 递增翻页, has_next_page 判断是否继续
    返回: list[dict] (原始帖子数据)
    """
    session = requests.Session()
    session.cookies.update(COOKIES)
    session.headers.update(HEADERS)

    all_posts = []
    seen_ids = set()

    for page in range(1, max_pages + 1):
        params = {'source': 'hot', 'page': page, 'size': 20}

        try:
            r = session.get(f"{API_BASE}/statuses/hot/listV3.json",
                            params=params, timeout=15)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"[x] 第{page}页请求失败: {e}")
            break

        items = data.get('list', [])
        if not items:
            print(f"  第{page}页: 无数据, 结束")
            break

        # 去重(热门榜同一帖子可能跨页出现)
        new_items = [it for it in items if it['id'] not in seen_ids]
        for it in items:
            seen_ids.add(it['id'])
        all_posts.extend(new_items)

        print(f"  第{page}页: {len(items)}条, 新增{len(new_items)}条 (累计{len(all_posts)}条)")

        if not data.get('has_next_page'):
            print(f"  has_next_page=False, 结束")
            break

        time.sleep(0.3)

    return all_posts


def format_post(post):
    """格式化单条帖子为统一结构"""
    user = post.get('user', {}) or {}
    # target 格式: /user_id/post_id
    target = post.get('target', '')
    if not target:
        target = f"/{post.get('user_id', '')}/{post.get('id', '')}"
    post_id = post.get('id', '')

    # 取正文: text 优先, 其次 description
    text = clean_html(post.get('text', '') or post.get('description', '') or '')

    return {
        'id': post_id,
        'url': f"https://xueqiu.com{target}",
        'title': clean_html(post.get('title', '')),
        'text': text,
        'created_at': post.get('created_at'),
        'time': fmt_time(post.get('created_at')),
        'user': {
            'id': user.get('id'),
            'name': user.get('screen_name', ''),
            'profile': user.get('profile', ''),
            'avatar': user.get('profile_image_url', ''),
            'verified': bool(user.get('verified')),
        },
        'stats': {
            'reply_count': post.get('reply_count', 0),
            'retweet_count': post.get('retweet_count', 0),
            'like_count': post.get('fav_count', 0) or post.get('like_count', 0),
            'view_count': post.get('view_count', 0),
        },
        'source': post.get('source', ''),
        'type': post.get('type', ''),
    }


def print_table(posts):
    """打印排行榜表格"""
    print(f"\n{'='*80}")
    print(f"  雪球热门帖子 TOP {len(posts)}")
    print(f"  抓取时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*80}")
    print(f"{'#':>3} {'热度分':>6} {'作者':<14} {'标题'}")

    scored = []
    for p in posts:
        s = p['stats']
        score = s['reply_count'] + s['like_count'] + s['retweet_count'] * 2
        scored.append((score, p))

    scored.sort(key=lambda x: -x[0])

    for i, (score, p) in enumerate(scored[:50], 1):
        title = (p['title'] or p['text'] or '(无标题)')[:50]
        name = p['user']['name'][:12]
        print(f"{i:>3} {score:>6} {name:<14} {title}")

    if len(posts) > 50:
        print(f"  ... 还有 {len(posts)-50} 条 (完整数据在 JSON 中)")


def write_markdown(posts, output_path):
    """输出可读性好的 Markdown"""
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# 雪球热门帖子\n\n")
        f.write(f"抓取时间: {now}  |  共 {len(posts)} 条\n\n")
        f.write("---\n\n")

        for i, p in enumerate(posts, 1):
            title = p['title'] or p['text'][:80] or '(无标题)'
            f.write(f"## {i}. {title}\n\n")

            if p['title'] and p['text']:
                f.write(f"{p['text'][:200]}\n\n")

            s = p['stats']
            f.write(f"- **作者**: @{p['user']['name']}\n")
            f.write(f"- **时间**: {p['time']}\n")
            f.write(f"- **互动**: 👍 {s['like_count']}  💬 {s['reply_count']}  🔄 {s['retweet_count']}\n")
            f.write(f"- **链接**: {p['url']}\n")
            f.write(f"- **来源**: {p['source']}\n")
            f.write("\n---\n\n")


def write_text(posts, output_path):
    """输出纯文本简表"""
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    scored = []
    for p in posts:
        s = p['stats']
        score = s['reply_count'] + s['like_count'] + s['retweet_count'] * 2
        scored.append((score, p))
    scored.sort(key=lambda x: -x[0])

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"雪球热门帖子 TOP {len(posts)}  (抓取时间: {now})\n")
        f.write("=" * 80 + "\n\n")
        for i, (score, p) in enumerate(scored, 1):
            title = (p['title'] or p['text'][:60] or '(无标题)')[:60]
            f.write(f"{i:>3}. [热度{score:>4}] @{p['user']['name']:<12} {title}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='雪球热门帖子爬虫')
    parser.add_argument('--pages', type=int, default=20, help='最大翻页数(默认20)')
    parser.add_argument('--output', type=str, default='', help='输出文件路径')
    parser.add_argument('--format', type=str, default='json',
                        choices=['json', 'md', 'txt'], help='输出格式')
    args = parser.parse_args()

    print(f"获取雪球热门帖子 (最多翻{args.pages}页) ...")
    raw_posts = fetch_hot_posts(max_pages=args.pages)
    print(f"\n✅ 共获取 {len(raw_posts)} 条热门帖子")

    if not raw_posts:
        print("[x] 未获取到数据")
        sys.exit(1)

    # 格式化
    posts = [format_post(p) for p in raw_posts]

    # 打印排行榜
    print_table(posts)

    # 保存
    output = args.output or os.path.join(DEFAULT_OUTPUT_DIR, f"hot_posts_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    if args.format == 'json':
        path = output + '.json'
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)
    elif args.format == 'md':
        path = output + '.md'
        write_markdown(posts, path)
    else:
        path = output + '.txt'
        write_text(posts, path)

    print(f"\n已保存: {path}")
