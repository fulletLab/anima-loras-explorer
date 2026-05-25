"""
Preview image utilities for LoRA Explorer.
Handles finding, copying, and serving sidecar preview images.
"""

import os
import shutil

import folder_paths

# Supported sidecar preview naming conventions (ordered by priority)
PREVIEW_EXTENSIONS = [
    ".preview.png",
    ".png",
    ".preview.jpg",
    ".jpg",
    ".preview.jpeg",
    ".preview.webp",
    ".webp",
]


def get_preview_sidecar_path(lora_path: str) -> str:
    """
    Return the canonical sidecar preview path for a LoRA file.

    Example: ``my_lora.safetensors`` → ``my_lora.preview.png``
    """
    base = os.path.splitext(lora_path)[0]
    return f"{base}.preview.png"


def get_metadata_sidecar_path(lora_path: str) -> str:
    """
    Return the canonical sidecar metadata path for a LoRA file.

    Example: ``my_lora.safetensors`` → ``my_lora.civitai.json``
    """
    base = os.path.splitext(lora_path)[0]
    return f"{base}.civitai.json"


def find_preview_image(lora_path: str) -> str | None:
    """
    Search for an existing sidecar preview image next to the LoRA file.

    Checks multiple naming conventions in priority order.

    Parameters
    ----------
    lora_path : str
        Absolute path to the LoRA model file.

    Returns
    -------
    str or None
        Absolute path to the found preview image, or None.
    """
    base = os.path.splitext(lora_path)[0]
    for ext in PREVIEW_EXTENSIONS:
        candidate = f"{base}{ext}"
        if os.path.isfile(candidate):
            return candidate
    return None


def serve_preview_to_ui(preview_path: str) -> list[dict]:
    """
    Copy a preview image to ComfyUI's temp directory so the
    frontend can access it, and return the UI descriptor list.

    Parameters
    ----------
    preview_path : str
        Absolute path to the source preview image.

    Returns
    -------
    list[dict]
        List with a single image descriptor for the ``ui`` return,
        or empty list if the file doesn't exist.
    """
    if not preview_path or not os.path.isfile(preview_path):
        return []

    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)

    preview_filename = f"lora_preview_{os.path.basename(preview_path)}"
    temp_preview = os.path.join(temp_dir, preview_filename)
    shutil.copy2(preview_path, temp_preview)

    return [
        {
            "filename": preview_filename,
            "subfolder": "",
            "type": "temp",
        }
    ]
