'''
Author: zff
Date: 2026-05-01
Description: 遍历所有关注人 → 近N天帖子 → 每条帖子的评论
输出: 按关注人聚类的 JSON 结构

用法:
  python complete/xueqiu_followers_feed.py --days 3
  python complete/xueqiu_followers_feed.py --days 3 --output data.json --skip-users 0
'''
import sys, os
if 'PYTHONIOENCODING' not in os.environ:
    os.environ['PYTHONIOENCODING'] = 'utf-8'

from xueqiu_api import XueqiuAPI, clean_html, get_post_text, fmt_time
from datetime import datetime, timedelta
import json
import time
import argparse

DEFAULT_OUTPUT_DIR = "resources/py-md"


def filter_by_time(statuses, days):
    start_ts = int((datetime.now() - timedelta(days=days)).timestamp() * 1000)
    return [s for s in statuses if (s.get('created_at') or 0) >= start_ts]


def write_markdown(results, output_path):
    """输出为可读性更好的 Markdown 文件"""
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# 关注人动态汇总\n\n")
        f.write(f"生成时间: {now}  |  关注人数: {len(results)}\n\n")
        f.write("---\n\n")

        for user_data in results:
            user = user_data['user']
            posts = user_data['posts']
            f.write(f"## @{user['name']} (id={user['id']})\n\n")

            if user_data['total_posts'] == 0:
                f.write("近期内无新帖子\n\n")
                continue

            for pi, post in enumerate(posts, 1):
                f.write(f"### 第{pi}条\n\n")

                # 帖子正文
                if post['text']:
                    f.write(f"{post['text']}\n\n")

                # 互动数据
                interactions = []
                if post['like_count']:
                    interactions.append(f"👍 点赞 {post['like_count']}")
                if post['retweet_count']:
                    interactions.append(f"🔄 转发 {post['retweet_count']}")
                if post['comment_count_in_page']:
                    interactions.append(f"💬 评论 {post['comment_count_in_page']}")
                if interactions:
                    f.write(f"{' | '.join(interactions)}\n\n")

                # 转发信息
                if post.get('retweeted'):
                    ru = post['retweeted']
                    f.write(f"> 转发 @{ru['user_name']}: {ru['text']}\n\n")

                f.write(f"发布时间: {post['time']}  |  [原文链接]({post['url']})\n\n")

                # 评论列表
                if post['comments']:
                    f.write("**评论：**\n\n")
                    for c in post['comments']:
                        c_text = c['text'] or '(表情评论)'
                        f.write(f"- @{c['user_name']}: {c_text}\n")
                        if c['reply_count']:
                            f.write(f"  - 回复数: {c['reply_count']}\n")
                    f.write("\n")
                else:
                    f.write("暂无评论\n\n")

                f.write("---\n\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='遍历关注人获取帖子+评论')
    parser.add_argument('--days', type=int, default=3, help='近N天(默认3)')
    parser.add_argument('--output', type=str, default='', help='输出文件')
    parser.add_argument('--format', type=str, default='json', choices=['json', 'md'], help='输出格式: json 或 md (默认json)')
    parser.add_argument('--max-posts', type=int, default=20, help='每人最多取帖子数(默认20)')
    parser.add_argument('--max-comments', type=int, default=20, help='每条帖子最多取评论数(默认20)')
    parser.add_argument('--skip-users', type=int, default=0, help='跳过前N个用户(续跑用)')
    args = parser.parse_args()

    api = XueqiuAPI()

    # 1. 获取所有关注人
    print("获取关注列表...")
    follows = api.get_all_follows(uid=7767833248)
    print(f"共 {len(follows)} 个关注人")

    # 2. 遍历每个关注人
    results = []
    total_posts = 0
    total_comments = 0

    for idx, user in enumerate(follows):
        if idx < args.skip_users:
            continue

        uid = user.get('id')
        name = user.get('screen_name', '')
        print(f"\n[{idx+1}/{len(follows)}] @{name} (id={uid})")

        # 2a. 获取该用户近N天帖子 (用page翻页, 比max_id更稳定)
        user_posts = []
        cutoff = int((datetime.now() - timedelta(days=args.days)).timestamp() * 1000)

        for p in range(1, 6):
            data = None
            for rt in range(3):
                try:
                    data = api.get_user_statuses(uid, count=args.max_posts, page=p)
                    break
                except Exception as e:
                    if rt == 2:
                        print(f"  {'获取帖子失败' if p==1 else f'翻页第{p}页失败'}(可能已注销/隐私): {e}")
                    else:
                        wait = 2 ** (rt + 1)
                        print(f"  重试{rt+1}/3获取帖子(p={p}): 等待{wait}s")
                        time.sleep(wait)
            if data is None:
                break

            statuses = data.get('statuses', [])
            if not statuses:
                break

            # 收集本页在时间范围内的帖子（不break，因为有置顶帖）
            for s in statuses:
                if (s.get('created_at') or 0) >= cutoff:
                    user_posts.append(s)

            # 本页最后一条帖子比 cutoff 旧 → 后续页更旧, 结束
            if len(statuses) == 0 or statuses[-1].get('created_at', 0) < cutoff:
                break
            # 不足一页 → 结束
            if len(statuses) < args.max_posts:
                break
            time.sleep(0.3)

        if not user_posts:
            print(f"  近{args.days}天无帖子")
            # 仍写入结构, 但 posts 为空
            results.append({
                'user': {'id': uid, 'name': name},
                'total_posts': 0,
                'posts': [],
            })
            continue

        # 截断到 max_posts 条
        user_posts = user_posts[:args.max_posts]
        print(f"  近{args.days}天: {len(user_posts)} 条帖子")

        # 2b. 每条帖子取评论
        posts_out = []
        for pi, post in enumerate(user_posts):
            post_id = post.get('id')
            text = get_post_text(post)
            ts = fmt_time(post.get('created_at'))

            comments = []
            need_retry = True
            retry_count = 0
            while need_retry and retry_count < 3:
                try:
                    first = api.get_comments(post_id, count=args.max_comments)
                    total = first.get('comment_tl_count', 0) or first.get('status_reply_count', 0)
                    comments.extend(first.get('comments', []))

                    need_retry = False  # 首次成功, 无需重试

                    max_id_c = first.get('next_max_id')
                    while max_id_c and len(comments) < total and len(comments) < args.max_comments:
                        data = api.get_comments(post_id, count=20, max_id=max_id_c)
                        batch = data.get('comments', [])
                        if not batch:
                            break
                        comments.extend(batch)
                        max_id_c = data.get('next_max_id')
                        time.sleep(0.3)
                except Exception as e:
                    retry_count += 1
                    wait = 2 ** retry_count  # 2s, 4s, 8s 退避
                    print(f"    [x] 评论失败 post_id={post_id}(重试{retry_count}/3): {e}")
                    if retry_count < 3:
                        print(f"       等待 {wait}s 后重试...")
                        time.sleep(wait)
                        comments = []  # 清空可能残留的部分结果
            if need_retry and retry_count >= 3:
                print(f"    [x] 评论 post_id={post_id} 放弃重试")

            # 截断到 max_comments 条
            comments = comments[:args.max_comments]

            # 简略打印
            if pi < 3:
                print(f"    [{pi+1}] {text[:80]}")
                if comments:
                    for c in comments[:2]:
                        cu = c.get('user', {}) or {}
                        ct = clean_html(c.get('text', ''))
                        print(f"       > @{cu.get('screen_name','')}: {ct[:50]}")
                    if len(comments) > 2:
                        print(f"       ... 还有{len(comments)-2}条")

            total_posts += 1
            total_comments += len(comments)

            # 格式化评论
            comments_out = [{
                'user_name': (c.get('user', {}) or {}).get('screen_name', ''),
                'user_id': (c.get('user', {}) or {}).get('id', ''),
                'text': clean_html(c.get('text', '')),
                'time': fmt_time(c.get('created_at')),
                'reply_count': c.get('reply_count', 0),
            } for c in comments]

            post_out = {
                'post_id': post_id,
                'url': f"https://xueqiu.com/{uid}/{post_id}",
                'time': ts,
                'text': text,
                'retweet_count': post.get('retweet_count', 0),
                'like_count': post.get('fav_count', 0),
                'comment_count_in_page': first.get('comment_tl_count', 0) if comments else 0,
                'comments': comments_out,
            }

            # 转发信息
            rt = post.get('retweeted_status')
            if rt:
                ru = rt.get('user', {}) or {}
                post_out['retweeted'] = {
                    'user_name': ru.get('screen_name', ''),
                    'text': clean_html(rt.get('text', '')),
                }

            posts_out.append(post_out)
            time.sleep(0.5)

        results.append({
            'user': {'id': uid, 'name': name},
            'total_posts': len(user_posts),
            'posts': posts_out,
        })

        # 用户间间隔
        time.sleep(1.0)

    # 3. 保存
    output = args.output or os.path.join(DEFAULT_OUTPUT_DIR, f"followers_feed_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    if args.format == 'md':
        output_path = output + '.md'
        write_markdown(results, output_path)
    else:
        output_path = output + '.json'
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n{'='*60}")
    print(f"已保存: {output_path}")
    print(f"关注人: {len(results)}")
    print(f"帖子: {total_posts}")
    print(f"评论: {total_comments}")
