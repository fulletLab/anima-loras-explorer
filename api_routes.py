"""
API routes for LoRA Explorer.

Registers HTTP endpoints on the ComfyUI server to serve
LoRA listings, preview images, and CivitAI fetch triggers.
"""

import json
import os
import mimetypes
import re
import threading
import time
import urllib.parse
import uuid

from aiohttp import web
from server import PromptServer

import folder_paths

from .preview_utils import find_preview_image, get_preview_sidecar_path, get_metadata_sidecar_path
from .metadata_utils import extract_metadata, build_display_metadata
from .hash_utils import calculate_sha256
from .civitai_api import (
    fetch_civitai_metadata,
    fetch_civitai_model,
    search_civitai_loras,
    build_model_download_urls,
    download_model_file,
    download_preview_image,
    save_civitai_metadata,
    extract_useful_metadata,
    is_valid_image_entry,
    valid_image_urls,
    image_url_with_width,
)


LORA_EXTENSIONS = (".safetensors", ".pt", ".ckpt", ".bin")
_DOWNLOAD_JOBS = {}
_DOWNLOAD_JOBS_LOCK = threading.Lock()


# ------------------------------------------------------------------
#  GET /lora-explorer/list
#  Returns all available LoRAs with preview availability & metadata.
# ------------------------------------------------------------------

def _get_lora_roots() -> list[str]:
    try:
        roots = folder_paths.get_folder_paths("loras")
        if roots:
            return list(roots)
    except Exception:
        pass
    try:
        roots = folder_paths.folder_names_and_paths.get("loras", ([],))[0]
        return list(roots or [])
    except Exception:
        return []


def _resolve_lora_path(lora_name: str) -> str | None:
    try:
        full_path = folder_paths.get_full_path("loras", lora_name)
        if full_path and os.path.isfile(full_path):
            return full_path
    except Exception:
        pass
    for root in _get_lora_roots():
        candidate = os.path.join(root, lora_name.replace("/", os.sep))
        if os.path.isfile(candidate):
            return candidate
    return None


def _scan_lora_names() -> dict[str, str]:
    found = {}
    for root in _get_lora_roots():
        if not os.path.isdir(root):
            continue
        for base, _dirs, files in os.walk(root):
            for filename in files:
                if not filename.lower().endswith(LORA_EXTENSIONS):
                    continue
                full_path = os.path.join(base, filename)
                rel = os.path.relpath(full_path, root).replace(os.sep, "/")
                found.setdefault(rel, full_path)
    return found


