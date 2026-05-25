"""
LoRA Explorer Node for ComfyUI.

Thin orchestrator that delegates to specialized modules:
  - metadata_utils  → safetensors header parsing
  - preview_utils   → sidecar image discovery & serving
  - hash_utils      → SHA256 caching
  - civitai_api     → remote metadata & image download
"""

import json
import os

import folder_paths
import comfy.sd
import comfy.utils

from .metadata_utils import (
    extract_metadata,
    build_display_metadata,
    merge_civitai_metadata,
)
from .preview_utils import (
    find_preview_image,
    get_preview_sidecar_path,
    get_metadata_sidecar_path,
    serve_preview_to_ui,
)
from .hash_utils import calculate_sha256
from .civitai_api import (
    fetch_civitai_metadata,
    download_preview_image,
    save_civitai_metadata,
    extract_useful_metadata,
)


class LoraExplorerLoader:
    """
    🔍 LoRA Explorer — loads a LoRA onto MODEL and CLIP
    with visual preview and metadata display.
    """

    def __init__(self):
        self.loaded_lora = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_name": (folder_paths.get_filename_list("loras"),),
                "strength_model": (
                    "FLOAT",
                    {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01},
                ),
                "strength_clip": (
                    "FLOAT",
                    {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01},
                ),
            },
            "optional": {
                "fetch_civitai": (
                    "BOOLEAN",
                    {"default": False, "label_on": "Enabled", "label_off": "Disabled"},
                ),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    OUTPUT_NODE = False
    FUNCTION = "load_lora"
    CATEGORY = "loaders/lora explorer"

    # ------------------------------------------------------------------
    # Core execution
    # ------------------------------------------------------------------

    def load_lora(
        self, model, clip, lora_name, strength_model, strength_clip, fetch_civitai=False
    ):
        lora_path = self._resolve_path(lora_name)
        display_meta = self._gather_metadata(lora_path)
        preview_path = self._resolve_preview(lora_path, fetch_civitai, display_meta)
        model_lora, clip_lora = self._apply_lora(lora_path, model, clip, strength_model, strength_clip)

        return {
            "ui": {
                "images": serve_preview_to_ui(preview_path),
                "metadata": [display_meta],
            },
            "result": (model_lora, clip_lora),
        }

    # ------------------------------------------------------------------
    # Private helpers — each one is a single step in the pipeline
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_path(lora_name: str) -> str:
        """Turn a dropdown name into an absolute filesystem path."""
        lora_path = folder_paths.get_full_path("loras", lora_name)
        if lora_path is None:
            raise FileNotFoundError(f"LoRA file not found: {lora_name}")
        return lora_path

    @staticmethod
    def _gather_metadata(lora_path: str) -> dict:
        """Extract safetensors metadata and build the display dict."""
        st_metadata = {}
        if lora_path.lower().endswith(".safetensors"):
            st_metadata = extract_metadata(lora_path)
        return build_display_metadata(lora_path, st_metadata)

    @staticmethod
    def _resolve_preview(lora_path: str, fetch_civitai: bool, display_meta: dict) -> str | None:
        """
        Find or download a preview image.

        1. Check for an existing sidecar image.
        2. If none and ``fetch_civitai`` is True, download from CivitAI.
        3. Either way, try to load cached CivitAI metadata.
        """
        preview_path = find_preview_image(lora_path)

        if fetch_civitai and preview_path is None:
            preview_path = LoraExplorerLoader._fetch_from_civitai(lora_path, display_meta)
        elif fetch_civitai:
            # Already have a preview — still merge cached metadata
            LoraExplorerLoader._load_cached_civitai(lora_path, display_meta)

        return preview_path

    @staticmethod
    def _fetch_from_civitai(lora_path: str, display_meta: dict) -> str | None:
        """Calculate hash, query CivitAI, download preview + save metadata."""
        try:
            file_hash = calculate_sha256(lora_path)
            display_meta["sha256"] = file_hash

            civitai_data = fetch_civitai_metadata(file_hash)
            if not civitai_data:
                print(f"[LoRA Explorer] No CivitAI data for hash {file_hash[:10]}…")
                return None

            civitai_info = extract_useful_metadata(civitai_data)
            merge_civitai_metadata(display_meta, civitai_info)

            # Persist metadata sidecar
            save_civitai_metadata(civitai_data, get_metadata_sidecar_path(lora_path))

            # Download first preview image
            preview_urls = civitai_info.get("preview_images", [])
            if preview_urls:
                sidecar = get_preview_sidecar_path(lora_path)
                if download_preview_image(preview_urls[0], sidecar):
                    print(f"[LoRA Explorer] Downloaded preview → {sidecar}")
                    return sidecar

        except Exception as e:
            print(f"[LoRA Explorer] CivitAI fetch error: {e}")

        return None

    @staticmethod
    def _load_cached_civitai(lora_path: str, display_meta: dict):
        """Merge CivitAI metadata from an existing sidecar JSON."""
        meta_sidecar = get_metadata_sidecar_path(lora_path)
        if not os.path.isfile(meta_sidecar):
            return
        try:
            with open(meta_sidecar, "r", encoding="utf-8") as f:
                civitai_data = json.load(f)
            civitai_info = extract_useful_metadata(civitai_data)
            merge_civitai_metadata(display_meta, civitai_info)
        except Exception:
            pass

    @staticmethod
    def _apply_lora(lora_path, model, clip, strength_model, strength_clip):
        """Load the LoRA weights and apply them to MODEL + CLIP."""
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        return comfy.sd.load_lora_for_models(model, clip, lora, strength_model, strength_clip)


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

NODE_CLASS_MAPPINGS = {
    "LoraExplorerLoader": LoraExplorerLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoraExplorerLoader": "🔍 LoRA Explorer",
}
