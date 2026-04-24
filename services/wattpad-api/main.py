"""HTTP wrapper around the Wattpad crawler modules (same logic as wattpad_tool / wattpad_app)."""

from __future__ import annotations

import base64
import io
import json
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from translate_wattpad_html import translate_synopsis_to_zh_cn
from wattpad_export import slugify
from wattpad_tool import build_session, export_authorized_story_markdown, search_stories

app = FastAPI(title="Wattpad API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    keyword: str = Field(min_length=1)
    max_results: int = Field(default=20, ge=1, le=200)
    page_size: int = Field(default=50, ge=5, le=100)
    include_mature: bool = False
    include_paywalled: bool = False


class SynopsisTranslateRequest(BaseModel):
    """Preview-only: translate story description to zh-CN."""
    text: str = Field(default="", max_length=20_000)
    source_lang: str = Field(default="auto", max_length=16)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/translate/synopsis")
def v1_translate_synopsis(req: SynopsisTranslateRequest) -> dict[str, str]:
    try:
        translated = translate_synopsis_to_zh_cn(req.text, source_lang=req.source_lang.strip() or "auto")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"translated": translated}


@app.post("/v1/search")
def v1_search(req: SearchRequest) -> dict[str, Any]:
    session = build_session()
    try:
        return search_stories(
            session=session,
            keyword=req.keyword.strip(),
            max_results=req.max_results,
            page_size=req.page_size,
            include_mature=req.include_mature,
            include_paywalled=req.include_paywalled,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        session.close()


@app.post("/v1/export/markdown-one")
async def v1_export_markdown_one(
    payload: str = Form(..., description='JSON: { "story": {...}, "keyword"? } — 单本 Markdown'),
    cookies: UploadFile | None = File(None),
) -> JSONResponse:
    """单本导出：避免「多本塞进一个 JSON」导致网关/浏览器超时或内存爆掉。"""
    cookies_path: Path | None = None
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from e

    story = data.get("story")
    if not isinstance(story, dict):
        raise HTTPException(status_code=400, detail="story must be an object")

    url = str(story.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="story.url is required")

    if cookies is not None and cookies.filename:
        suffix = Path(cookies.filename).suffix or ".txt"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(await cookies.read())
        tmp.flush()
        tmp.close()
        cookies_path = Path(tmp.name).resolve()

    if bool(story.get("isPaywalled")) and (cookies_path is None or not cookies_path.is_file()):
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Paywalled story requires cookies file")

    log_buf = io.StringIO()

    def log_line(msg: str) -> None:
        log_buf.write(msg + "\n")

    try:
        title = str(story.get("title") or "")
        sid = story.get("id") or 1
        folder_name = f"{slugify(story.get('title', '') or 'story')}-{sid}".strip()
        list_parts = story.get("numParts")
        log_line(f"[单本导出] {title}")
        log_line(f"  URL={url}")
        log_line(f"  id={sid} 搜索列表章节数={list_parts!r} basename={folder_name}")
        t0 = time.perf_counter()
        session = build_session()
        try:
            item = export_authorized_story_markdown(
                session=session,
                story_url=url,
                basename=folder_name,
                cookies_path=cookies_path,
            )
        finally:
            session.close()
        elapsed = time.perf_counter() - t0
        raw_one = str(item.get("filename") or "story.txt").strip() or "story.txt"
        p_one = Path(raw_one)
        if p_one.suffix.lower() == ".md":
            fname = str(p_one.with_suffix(".txt"))
        elif p_one.suffix.lower() == ".txt":
            fname = str(p_one)
        else:
            fname = str(p_one) + ".txt"
        content = str(item.get("content") or "")
        part_count = int(item.get("part_count") or 0)
        nchars = len(content)
        log_line(
            f"  → 完成：{fname}，实拉章节={part_count}，字符≈{nchars}，"
            f"耗时 {elapsed:.2f}s，付费={'是' if item.get('paywalled') else '否'}"
        )
        log_text = log_buf.getvalue()
        if len(log_text) > 14_000:
            log_text = log_text[:14_000] + "\n...（日志过长已截断）"
        log_b64 = base64.b64encode(log_text.encode("utf-8")).decode("ascii")
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        return JSONResponse(
            {
                "filename": fname,
                "content": content,
                "part_count": part_count,
            },
            headers={"X-Wattpad-Log-B64": log_b64},
        )
    except HTTPException:
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/v1/export/batch")
async def v1_export_batch(
    payload: str = Form(
        ...,
        description="JSON: { stories, keyword?, packAsZip? } — packAsZip=true 时返回 ZIP（多选打包）",
    ),
    cookies: UploadFile | None = File(None),
):
    archive_path: Path | None = None
    cookies_path: Path | None = None
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from e

    stories = data.get("stories")
    if not isinstance(stories, list) or not stories:
        raise HTTPException(status_code=400, detail="stories must be a non-empty array")

    pack_as_zip = bool(data.get("packAsZip", False))
    any_paywalled = any(bool(s.get("isPaywalled")) for s in stories if isinstance(s, dict))

    if cookies is not None and cookies.filename:
        suffix = Path(cookies.filename).suffix or ".txt"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(await cookies.read())
        tmp.flush()
        tmp.close()
        cookies_path = Path(tmp.name).resolve()

    if any_paywalled and (cookies_path is None or not cookies_path.is_file()):
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Paywalled selection requires cookies file")

    log_buf = io.StringIO()

    def log_line(msg: str) -> None:
        log_buf.write(msg + "\n")

    try:
        batch_t0 = time.perf_counter()
        log_line(
            f"=== 导出开始 === 作品数={len(stories)}，打包ZIP={'是' if pack_as_zip else '否'}，"
            f"含付费={'是' if any_paywalled else '否'}"
        )
        session = build_session()
        files_out: list[dict[str, str]] = []
        used_filenames: set[str] = set()
        try:
            for idx, story in enumerate(stories, start=1):
                if not isinstance(story, dict):
                    raise HTTPException(status_code=400, detail="Each story must be an object")
                title = story.get("title", "")
                url = story.get("url") or ""
                if not url:
                    raise HTTPException(status_code=400, detail=f"缺少作品链接：{title!r}")
                sid = story.get("id") or idx
                folder_name = f"{slugify(story.get('title', '') or 'story')}-{sid}".strip()
                list_parts = story.get("numParts")
                log_line(f"[{idx}/{len(stories)}] 开始：{title}")
                log_line(f"  id={sid}  URL={url}")
                log_line(f"  搜索列表章节数={list_parts!r}  basename={folder_name}")
                t0 = time.perf_counter()
                item = export_authorized_story_markdown(
                    session=session,
                    story_url=url,
                    basename=folder_name,
                    cookies_path=cookies_path,
                )
                elapsed = time.perf_counter() - t0
                raw_fn = str(item.get("filename") or "story.txt").strip() or "story.txt"
                pth = Path(raw_fn)
                if pth.suffix.lower() == ".md":
                    fname = str(pth.with_suffix(".txt"))
                elif pth.suffix.lower() == ".txt":
                    fname = str(pth)
                else:
                    fname = str(pth) + ".txt"
                stem = Path(fname).stem
                dup_n = 2
                while fname in used_filenames:
                    fname = f"{stem}-{dup_n}.txt"
                    dup_n += 1
                used_filenames.add(fname)
                content = str(item.get("content") or "")
                nchars = len(content)
                nlines = content.count("\n") + (1 if content else 0)
                part_count = int(item.get("part_count") or 0)
                log_line(
                    f"  → 完成：文件={fname}，实拉章节={part_count}，字符≈{nchars}，行≈{nlines}，"
                    f"耗时 {elapsed:.2f}s，付费作品={'是' if item.get('paywalled') else '否'}"
                )
                files_out.append({"filename": fname, "content": content})
        finally:
            session.close()

        total_elapsed = time.perf_counter() - batch_t0
        log_line(f"=== 拉取正文结束 === 合计 {len(files_out)} 个 .txt，总耗时 {total_elapsed:.2f}s")

        log_text = log_buf.getvalue()
        if len(log_text) > 14_000:
            log_text = log_text[:14_000] + "\n...（日志过长已截断）"
        log_raw = log_text.encode("utf-8")
        log_b64 = base64.b64encode(log_raw).decode("ascii")
        log_headers = {"X-Wattpad-Log-B64": log_b64}

        if pack_as_zip:
            keyword = str(data.get("keyword") or "batch").strip()
            # Content-Disposition 必须为 latin-1；文件名仅用 ASCII（slugify 已限制，避免中文等）
            suggest_stem = f"{slugify(keyword) or 'batch'}-{len(stories)}-txt"
            tmp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            tmp_zip.close()
            archive_path = Path(tmp_zip.name).resolve()
            zip_t0 = time.perf_counter()
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for f in files_out:
                    zf.writestr(f["filename"], f["content"].encode("utf-8"))
            zip_dt = time.perf_counter() - zip_t0
            zip_bytes = archive_path.stat().st_size
            log_line(f"=== ZIP 完成 === 文件名={suggest_stem}.zip，体积≈{zip_bytes // 1024} KB，打包耗时 {zip_dt:.2f}s")

            log_text2 = log_buf.getvalue()
            if len(log_text2) > 14_000:
                log_text2 = log_text2[:14_000] + "\n...（日志过长已截断）"
            log_b64 = base64.b64encode(log_text2.encode("utf-8")).decode("ascii")
            log_headers = {"X-Wattpad-Log-B64": log_b64}

            def iter_file() -> Any:
                try:
                    with archive_path.open("rb") as fh:
                        while True:
                            chunk = fh.read(65536)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    archive_path.unlink(missing_ok=True)
                    if cookies_path and cookies_path.exists():
                        cookies_path.unlink(missing_ok=True)

            filename = f"{suggest_stem}.zip"
            headers = {
                **log_headers,
                "Content-Disposition": f'attachment; filename="{filename}"',
            }
            return StreamingResponse(iter_file(), media_type="application/zip", headers=headers)

        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)

        return JSONResponse(
            {"format": "text-multi", "files": files_out},
            headers=log_headers,
        )
    except HTTPException:
        if archive_path and archive_path.exists():
            archive_path.unlink(missing_ok=True)
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        if archive_path and archive_path.exists():
            archive_path.unlink(missing_ok=True)
        if cookies_path and cookies_path.exists():
            cookies_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(e)) from e
