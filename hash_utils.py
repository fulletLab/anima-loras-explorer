"""
Hash utilities for LoRA Explorer.
Calculates SHA256 hashes of model files with persistent caching.
"""

import hashlib
import json
import os
import time

# Cache file lives next to this script
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lora_hashes.json")


def _load_cache() -> dict:
    """Load the hash cache from disk."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def _save_cache(cache: dict):
    """Persist the hash cache to disk."""
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except IOError:
        pass  # Non-critical — we just lose caching


def calculate_sha256(file_path: str) -> str:
    """
    Calculate SHA256 hash of a file, using a cache keyed by
    (absolute path, file size, last-modified time) to skip
    re-hashing unchanged files.

    Returns the uppercase hex digest.
    """
    file_path = os.path.abspath(file_path)
    stat = os.stat(file_path)
    cache_key = f"{file_path}|{stat.st_size}|{stat.st_mtime}"

    cache = _load_cache()
    if cache_key in cache:
        return cache[cache_key]

    # Stream hash in 8 KB blocks to handle multi-GB files
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            block = f.read(8192)
            if not block:
                break
            sha256.update(block)

    hex_digest = sha256.hexdigest().upper()

    cache[cache_key] = hex_digest
    _save_cache(cache)

    return hex_digest


def calculate_autov2(file_path: str) -> str:
    """
    Calculate AutoV2 hash (first 10 hex chars of SHA256).
    This is the format CivitAI commonly indexes.
    """
    return calculate_sha256(file_path)[:10]
