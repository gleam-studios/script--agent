#!/usr/bin/env python3

import argparse
import html as html_lib
import json
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

from docx_renderer import convert_html_file_to_docx


USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return slug or "story"


def extract_json_blob(page: str, marker: str) -> Dict:
    anchor = page.find(marker)
    if anchor == -1:
        raise RuntimeError(f"Could not find JSON marker: {marker}")

    start = page.find("{", anchor)
    if start == -1:
        raise RuntimeError(f"Could not find JSON start for marker: {marker}")

    depth = 0
    in_string = False
    escaped = False

    for idx in range(start, len(page)):
        ch = page[idx]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(page[start : idx + 1])

    raise RuntimeError(f"Could not parse JSON blob for marker: {marker}")


def clean_fragment(fragment_html: str) -> Tuple[str, int]:
    soup = BeautifulSoup(fragment_html, "html.parser")

    allowed_tags = {
        "p",
        "div",
        "span",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "br",
        "blockquote",
        "hr",
    }

    for tag in soup.find_all(True):
        if tag.name not in allowed_tags:
            tag.unwrap()
            continue

        attrs = {}
        if tag.name in {"p", "div"} and tag.get("style"):
            attrs["style"] = tag["style"]
        tag.attrs = attrs

    paragraphs: List[str] = []
    visible_text: List[str] = []

    for node in soup.contents:
        if getattr(node, "name", None) not in {"p", "div", "blockquote", "hr"}:
            if getattr(node, "strip", None):
                text = node.strip()
                if text:
                    paragraphs.append(f"<p>{html_lib.escape(text)}</p>")
                    visible_text.append(text)
            continue

        if node.name == "hr":
            paragraphs.append("<hr />")
            continue

        text = node.get_text(" ", strip=True)
        if not text:
            continue

        paragraphs.append(str(node))
        visible_text.append(text)

    word_count = len(re.findall(r"\b[\w'-]+\b", " ".join(visible_text)))
    return "\n".join(paragraphs), word_count


def chapter_html_to_markdown(html: str) -> str:
    """Flatten exported chapter HTML into readable Markdown paragraphs."""
    raw = (html or "").strip()
    if not raw:
        return ""
    soup = BeautifulSoup(f"<div class='w-root'>{raw}</div>", "html.parser")
    root = soup.select_one("div.w-root")
    if not root:
        return BeautifulSoup(raw, "html.parser").get_text("\n\n", strip=True)
    blocks: List[str] = []
    for top in root.children:
        name = getattr(top, "name", None)
        if name is None:
            continue
        if name == "hr":
            blocks.append("---")
            continue
        if name in ("p", "div", "blockquote"):
            text = top.get_text("\n", strip=True)
            if text:
                blocks.append(text)
            continue
    if not blocks:
        return root.get_text("\n\n", strip=True)
    return "\n\n".join(blocks)


def render_story_markdown(story: Dict[str, Any], chapters: List[Dict[str, Any]]) -> str:
    title = str(story.get("title") or "Untitled").replace("\r\n", "\n").replace("\r", "\n")
    user = story.get("user") or {}
    author = str(user.get("username") or user.get("name") or "")
    tags = ", ".join(str(t) for t in (story.get("tags") or []) if t)
    completed = "Completed" if story.get("completed") else "Ongoing"
    total_words = sum(int(c.get("word_count") or 0) for c in chapters)
    desc = str(story.get("description") or "").strip()
    lines: List[str] = [
        f"# {title}",
        "",
        f"- **Author:** {author}",
        f"- **Status:** {completed}",
        f"- **Chapters:** {story.get('numParts', len(chapters))}",
        f"- **Approx. words:** {total_words}",
        f"- **Tags:** {tags or '—'}",
        "",
        "## Story Summary",
        "",
        desc if desc else "_No summary._",
        "",
        "## Contents",
        "",
    ]
    for idx, ch in enumerate(chapters, start=1):
        lines.append(f"{idx}. {ch['title']}")
    lines.extend(["", "---", ""])
    for idx, ch in enumerate(chapters, start=1):
        lines.append(f"## Chapter {idx}: {ch['title']}")
        lines.append("")
        lines.append(f"*{ch['word_count']} words · Part ID {ch['id']}*")
        lines.append("")
        lines.append(chapter_html_to_markdown(str(ch.get("html") or "")))
        lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def fetch_story(session: requests.Session, story_url: str) -> Dict:
    response = session.get(story_url, timeout=30)
    response.raise_for_status()
    data = extract_json_blob(response.text, "window.__remixContext = ")
    loader = data["state"]["loaderData"]["routes/story.$storyid"]
    return loader["story"]


def fetch_root_loader_data(session: requests.Session) -> Dict:
    response = session.get("https://www.wattpad.com/", timeout=30)
    response.raise_for_status()
    data = extract_json_blob(response.text, "window.__remixContext = ")
    root = data.get("state", {}).get("loaderData", {}).get("root")
    if not isinstance(root, dict):
        raise RuntimeError("Unexpected Wattpad homepage response: missing root loader data.")
    return root