def _read_civitai_sidecar(full_path: str) -> dict:
    meta_sidecar = get_metadata_sidecar_path(full_path)
    if not os.path.isfile(meta_sidecar):
        return {}
    try:
        with open(meta_sidecar, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _build_lora_entry(name: str, full_path: str) -> dict:
    preview_path = find_preview_image(full_path)
    has_preview = preview_path is not None
    raw_civitai = _read_civitai_sidecar(full_path)
    civitai_meta = extract_useful_metadata(raw_civitai) if raw_civitai else {}
    stat = os.stat(full_path)

    st_meta = {}
    if full_path.lower().endswith(".safetensors"):
        try:
            raw_meta = extract_metadata(full_path)
            for key in ["ss_base_model_version", "modelspec.title", "modelspec.trigger_phrase"]:
                if key in raw_meta:
                    st_meta[key] = raw_meta[key]
        except Exception:
            pass

    return {
        "name": name,
        "filename": os.path.basename(full_path),
        "has_preview": has_preview,
        "file_size_bytes": stat.st_size,
        "file_size_mb": round(stat.st_size / (1024 * 1024), 2),
        "mtime": stat.st_mtime,
        "model_name": civitai_meta.get("model_name", st_meta.get("modelspec.title", "")),
        "base_model": civitai_meta.get("base_model", st_meta.get("ss_base_model_version", "")),
        "trigger_words": civitai_meta.get("trigger_words", []),
        "model_id": civitai_meta.get("model_id", ""),
        "version_id": civitai_meta.get("version_id", ""),
    }


@PromptServer.instance.routes.get("/lora-explorer/list")
async def list_loras(request):
    """Return a JSON array of all LoRAs with preview info."""
    names_to_paths = {}

    try:
        for name in folder_paths.get_filename_list("loras"):
            full_path = _resolve_lora_path(name)
            if full_path:
                names_to_paths[name] = full_path
    except Exception:
        pass

    names_to_paths.update(_scan_lora_names())
    results = [
        _build_lora_entry(name, full_path)
        for name, full_path in sorted(names_to_paths.items(), key=lambda item: item[0].lower())
    ]

    return web.json_response(results)


def _extract_next_cursor(metadata: dict) -> str:
    if not isinstance(metadata, dict):
        return ""
    cursor = str(metadata.get("nextCursor") or metadata.get("cursor") or "").strip()
    if cursor:
        return cursor
    next_page = str(metadata.get("nextPage") or "").strip()
    if not next_page:
        return ""
    try:
        parsed = urllib.parse.urlparse(next_page)
        query = urllib.parse.parse_qs(parsed.query)
        return str((query.get("cursor") or [""])[0]).strip()
    except Exception:
        return ""


def _clean_remote_query(value: str) -> str:
    clean = str(value or "")
    clean = clean.replace("@", " ")
    clean = clean.replace("_", " ")
    clean = re.sub(r"[,;|]+", " ", clean)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def _safe_filename(value: str, fallback: str = "civitai_lora") -> str:
    name = str(value or "").strip() or fallback
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = fallback
    return name[:180]


def _get_lora_root() -> str:
    roots = _get_lora_roots()
    if roots:
        return roots[0]
    raise RuntimeError("Could not resolve ComfyUI LoRA folder.")


def _download_dir() -> str:
    return os.path.join(_get_lora_root(), "Civitai", "Anima")


def _relative_lora_name(path: str) -> str:
    root = _get_lora_root()
    return os.path.relpath(path, root).replace(os.sep, "/")


def _sidecar_version_id(path: str) -> str:
    raw = _read_civitai_sidecar(path)
    return str(raw.get("id") or raw.get("version_id") or "").strip()


def _target_path_for_version(base_path: str, version: dict) -> tuple[str, bool]:
    version_id = str(version.get("id") or "").strip()
    if not os.path.isfile(base_path):
        return base_path, False
    if version_id and _sidecar_version_id(base_path) == version_id:
        return base_path, True

    root, ext = os.path.splitext(base_path)
    version_slug = _safe_filename(version.get("name") or version_id or "new_version", "new_version")
    candidate = f"{root} - {version_slug}{ext}"
    index = 2
    while os.path.isfile(candidate):
        if version_id and _sidecar_version_id(candidate) == version_id:
            return candidate, True
        candidate = f"{root} - {version_slug} {index}{ext}"
        index += 1
    return candidate, False


def _normalize_words(words) -> list[str]:
    if not isinstance(words, list):
        return []
    result = []
    seen = set()
    for word in words:
        clean = str(word or "").strip().strip(",")
        key = clean.lower()
        if not clean or key in seen:
            continue
        seen.add(key)
        result.append(clean)
    return result


def _is_safetensor_lora_file(file_info: dict) -> bool:
    if not isinstance(file_info, dict):
        return False
    name = str(file_info.get("name") or "").lower()
    file_type = str(file_info.get("type") or "").lower()
    metadata = file_info.get("metadata") if isinstance(file_info.get("metadata"), dict) else {}
    fmt = str(metadata.get("format") or "").lower()
    return (file_type in ("model", "") and name.endswith(".safetensors")) or fmt == "safetensor"


def _select_lora_file(version: dict) -> dict | None:
    files = version.get("files") if isinstance(version.get("files"), list) else []
    safe_files = [item for item in files if _is_safetensor_lora_file(item)]
    if not safe_files:
        return None
    primary = [item for item in safe_files if item.get("primary")]
    return (primary or safe_files)[0]


def _version_image_urls(version: dict) -> list[str]:
    images = version.get("images") if isinstance(version.get("images"), list) else []
    return valid_image_urls(images)


def _image_prompt_text(image: dict) -> str:
    meta = image.get("meta") if isinstance(image.get("meta"), dict) else {}
    candidates = [
        image.get("prompt"),
        meta.get("prompt"),
        meta.get("Prompt"),
        meta.get("positivePrompt"),
        meta.get("positive_prompt"),
        meta.get("Positive prompt"),
    ]
    for value in candidates:
        clean = str(value or "").strip()
        if clean:
            return clean
    return ""


def _image_negative_text(image: dict) -> str:
    meta = image.get("meta") if isinstance(image.get("meta"), dict) else {}
    candidates = [
        image.get("negativePrompt"),
        image.get("negative_prompt"),
        meta.get("negativePrompt"),
        meta.get("negative_prompt"),
        meta.get("Negative prompt"),
    ]
    for value in candidates:
        clean = str(value or "").strip()
        if clean:
            return clean
    return ""


def _normalize_image_examples(images: list, width: int = 512) -> list[dict]:
    examples = []
    seen = set()
    for index, image in enumerate(images or []):
        if not is_valid_image_entry(image):
            continue
        url = str(image.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        meta = image.get("meta") if isinstance(image.get("meta"), dict) else {}
        examples.append({
            "index": len(examples),
            "source_index": index,
            "url": image_url_with_width(url, width),
            "thumbnail_url": image_url_with_width(url, width),
            "full_url": url,
            "prompt": _image_prompt_text(image),
            "negative_prompt": _image_negative_text(image),
            "seed": meta.get("seed") or meta.get("Seed") or "",
            "steps": meta.get("steps") or meta.get("Steps") or "",
            "sampler": meta.get("sampler") or meta.get("Sampler") or "",
            "cfg_scale": meta.get("cfgScale") or meta.get("cfg_scale") or meta.get("CFG scale") or "",
            "width": image.get("width") or meta.get("Size", ""),
            "height": image.get("height") or "",
            "meta": meta,
        })
    return examples


def _examples_sidecar_path(lora_path: str) -> str:
    return f"{os.path.splitext(lora_path)[0]}.examples.json"


def _examples_dir_path(lora_path: str) -> str:
    return f"{os.path.splitext(lora_path)[0]}.examples"


def _example_extension(url: str) -> str:
    path = urllib.parse.urlparse(str(url or "")).path
    ext = os.path.splitext(path)[1].lower()
    return ext if ext in (".png", ".jpg", ".jpeg", ".webp") else ".jpg"


def _download_example_assets(target_path: str, version: dict, api_key: str, job_id: str = "") -> list[dict]:
    images = version.get("images") if isinstance(version.get("images"), list) else []
    examples = _normalize_image_examples(images, width=512)
    if not examples:
        return []

    examples_dir = _examples_dir_path(target_path)
    os.makedirs(examples_dir, exist_ok=True)
    total = len(examples)

    for idx, example in enumerate(examples):
        _update_job(job_id, status="examples", message=f"Saving examples {idx + 1}/{total}")
        ext = _example_extension(example.get("full_url") or example.get("url"))
        filename = f"{idx + 1:03d}{ext}"
        local_path = os.path.join(examples_dir, filename)
        if not os.path.isfile(local_path):
            download_preview_image(example.get("url") or example.get("full_url"), local_path, api_key=api_key)
        if os.path.isfile(local_path):
            example["local_file"] = filename
            example["local_url"] = f"/lora-explorer/example/{urllib.parse.quote(_relative_lora_name(target_path), safe='')}/{idx}"

    with open(_examples_sidecar_path(target_path), "w", encoding="utf-8") as f:
        json.dump(examples, f, indent=2, ensure_ascii=False)
    return examples


def _read_example_sidecar(full_path: str) -> list[dict]:
    sidecar = _examples_sidecar_path(full_path)
    if not os.path.isfile(sidecar):
        return []
    try:
        with open(sidecar, "r", encoding="utf-8") as f:
            examples = json.load(f)
    except Exception:
        return []

    if not isinstance(examples, list):
        return []
    lora_name = _relative_lora_name(full_path)
    for idx, example in enumerate(examples):
        local_file = str(example.get("local_file") or "").strip() if isinstance(example, dict) else ""
        if local_file and os.path.isfile(os.path.join(_examples_dir_path(full_path), local_file)):
            example["local_url"] = f"/lora-explorer/example/{urllib.parse.quote(lora_name, safe='')}/{idx}"
    return examples


def _normalize_civitai_model(model: dict, preferred_version_id: str = "") -> dict:
    versions = model.get("modelVersions") if isinstance(model.get("modelVersions"), list) else []
    normalized_versions = []
    selected = None
    reference_images = []
    seen_images = set()

    for version in versions:
        file_info = _select_lora_file(version) or {}
        image_urls = _version_image_urls(version)
        image_examples = _normalize_image_examples(version.get("images") if isinstance(version.get("images"), list) else [], width=512)
        for url in image_urls:
            if url not in seen_images:
                seen_images.add(url)
                reference_images.append(image_url_with_width(url, 512))
        payload = {
            "id": version.get("id"),
            "name": version.get("name", ""),
            "base_model": version.get("baseModel", ""),
            "trigger_words": _normalize_words(version.get("trainedWords", [])),
            "download_url": file_info.get("downloadUrl") or (
                f"https://civitai.red/api/download/models/{version.get('id')}" if version.get("id") else ""
            ),
            "file_name": file_info.get("name", ""),
            "file_size_kb": file_info.get("sizeKB", 0),
            "preview_url": image_url_with_width(image_urls[0], 420) if image_urls else "",
            "preview_candidates": [image_url_with_width(url, 420) for url in image_urls],
            "reference_images": [image_url_with_width(url, 512) for url in image_urls],
            "reference_examples": image_examples,
            "created_at": version.get("createdAt", ""),
            "published_at": version.get("publishedAt", ""),
        }
        normalized_versions.append(payload)
        if preferred_version_id and str(version.get("id")) == str(preferred_version_id):
            selected = payload
        elif selected is None and file_info:
            selected = payload

    if selected is None and normalized_versions:
        selected = normalized_versions[0]

    creator = model.get("creator") if isinstance(model.get("creator"), dict) else {}
    selected = selected or {}
    return {
        "id": model.get("id"),
        "name": model.get("name", ""),
        "model_url": f"https://civitai.com/models/{model.get('id')}" if model.get("id") else "",
        "type": model.get("type", ""),
        "description": model.get("description", ""),
        "nsfw": bool(model.get("nsfw")),
        "creator": creator.get("username", ""),
        "tags": model.get("tags") if isinstance(model.get("tags"), list) else [],
        "stats": model.get("stats") if isinstance(model.get("stats"), dict) else {},
        "version": selected,
        "versions": normalized_versions,
        "base_model": selected.get("base_model", ""),
        "trigger_words": selected.get("trigger_words", []),
        "preview_url": selected.get("preview_url", "") or (image_url_with_width(reference_images[0], 420) if reference_images else ""),
        "preview_candidates": selected.get("preview_candidates", []) or [image_url_with_width(url, 420) for url in reference_images],
        "reference_images": reference_images,
        "reference_examples": selected.get("reference_examples", []),
        "downloaded": False,
    }


def _find_raw_version(model: dict, version_id: str = "") -> dict | None:
    versions = model.get("modelVersions") if isinstance(model.get("modelVersions"), list) else []
    if version_id:
        for version in versions:
            if str(version.get("id")) == str(version_id):
                return version
    for version in versions:
        if _select_lora_file(version):
            return version
    return versions[0] if versions else None


def _latest_downloadable_version(model: dict) -> dict | None:
    versions = model.get("modelVersions") if isinstance(model.get("modelVersions"), list) else []
    for version in versions:
        if _select_lora_file(version):
            return version
    return None


def _mb(value: int | float) -> float:
    return round(float(value or 0) / (1024 * 1024), 2)


def _job_snapshot(job: dict) -> dict:
    downloaded = int(job.get("downloaded_bytes") or 0)
    total = int(job.get("total_bytes") or 0)
    percent = round(downloaded * 100 / total, 1) if total else None
    return {
        **job,
        "downloaded_mb": _mb(downloaded),
        "total_mb": _mb(total) if total else None,
        "percent": percent,
    }


def _update_job(job_id: str, **updates):
    if not job_id:
        return
    with _DOWNLOAD_JOBS_LOCK:
        job = _DOWNLOAD_JOBS.setdefault(job_id, {
            "job_id": job_id,
            "status": "queued",
            "message": "Queued",
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "created_at": time.time(),
        })
        job.update(updates)
        job["updated_at"] = time.time()


def _get_job(job_id: str) -> dict | None:
    with _DOWNLOAD_JOBS_LOCK:
        job = _DOWNLOAD_JOBS.get(job_id)
        return dict(job) if job else None


def _perform_civitai_download(model_id: str, version_id: str = "", job_id: str = "") -> dict:
    config = _read_config()
    api_key = str(config.get("civitai_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("Civitai API key required")

    _update_job(job_id, status="preparing", message="Fetching model info")
    payload = fetch_civitai_model(model_id, api_key=api_key)
    if not payload:
        raise RuntimeError("Civitai model not found")

    version = _find_raw_version(payload, version_id)
    if not version:
        raise RuntimeError("No downloadable version found")

    file_info = _select_lora_file(version)
    if not file_info:
        raise RuntimeError("No SafeTensor LoRA file found for this model")

    download_urls = build_model_download_urls(version.get("id"), file_info, api_key)
    filename = _safe_filename(file_info.get("name") or f"{payload.get('name', 'civitai_lora')}.safetensors")
    if not filename.lower().endswith(".safetensors"):
        filename += ".safetensors"

    target_dir = _download_dir()
    target_path, already_downloaded = _target_path_for_version(os.path.join(target_dir, filename), version)

    def progress(downloaded, total, message):
        _update_job(
            job_id,
            status="downloading",
            message=message,
            downloaded_bytes=int(downloaded or 0),
            total_bytes=int(total or 0),
        )

    if not already_downloaded:
        ok = download_model_file(download_urls, target_path, api_key, progress_callback=progress)
        if not ok:
            raise RuntimeError("Download failed. Check that the Civitai API key is valid and that this model version is downloadable with your account.")
    else:
        size = os.path.getsize(target_path)
        _update_job(job_id, status="downloading", message="Already downloaded", downloaded_bytes=size, total_bytes=size)

    _update_job(job_id, status="metadata", message="Saving metadata")
    meta_path = get_metadata_sidecar_path(target_path)
    metadata_payload = dict(version)
    metadata_payload["model"] = {
        "id": payload.get("id"),
        "name": payload.get("name", ""),
        "type": payload.get("type", ""),
        "nsfw": payload.get("nsfw", False),
        "creator": payload.get("creator", {}),
    }
    save_civitai_metadata(metadata_payload, meta_path)

    _update_job(job_id, status="preview", message="Saving preview")
    preview_downloaded = False
    preview_urls = _version_image_urls(version)
    if preview_urls:
        sidecar = get_preview_sidecar_path(target_path)
        if os.path.isfile(sidecar):
            preview_downloaded = True
        else:
            for preview_url in preview_urls:
                if download_preview_image(preview_url, sidecar, api_key=api_key):
                    preview_downloaded = True
                    break

    examples = _download_example_assets(target_path, version, api_key, job_id)

    normalized = _normalize_civitai_model(payload, preferred_version_id=str(version.get("id") or ""))
    local_name = _relative_lora_name(target_path)
    local_entry = _build_lora_entry(local_name, target_path)

    return {
        "success": True,
        "already_downloaded": already_downloaded,
        "preview_downloaded": preview_downloaded,
        "local_lora_name": local_name,
        "filename": filename,
        "model": normalized,
        "trigger_words": normalized.get("trigger_words", []),
        "reference_examples": examples,
        "local_entry": local_entry,
    }


def _run_download_job(job_id: str, model_id: str, version_id: str):
    try:
        result = _perform_civitai_download(model_id, version_id, job_id)
        resolved_path = _resolve_lora_path(result.get("local_lora_name", ""))
        final_size = os.path.getsize(resolved_path) if resolved_path else 0
        _update_job(
            job_id,
            status="done",
            message="Done",
            downloaded_bytes=final_size,
            total_bytes=final_size,
            result=result,
            local_entry=result.get("local_entry", {}),
        )
    except Exception as exc:
        _update_job(job_id, status="failed", message=str(exc), error=str(exc))


@PromptServer.instance.routes.get("/lora-explorer/civitai/search")
async def search_remote_civitai(request):
    """Proxy remote Anima LoRA search through the ComfyUI backend."""
    query = _clean_remote_query(request.query.get("query", ""))
    cursor = request.query.get("cursor", "")
    try:
        limit = int(request.query.get("limit", "50") or 50)
    except ValueError:
        limit = 50
    payload = search_civitai_loras(query=query, cursor=cursor, limit=limit)
    if not payload:
        return web.json_response({"items": [], "next_cursor": "", "error": "Could not fetch Civitai results"}, status=502)

    items = [_normalize_civitai_model(item) for item in payload.get("items", []) if isinstance(item, dict)]
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    return web.json_response({
        "items": items,
        "next_cursor": _extract_next_cursor(metadata),
        "next_page": metadata.get("nextPage", ""),
        "metadata": metadata,
    })


@PromptServer.instance.routes.get("/lora-explorer/civitai/model/{model_id}")
async def get_remote_civitai_model(request):
    """Return normalized model details including reference images."""
    model_id = request.match_info["model_id"]
    version_id = request.query.get("version_id", "")
    payload = fetch_civitai_model(model_id)
    if not payload:
        return web.json_response({"error": "Civitai model not found"}, status=404)
    return web.json_response(_normalize_civitai_model(payload, preferred_version_id=version_id))


@PromptServer.instance.routes.post("/lora-explorer/civitai/download/start")
async def start_remote_civitai_download(request):
    """Start a Civitai LoRA download job and return a job id."""
    body = await request.json()
    model_id = str(body.get("model_id") or "").strip()
    version_id = str(body.get("version_id") or "").strip()

    config = _read_config()
    api_key = str(config.get("civitai_api_key") or "").strip()
    if not api_key:
        return web.json_response({"error": "Civitai API key required", "needs_key": True}, status=401)
    if not model_id:
        return web.json_response({"error": "model_id is required"}, status=400)

    job_id = uuid.uuid4().hex
    _update_job(job_id, status="queued", message="Queued", downloaded_bytes=0, total_bytes=0)
    thread = threading.Thread(target=_run_download_job, args=(job_id, model_id, version_id), daemon=True)
    thread.start()
    return web.json_response({"success": True, "job_id": job_id})


@PromptServer.instance.routes.get("/lora-explorer/civitai/download/progress/{job_id}")
async def get_remote_civitai_download_progress(request):
    """Return progress for a Civitai LoRA download job."""
    job_id = request.match_info["job_id"]
    job = _get_job(job_id)
    if not job:
        return web.json_response({"error": "Download job not found"}, status=404)
    return web.json_response(_job_snapshot(job))


@PromptServer.instance.routes.post("/lora-explorer/civitai/download")
async def download_remote_civitai_lora(request):
    """Download a selected Civitai LoRA into models/loras/Civitai/Anima."""
    body = await request.json()
    model_id = str(body.get("model_id") or "").strip()
    version_id = str(body.get("version_id") or "").strip()

    try:
        result = _perform_civitai_download(model_id, version_id)
        return web.json_response(result)
    except RuntimeError as exc:
        message = str(exc)
        status = 401 if "API key" in message else 502
        return web.json_response({"error": message, "needs_key": status == 401}, status=status)


# ------------------------------------------------------------------
#  GET /lora-explorer/preview/{lora_name}
#  Serves the preview image for a specific LoRA.
# ------------------------------------------------------------------

@PromptServer.instance.routes.get("/lora-explorer/preview/{lora_name:.*}")
async def get_preview(request):
    """Serve the sidecar preview image for a LoRA."""
    lora_name = request.match_info["lora_name"]
    full_path = _resolve_lora_path(lora_name)

    if full_path is None:
        return web.Response(status=404, text="LoRA not found")

    preview_path = find_preview_image(full_path)
    if preview_path is None or not os.path.isfile(preview_path):
        return web.Response(status=404, text="No preview available")

    mime_type = mimetypes.guess_type(preview_path)[0] or "image/png"
    return web.FileResponse(preview_path, headers={"Content-Type": mime_type})


@PromptServer.instance.routes.get("/lora-explorer/example/{lora_name:.*}/{index:\\d+}")
async def get_example_image(request):
    """Serve a downloaded Civitai example thumbnail for a LoRA."""
    lora_name = urllib.parse.unquote(request.match_info["lora_name"])
    try:
        index = int(request.match_info["index"])
    except ValueError:
        return web.Response(status=400, text="Invalid example index")

    full_path = _resolve_lora_path(lora_name)
    if full_path is None:
        return web.Response(status=404, text="LoRA not found")

    examples = _read_example_sidecar(full_path)
    if index < 0 or index >= len(examples):
        return web.Response(status=404, text="Example not found")

    filename = str(examples[index].get("local_file") or "").strip()
    if not filename:
        return web.Response(status=404, text="Example not downloaded")

    image_path = os.path.join(_examples_dir_path(full_path), filename)
    if not os.path.isfile(image_path):
        return web.Response(status=404, text="Example image not found")

    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    return web.FileResponse(image_path, headers={"Content-Type": mime_type})


# ------------------------------------------------------------------
#  GET /lora-explorer/metadata/{lora_name}
#  Returns full display metadata for a specific LoRA.
# ------------------------------------------------------------------

@PromptServer.instance.routes.get("/lora-explorer/metadata/{lora_name:.*}")
async def get_metadata(request):
    """Return full metadata for a LoRA."""
    lora_name = request.match_info["lora_name"]
    full_path = _resolve_lora_path(lora_name)

    if full_path is None:
        return web.json_response({"error": "LoRA not found"}, status=404)

    # Safetensors metadata
    st_metadata = {}
    if full_path.lower().endswith(".safetensors"):
        st_metadata = extract_metadata(full_path)

    display = build_display_metadata(full_path, st_metadata)

    display.update({
        "lora_name": lora_name,
        "has_preview": find_preview_image(full_path) is not None,
        "preview_url": f"/lora-explorer/preview/{urllib.parse.quote(lora_name)}" if find_preview_image(full_path) is not None else "",
    })

    raw = _read_civitai_sidecar(full_path)
    if raw:
        try:
            from .metadata_utils import merge_civitai_metadata
            civitai_info = extract_useful_metadata(raw)
            merge_civitai_metadata(display, civitai_info)
            display["trigger_words_list"] = civitai_info.get("trigger_words", [])
            display["model_id"] = civitai_info.get("model_id", "")
            display["version_id"] = civitai_info.get("version_id", "")
            if display["model_id"]:
                display["model_url"] = f"https://civitai.com/models/{display['model_id']}"
            sidecar_examples = _read_example_sidecar(full_path)
            display["reference_examples"] = sidecar_examples
            display["reference_images"] = [
                example.get("local_url") or example.get("thumbnail_url") or example.get("url")
                for example in sidecar_examples
                if isinstance(example, dict) and (example.get("local_url") or example.get("thumbnail_url") or example.get("url"))
            ]
        except Exception:
            pass

    model_id = str(display.get("model_id") or "").strip()
    installed_version_id = str(display.get("version_id") or "").strip()
    if model_id and request.query.get("check_update") == "1":
        remote = fetch_civitai_model(model_id)
        latest = _latest_downloadable_version(remote or {})
        versions = remote.get("modelVersions") if isinstance((remote or {}).get("modelVersions"), list) else []
        downloadable_versions = []
        for version in versions:
            version_file = _select_lora_file(version) or {}
            if not version_file:
                continue
            downloadable_versions.append({
                "id": version.get("id"),
                "name": version.get("name", ""),
                "base_model": version.get("baseModel", ""),
                "file_name": version_file.get("name", ""),
                "file_size_kb": version_file.get("sizeKB", 0),
                "created_at": version.get("createdAt", ""),
                "published_at": version.get("PublishedAt", "") or version.get("publishedAt", ""),
                "installed": str(version.get("id") or "") == installed_version_id,
            })
        display["available_versions"] = downloadable_versions
        display["model_url"] = f"https://civitai.com/models/{model_id}"
        if latest:
            latest_file = _select_lora_file(latest) or {}
            latest_id = str(latest.get("id") or "")
            display["latest_version"] = {
                "id": latest.get("id"),
                "name": latest.get("name", ""),
                "base_model": latest.get("baseModel", ""),
                "file_name": latest_file.get("name", ""),
                "file_size_kb": latest_file.get("sizeKB", 0),
                "created_at": latest.get("createdAt", ""),
                "published_at": latest.get("publishedAt", ""),
            }
            display["update_available"] = bool(installed_version_id and latest_id and latest_id != installed_version_id)

    return web.json_response(display)


# ------------------------------------------------------------------
#  POST /lora-explorer/fetch-civitai
#  Triggers CivitAI metadata + preview download for a single LoRA.
# ------------------------------------------------------------------

@PromptServer.instance.routes.post("/lora-explorer/fetch-civitai")
async def trigger_civitai_fetch(request):
    """Fetch metadata & preview from CivitAI for one LoRA."""
    body = await request.json()
    lora_name = body.get("lora_name", "")

    full_path = _resolve_lora_path(lora_name)
    if full_path is None:
        return web.json_response({"error": "LoRA not found"}, status=404)

    try:
        file_hash = calculate_sha256(full_path)
        civitai_data = fetch_civitai_metadata(file_hash)

        if not civitai_data:
            return web.json_response({
                "success": False,
                "message": f"No CivitAI data found for hash {file_hash[:10]}…",
            })

        civitai_info = extract_useful_metadata(civitai_data)

        # Save metadata sidecar
        meta_path = get_metadata_sidecar_path(full_path)
        save_civitai_metadata(civitai_data, meta_path)

        # Download preview
        preview_downloaded = False
        config = _read_config()
        api_key = str(config.get("civitai_api_key") or "").strip()
        preview_urls = civitai_info.get("preview_images", [])
        if preview_urls:
            sidecar = get_preview_sidecar_path(full_path)
            for preview_url in preview_urls:
                if download_preview_image(preview_url, sidecar, api_key=api_key):
                    preview_downloaded = True
                    break

        examples = _download_example_assets(full_path, civitai_data, api_key)
        local_entry = _build_lora_entry(lora_name, full_path)

        return web.json_response({
            "success": True,
            "preview_downloaded": preview_downloaded,
            "examples_downloaded": len(examples),
            "reference_examples": examples,
            "local_entry": local_entry,
            "model_name": civitai_info.get("model_name", ""),
            "base_model": civitai_info.get("base_model", ""),
            "trigger_words": civitai_info.get("trigger_words", []),
        })

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ------------------------------------------------------------------
#  Config path helper
# ------------------------------------------------------------------

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def _read_config() -> dict:
    """Read config.json from the node directory."""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _write_config(config: dict):
    """Write config.json to the node directory."""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


# ------------------------------------------------------------------
#  GET /lora-explorer/api-key
#  Returns whether an API key is configured (never exposes the key).
# ------------------------------------------------------------------

@PromptServer.instance.routes.get("/lora-explorer/api-key")
async def get_api_key_status(request):
    """Check if a CivitAI API key is configured."""
    config = _read_config()
    key = config.get("civitai_api_key", "")
    return web.json_response({
        "has_key": bool(key),
        # Show only last 4 chars for confirmation, never the full key
        "masked": f"…{key[-4:]}" if len(key) > 4 else ("••••" if key else ""),
    })


# ------------------------------------------------------------------
#  POST /lora-explorer/api-key
#  Saves the CivitAI API key to config.json.
# ------------------------------------------------------------------

@PromptServer.instance.routes.post("/lora-explorer/api-key")
async def set_api_key(request):
    """Save the CivitAI API key to config.json."""
    body = await request.json()
    new_key = body.get("api_key", "").strip()

    config = _read_config()
    config["civitai_api_key"] = new_key
    _write_config(config)

    return web.json_response({
        "success": True,
        "has_key": bool(new_key),
        "masked": f"…{new_key[-4:]}" if len(new_key) > 4 else ("••••" if new_key else ""),
    })


# ------------------------------------------------------------------
#  DELETE /lora-explorer/api-key
#  Removes the API key from config.json.
# ------------------------------------------------------------------

@PromptServer.instance.routes.delete("/lora-explorer/api-key")
async def delete_api_key(request):
    """Remove the CivitAI API key from config.json."""
    config = _read_config()
    config["civitai_api_key"] = ""
    _write_config(config)

    return web.json_response({"success": True, "has_key": False})
