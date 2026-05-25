"""
Safetensors metadata extraction for LoRA Explorer.
Reads and parses the JSON header embedded in .safetensors files.
"""

import json
import os
import struct


# Keys we extract from safetensors metadata for display
KNOWN_META_KEYS = [
    "ss_base_model_version",
    "ss_network_module",
    "ss_network_dim",
    "ss_network_alpha",
    "ss_training_comment",
    "ss_output_name",
    "ss_sd_model_name",
    "ss_clip_skip",
    "ss_num_train_images",
    "ss_tag_frequency",
    "modelspec.title",
    "modelspec.description",
    "modelspec.trigger_phrase",
]


def read_safetensors_header(file_path: str) -> dict:
    """
    Read the raw JSON header from a .safetensors file.

    Parameters
    ----------
    file_path : str
        Absolute path to the .safetensors file.

    Returns
    -------
    dict
        The full parsed header dict, or {} on failure.
    """
    try:
        with open(file_path, "rb") as f:
            header_len_bytes = f.read(8)
            if len(header_len_bytes) < 8:
                return {}
            header_len = struct.unpack("<Q", header_len_bytes)[0]
            # Sanity check — header shouldn't exceed 100 MB
            if header_len > 100 * 1024 * 1024:
                return {}
            header_bytes = f.read(header_len)
            return json.loads(header_bytes)
    except Exception as e:
        print(f"[LoRA Explorer] Error reading safetensors header: {e}")
        return {}


def extract_metadata(file_path: str) -> dict:
    """
    Extract the ``__metadata__`` section from a .safetensors file.

    Parameters
    ----------
    file_path : str
        Absolute path to the .safetensors file.

    Returns
    -------
    dict
        The metadata dict, or {} if absent.
    """
    header = read_safetensors_header(file_path)
    return header.get("__metadata__", {})


def build_display_metadata(lora_path: str, st_metadata: dict) -> dict:
    """
    Build a user-friendly metadata dict for the UI.

    Combines file info with relevant safetensors fields.

    Parameters
    ----------
    lora_path : str
        Absolute path to the LoRA file.
    st_metadata : dict
        Raw safetensors __metadata__ dict.

    Returns
    -------
    dict
        Cleaned metadata suitable for frontend display.
    """
    display = {
        "file_name": os.path.basename(lora_path),
        "file_size_mb": round(os.path.getsize(lora_path) / (1024 * 1024), 2),
    }

    for key in KNOWN_META_KEYS:
        if key in st_metadata:
            display[key] = st_metadata[key]

    return display


def merge_civitai_metadata(display_meta: dict, civitai_info: dict) -> dict:
    """
    Merge CivitAI-sourced info into the display metadata dict.

    Parameters
    ----------
    display_meta : dict
        Existing display metadata (mutated in place and returned).
    civitai_info : dict
        Simplified CivitAI info from ``extract_useful_metadata()``.

    Returns
    -------
    dict
        The updated display metadata.
    """
    display_meta["civitai_model"] = civitai_info.get("model_name", "")
    display_meta["civitai_version"] = civitai_info.get("version_name", "")
    display_meta["civitai_base_model"] = civitai_info.get("base_model", "")
    display_meta["trigger_words"] = ", ".join(civitai_info.get("trigger_words", []))
    return display_meta
