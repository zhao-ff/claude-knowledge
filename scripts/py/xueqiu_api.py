'''
Author: zff 2059577798@qq.com
Date: 2026-05-01
Description: 雪球API核心封装 - 纯requests调用, 无Playwright依赖
Base URL: https://api.xueqiu.com (绕过WAF)
'''
import requests
import json
import time
from datetime import datetime
import re

API_BASE = "https://api.xueqiu.com"

DEFAULT_COOKIES = {
    "xq_a_token": "14579780e0e4835615ade4a630d1ae2e735cd8ae",
    "xqat": "14579780e0e4835615ade4a630d1ae2e735cd8ae",
    "xq_r_token": "75917254c6b4ba6a2c70cdf9cec7e939ad565083",
    "xq_is_login": "1",
    "u": "7767833248",
}

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://xueqiu.com/",
}


class XueqiuAPI:
    """雪球API客户端 - 纯requests"""

    def __init__(self, cookies=None, headers=None):
        self._default_cookies = dict(cookies or DEFAULT_COOKIES)
        self._default_headers = dict(headers or DEFAULT_HEADERS)
        self.session = self._new_session()

    def _new_session(self):
        s = requests.Session()
        s.cookies.update(self._default_cookies)
        s.headers.update(self._default_headers)
        return s

    def get(self, path, params=None, retry=0):
        """GET请求, 失败时自动重建session重试一次"""
        url = f"{API_BASE}{path}"
        try:
            r = self.session.get(url, params=params, timeout=15)
            r.raise_for_status()
            return r.json()
        except ValueError as e:  # 含 json.JSONDecodeError
            if retry < 1:
                self.session = self._new_session()
                return self.get(path, params, retry=1)
            raise
        except requests.RequestException as e:
            if retry < 1:
                self.session = self._new_session()
                return self.get(path, params, retry=1)
            raise

    # ---- 关注列表 ----

    def get_follow_list(self, uid, page=1, gid=0):
        """获取关注列表（分页）"""
        params = {'uid': uid, 'page': page, 'gid': gid}
        return self.get('/friendships/groups/members.json', params)

    def get_all_follows(self, uid, max_pages=10):
        """获取所有关注人（自动翻页）"""
        all_users = []
        for p in range(1, max_pages + 1):
            data = self.get_follow_list(uid, page=p, gid=0)
            users = data.get('users', [])
            if not users:
                break
            all_users.extend(users)
            if p >= data.get('maxPage', p):
                break
            time.sleep(0.3)
        return all_users

    # ---- 首页时间线 ----

    def get_home_feed(self, count=20, next_id=None):
        """获取首页关注用户时间线"""
        params = {'source': 'user', 'count': count}
        if next_id:
            params['next_id'] = next_id
        return self.get('/v4/statuses/home_timeline.json', params)

    # ---- 用户动态 ----

    def get_user_statuses(self, user_id, count=20, max_id=None, page=None):
        """获取用户帖子列表 (page 比 max_id 更稳定)"""
        params = {'user_id': user_id, 'count': count}
        if page is not None:
            params['page'] = page
        elif max_id is not None:
            params['max_id'] = max_id
        return self.get('/statuses/user_timeline.json', params)

    def get_all_user_statuses(self, user_id, max_pages=20, callback=None):
        """获取用户全部帖子(自动翻页, page方式更稳定)"""
        all_statuses = []
        for p in range(1, max_pages + 1):
            try:
                data = self.get_user_statuses(user_id, count=20, page=p)
            except Exception:
                # max_id 方式降级
                break
            statuses = data.get('statuses', [])
            if not statuses:
                break
            all_statuses.extend(statuses)
            if callback:
                callback(statuses, p)
            time.sleep(0.3)
        return all_statuses

    # ---- 帖子评论 ----

    def get_comments(self, status_id, count=20, max_id=-1):
        """获取帖子评论"""
        params = {'id': status_id, 'type': '4', 'size': count, 'max_id': max_id}
        return self.get('/statuses/v3/comments.json', params)

    def get_all_comments(self, status_id, max_pages=10):
        """获取帖子全部评论(自动翻页)"""
        all_comments = []
        max_id = -1
        for p in range(max_pages):
            data = self.get_comments(status_id, count=20, max_id=max_id)
            comments = data.get('comments', [])
            if not comments:
                break
            all_comments.extend(comments)
            next_max = data.get('next_max_id')
            if not next_max or next_max == max_id:
                break
            max_id = next_max
            time.sleep(0.3)
        return all_comments


def clean_html(text):
    """去掉HTML标签, 但将emoji图标的title转为可读文本"""
    if not text:
        return ''
    # 提取 img 标签的 title 属性（如 [献花花]），保留可读文本
    text = re.sub(r'<img[^>]*title="([^"]*)"[^>]*>', r'\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


def get_post_text(post):
    """提取帖子正文: text -> title -> description，文章类帖子title/description有内容"""
    text = post.get('text', '') or ''
    if text.strip():
        return clean_html(text)
    title = post.get('title', '') or ''
    if title.strip():
        return clean_html(title)
    desc = post.get('description', '') or ''
    if desc.strip():
        return clean_html(desc)
    return ''


def fmt_time(ts):
    """时间戳(毫秒) → 字符串"""
    return datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%d %H:%M:%S') if ts else ''


def fmt_user_status(s):
    """格式化用户帖子"""
    user = s.get('user', {}) or {}
    return {
        'id': s.get('id'),
        'time': fmt_time(s.get('created_at')),
        'timestamp': s.get('created_at'),
        'user_name': user.get('screen_name', ''),
        'user_id': user.get('id', ''),
        'text': clean_html(s.get('text', '')),
        'retweet_count': s.get('retweet_count', 0),
        'comment_count': s.get('comment_count', 0),
        'like_count': s.get('fav_count', 0),
        'retweeted': _fmt_retweeted(s.get('retweeted_status')),
    }


def _fmt_retweeted(rt):
    if not rt:
        return None
    ru = rt.get('user', {}) or {}
    return {
        'user_name': ru.get('screen_name', ''),
        'text': clean_html(rt.get('text', '')),
        'id': rt.get('id'),
    }