def fetch_logged_in_user(session: requests.Session) -> Optional[Dict]:
    root = fetch_root_loader_data(session)
    user = root.get("currentUser")
    if isinstance(user, dict):
        return user
    return None


def _get_storytext_page(session: requests.Session, part: Dict[str, Any], page_no: int) -> requests.Response:
    """GET one storytext page; retry on 429/503 with backoff (Wattpad rate-limits aggressive clients)."""
    text_url = f"https://www.wattpad.com/apiv2/?m=storytext&id={part['id']}&page={page_no}"
    headers = {
        "Referer": part["url"],
        "X-Requested-With": "XMLHttpRequest",
    }
    last: Exception | None = None
    for attempt in range(12):
        resp = session.get(text_url, headers=headers, timeout=45)
        if resp.status_code in (429, 503):
            ra = resp.headers.get("Retry-After")
            if ra:
                try:
                    wait = float(ra)
                except ValueError:
                    wait = min(120.0, (2**attempt) * 1.0 + random.uniform(0.2, 1.0))
            else:
                wait = min(120.0, (2**attempt) * 1.0 + random.uniform(0.2, 1.5))
            time.sleep(wait)
            last = requests.exceptions.HTTPError(
                f"{resp.status_code} for url: {text_url}",
                response=resp,
            )
            continue
        resp.raise_for_status()
        return resp
    if last:
        raise last
    raise RuntimeError(f"storytext retries exhausted part={part['id']} page={page_no}")


def fetch_part_html(session: requests.Session, part: Dict) -> Tuple[str, int]:
    pages: List[str] = []
    total_words = 0
    page_no = 1

    while True:
        response = _get_storytext_page(session, part, page_no)
        fragment = response.text.strip()
        if not fragment:
            break

        cleaned_html, word_count = clean_fragment(fragment)
        if cleaned_html:
            pages.append(cleaned_html)
            total_words += word_count
        page_no += 1
        # 减轻同一章内连续分页触发 429
        time.sleep(0.1 + random.uniform(0, 0.15))

    if not pages:
        raise RuntimeError(f"No text pages returned for part {part['id']} ({part['title']})")

    return "\n".join(pages), total_words


def _fetch_one_part_worker(
    part: Dict[str, Any],
    part_index: int,
    cookies_path: Optional[Path],
) -> Tuple[int, Dict[str, Any]]:
    """One thread == one Session (requests.Session is not thread-safe)."""
    from wattpad_cookies import load_wattpad_cookies

    sess = requests.Session()
    sess.headers.update({"User-Agent": USER_AGENT})
    try:
        if cookies_path is not None:
            load_wattpad_cookies(sess, cookies_path)
        chapter_html, word_count = fetch_part_html(sess, part)
        return part_index, {
            "id": part["id"],
            "title": part["title"],
            "display_title": f"Chapter {part_index}: {part['title']}",
            "html": chapter_html,
            "word_count": word_count,
        }
    finally:
        sess.close()


def load_chapters_for_story(
    session: requests.Session,
    story: Dict[str, Any],
    *,
    progress: bool = True,
    cookies_path: Optional[Path] = None,
    parallel_parts: bool = False,
    max_part_workers: int = 2,
) -> List[Dict[str, Any]]:
    """
    Fetch HTML for each part. Default sequential (parallel_parts=False) to avoid Wattpad 429;
    set parallel_parts=True + max_part_workers>1 for limited parallel chapter fetches.
    """
    parts = story.get("parts") or []
    total_parts = len(parts)
    if total_parts == 0:
        return []

    use_parallel = parallel_parts and total_parts >= 2 and max_part_workers > 1
    if use_parallel:
        workers = min(max_part_workers, total_parts)
        done: Dict[int, Dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_fetch_one_part_worker, part, idx, cookies_path): idx
                for idx, part in enumerate(parts, start=1)
            }
            for fut in as_completed(futures):
                idx, chapter = fut.result()
                done[idx] = chapter
                if progress:
                    print(
                        f"[{len(done)}/{total_parts}] Fetched {chapter['title']} ({chapter['id']})",
                        file=sys.stderr,
                    )
        return [done[i] for i in range(1, total_parts + 1)]

    chapters: List[Dict[str, Any]] = []
    for idx, part in enumerate(parts, start=1):
        if progress:
            print(
                f"[{idx}/{total_parts}] Fetching {part['title']} ({part['id']})...",
                file=sys.stderr,
            )
        chapter_html, word_count = fetch_part_html(session, part)
        chapters.append(
            {
                "id": part["id"],
                "title": part["title"],
                "display_title": f"Chapter {idx}: {part['title']}",
                "html": chapter_html,
                "word_count": word_count,
            }
        )
    return chapters


