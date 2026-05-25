"""Civitai API integration for LoRA Explorer."""

import json
import os
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request

CIVITAI_API_BASE = os.getenv("LORA_EXPLORER_CIVITAI_API_BASE", "https://civitai.red/api/v1").rstrip("/")
CIVITAI_DOWNLOAD_BASE = os.getenv("LORA_EXPLORER_CIVITAI_DOWNLOAD_BASE", "https://civitai.red/api/download/models").rstrip("/")
CIVITAI_API_FALLBACK_BASE = "https://civitai.com/api/v1"
USER_AGENT = "LoRA-Explorer-ComfyUI/1.1"
VALID_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXTENSIONS = (".mp4", ".webm", ".mov", ".m4v", ".avi")


def _api_bases() -> list[str]:
    bases = []
    for base in (CIVITAI_API_BASE, CIVITAI_API_FALLBACK_BASE):
        clean = str(base or "").rstrip("/")
        if clean and clean not in bases:
            bases.append(clean)
    return bases


def _load_config() -> dict:
    """Load config.json from the node directory."""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _request_headers(api_key: str | None = None, json_content: bool = True) -> dict:
    headers = {"User-Agent": USER_AGENT}
    if json_content:
        headers["Content-Type"] = "application/json"
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _append_token(url: str, api_key: str | None = None) -> str:
    if not api_key:
        return url
    try:
        parsed = urllib.parse.urlparse(url)
        if "civitai" not in parsed.netloc.lower():
            return url
        query = urllib.parse.parse_qs(parsed.query)
        if "token" in query:
            return url
        query["token"] = [api_key]
        return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))
    except Exception:
        return url


def _download_params(api_key: str | None = None) -> str:
    params = {
        "type": "Model",
        "format": "SafeTensor",
        "size": "full",
    }
    if api_key:
        params["token"] = api_key
    return urllib.parse.urlencode(params)


def build_model_download_urls(version_id: int | str, file_info: dict | None = None, api_key: str | None = None) -> list[str]:
    """Build download URL candidates for Civitai/civitai.red authenticated downloads."""
    version_id = str(version_id or "").strip()
    candidates = []
    direct = str((file_info or {}).get("downloadUrl") or "").strip()
    if direct:
        candidates.append(_append_token(direct, api_key))
    if version_id:
        params = _download_params(api_key)
        candidates.append(f"{CIVITAI_DOWNLOAD_BASE}/{urllib.parse.quote(version_id)}?{params}")
        candidates.append(f"https://civitai.com/api/download/models/{urllib.parse.quote(version_id)}?{params}")

    result = []
    seen = set()
    for url in candidates:
        key = url.lower()
        if not url or key in seen:
            continue
        seen.add(key)
        result.append(url)
    return result


def _read_json_url(url: str, api_key: str | None = None, timeout: int = 25) -> dict | None:
    req = urllib.request.Request(url, headers=_request_headers(api_key), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[LoRA Explorer] Civitai API error {e.code}: {e.reason}")
        return None
    except urllib.error.URLError as e:
        print(f"[LoRA Explorer] Civitai connection error: {e.reason}")
        return None
    except Exception as e:
        print(f"[LoRA Explorer] Civitai unexpected error: {e}")
        return None


def fetch_civitai_metadata(file_hash: str, api_key: str | None = None) -> dict | None:
    """
    Query CivitAI API for model-version metadata by file hash.

    Parameters
    ----------
    file_hash : str
        SHA256 (or AutoV2) hash of the model file.
    api_key : str, optional
        CivitAI API token. If None, tries to read from config.json.

    Returns
    -------
    dict or None
        Parsed JSON response, or None on failure.
    """
    if api_key is None:
        config = _load_config()
        api_key = config.get("civitai_api_key", "")

    for base in _api_bases():
        url = f"{base}/model-versions/by-hash/{file_hash}"
        for attempt in range(2):
            payload = _read_json_url(url, api_key=api_key, timeout=15)
            if payload:
                return payload
            if attempt == 0:
                time.sleep(0.8)
    return None


def search_civitai_loras(query: str = "", cursor: str = "", limit: int = 50) -> dict | None:
    """Search civitai.red for Anima LoRAs using the public REST API."""
    try:
        limit = max(1, min(int(limit or 50), 100))
    except ValueError:
        limit = 50
    params = {
        "limit": str(limit),
        "types": "LORA",
        "baseModels": "Anima",
        "sortBy": "models_v9",
    }
    clean_query = str(query or "").strip()
    clean_cursor = str(cursor or "").strip()
    if clean_query:
        params["query"] = clean_query
    if clean_cursor:
        params["cursor"] = clean_cursor

    encoded = urllib.parse.urlencode(params)
    for base in _api_bases():
        url = f"{base}/models?{encoded}"
        for attempt in range(2):
            payload = _read_json_url(url, timeout=30)
            if payload:
                return payload
            if attempt == 0:
                time.sleep(0.8)
    return None


def fetch_civitai_model(model_id: int | str, api_key: str | None = None) -> dict | None:
    """Fetch full model details by Civitai model id."""
    model_id = str(model_id or "").strip()
    if not model_id:
        return None
    for base in _api_bases():
        url = f"{base}/models/{urllib.parse.quote(model_id)}"
        for attempt in range(2):
            payload = _read_json_url(url, api_key=api_key, timeout=30)
            if payload:
                return payload
            if attempt == 0:
                time.sleep(0.8)
    return None


def is_valid_image_entry(image: dict) -> bool:
    """Return True for image media and False for videos or unsupported formats."""
    if not isinstance(image, dict):
        return False
    media_type = str(image.get("type") or image.get("mediaType") or "").strip().lower()
    mime_type = str(image.get("mimeType") or image.get("mime") or "").strip().lower()
    url = str(image.get("url") or "").strip()
    if not url:
        return False
    path = urllib.parse.urlparse(url).path.lower()
    _, ext = os.path.splitext(path)
    if media_type and media_type != "image":
        return False
    if mime_type and not mime_type.startswith("image/"):
        return False
    if ext in VIDEO_EXTENSIONS:
        return False
    return ext in VALID_IMAGE_EXTENSIONS or media_type == "image" or mime_type.startswith("image/")


def valid_image_urls(images: list) -> list[str]:
    urls = []
    seen = set()
    for image in images or []:
        if not is_valid_image_entry(image):
            continue
        url = str(image.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        urls.append(url)
    return urls


def image_url_with_width(image_url: str, width: int = 512) -> str:
    image_url = str(image_url or "").strip()
    if not image_url or "width=" in image_url:
        return image_url
    separator = "&" if "?" in image_url else "?"
    return f"{image_url}{separator}width={int(width)}"


def download_preview_image(image_url: str, save_path: str, api_key: str | None = None) -> bool:
    """
    Download an image from a URL and save it locally.

    Parameters
    ----------
    image_url : str
        Direct URL to the image.
    save_path : str
        Local path where the image will be saved.

    Returns
    -------
    bool
        True if download succeeded.
    """
    try:
        # CivitAI image URLs may need width parameter for reasonable sizes
        # Add width=512 if not already parameterized
        image_url = image_url_with_width(image_url, 512)

        req = urllib.request.Request(
            image_url,
            headers=_request_headers(api_key, json_content=False),
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            image_data = resp.read()

        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "wb") as f:
            f.write(image_data)

        return True
    except Exception as e:
        print(f"[LoRA Explorer] Failed to download preview: {e}")
        return False


def _safe_url_for_log(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        return urllib.parse.urlunparse(parsed._replace(query="", fragment=""))
    except Exception:
        return "<download url>"


def download_model_file(download_url: str | list[str], save_path: str, api_key: str, progress_callback=None) -> bool:
    """Download a Civitai model file using the configured API key."""
    urls = download_url if isinstance(download_url, list) else [download_url]
    urls = [str(url or "").strip() for url in urls if str(url or "").strip()]
    if not urls:
        return False

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    temp_path = f"{save_path}.download"
    last_error = ""

    for url in urls:
        try:
            req = urllib.request.Request(
                _append_token(url, api_key),
                headers=_request_headers(api_key, json_content=False),
            )
            with urllib.request.urlopen(req, timeout=1200) as resp, open(temp_path, "wb") as f:
                total = int(resp.headers.get("Content-Length") or 0)
                downloaded = 0
                if progress_callback:
                    progress_callback(downloaded, total, "Downloading")
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback:
                        progress_callback(downloaded, total, "Downloading")
            os.replace(temp_path, save_path)
            return True
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}: {e.reason} at {_safe_url_for_log(url)}"
        except Exception as e:
            last_error = f"{e} at {_safe_url_for_log(url)}"
        finally:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception:
                pass

    if last_error:
        print(f"[LoRA Explorer] Failed to download model: {last_error}")
    return False


def save_civitai_metadata(metadata: dict, save_path: str) -> bool:
    """
    Save CivitAI metadata JSON as a sidecar file.

    Parameters
    ----------
    metadata : dict
        The metadata dict from CivitAI API.
    save_path : str
        Path to save the JSON file (e.g. my_lora.civitai.json).

    Returns
    -------
    bool
        True if save succeeded.
    """
    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[LoRA Explorer] Failed to save metadata: {e}")
        return False


def extract_useful_metadata(civitai_data: dict) -> dict:
    """
    Extract the most useful fields from a CivitAI API response.

    Returns a simplified dict with model name, base model,
    trigger words, description, and preview image URLs.
    """
    if not civitai_data:
        return {}

    model_info = civitai_data.get("model", {})
    trained_words = civitai_data.get("trainedWords", [])
    images = civitai_data.get("images", [])

    image_urls = valid_image_urls(images)

    return {
        "model_name": model_info.get("name", "Unknown"),
        "version_name": civitai_data.get("name", "Unknown"),
        "base_model": civitai_data.get("baseModel", "Unknown"),
        "trigger_words": trained_words,
        "description": civitai_data.get("description", ""),
        "download_url": civitai_data.get("downloadUrl", ""),
        "preview_images": image_urls,
        "model_id": model_info.get("id", ""),
        "version_id": civitai_data.get("id", ""),
    }