def render_story_html(story: Dict, chapters: List[Dict]) -> str:
    total_words = sum(chapter["word_count"] for chapter in chapters)
    description = html_lib.escape(story.get("description", "")).replace("\n", "<br />\n")
    tags = ", ".join(story.get("tags", []))
    toc_items = "\n".join(
        f'<li>{html_lib.escape(chapter["display_title"])}</li>' for chapter in chapters
    )

    chapter_sections = []
    for idx, chapter in enumerate(chapters, start=1):
        chapter_sections.append(
            f"""
            <section class="chapter">
              <h2>Chapter {idx}: {html_lib.escape(chapter["title"])}</h2>
              <div class="chapter-meta">Part ID: {chapter["id"]} | Approx. {chapter["word_count"]} words</div>
              {chapter["html"]}
            </section>
            """
        )

    body = "\n".join(chapter_sections)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html_lib.escape(story["title"])}</title>
  <style>
    @page {{
      margin: 1in;
    }}
    body {{
      font-family: Georgia, serif;
      color: #1f1f1f;
      line-height: 1.55;
      font-size: 12pt;
    }}
    h1, h2, h3 {{
      font-family: "Helvetica Neue", Arial, sans-serif;
      color: #111;
    }}
    .title-page {{
      page-break-after: always;
    }}
    .eyebrow {{
      font-size: 11pt;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #666;
      margin-bottom: 0.4rem;
    }}
    .meta {{
      margin: 0.35rem 0;
    }}
    .summary, .toc {{
      margin-top: 1.2rem;
    }}
    .toc ul {{
      padding-left: 1.2rem;
    }}
    .chapter {{
      page-break-before: always;
    }}
    .chapter-meta {{
      color: #666;
      font-size: 10pt;
      margin-bottom: 1rem;
    }}
    p {{
      margin: 0 0 0.72rem 0;
      text-align: justify;
    }}
    blockquote {{
      margin: 0.8rem 1.5rem;
      color: #444;
    }}
    hr {{
      border: 0;
      border-top: 1px solid #bbb;
      margin: 1.2rem 0;
    }}
  </style>
</head>
<body>
  <section class="title-page">
    <div class="eyebrow">Wattpad Export</div>
    <h1>{html_lib.escape(story["title"])}</h1>
    <div class="meta"><strong>Author:</strong> {html_lib.escape(story["user"]["username"])}</div>
    <div class="meta"><strong>Status:</strong> {"Completed" if story.get("completed") else "Ongoing"}</div>
    <div class="meta"><strong>Chapters:</strong> {story.get("numParts", len(chapters))}</div>
    <div class="meta"><strong>Total Estimated Words:</strong> {total_words}</div>
    <div class="meta"><strong>Tags:</strong> {html_lib.escape(tags)}</div>
    <div class="summary">
      <h2>Story Summary</h2>
      <p>{description}</p>
    </div>
    <div class="toc">
      <h2>Contents</h2>
      <ul>
        {toc_items}
      </ul>
    </div>
  </section>
  {body}
</body>
</html>
"""
def export_story_assets(
    story_url: str,
    output_dir: str | Path = "wattpad_exports",
    basename: str | None = None,
    session: requests.Session | None = None,
    progress: bool = True,
    cookies_path: Optional[Path] = None,
) -> Dict[str, object]:
    own_session = session is None
    active_session = session or requests.Session()
    active_session.headers.update({"User-Agent": USER_AGENT})

    try:
        story = fetch_story(active_session, story_url)
        out_dir = Path(output_dir).expanduser().resolve()
        out_dir.mkdir(parents=True, exist_ok=True)

        chapters = load_chapters_for_story(
            active_session,
            story,
            progress=progress,
            cookies_path=cookies_path,
        )

        safe_name = basename or slugify(story["title"])
        html_path = out_dir / f"{safe_name}.html"
        docx_path = out_dir / f"{safe_name}.docx"

        story_html = render_story_html(story, chapters)
        html_path.write_text(story_html, encoding="utf-8")
        convert_html_file_to_docx(
            html_path,
            docx_path,
            title=story["title"],
            author=story["user"]["username"],
        )

        return {
            "story": story,
            "chapters": chapters,
            "html_path": html_path,
            "docx_path": docx_path,
        }
    finally:
        if own_session:
            active_session.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a public Wattpad story to DOCX.")
    parser.add_argument("story_url", help="Wattpad story URL, e.g. https://www.wattpad.com/story/123-title")
    parser.add_argument(
        "--output-dir",
        default="wattpad_exports",
        help="Directory where HTML and DOCX files will be written",
    )
    args = parser.parse_args()

    result = export_story_assets(
        story_url=args.story_url,
        output_dir=args.output_dir,
    )

    print(f"HTML: {result['html_path']}")
    print(f"DOCX: {result['docx_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
