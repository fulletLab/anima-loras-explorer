"""
LoRA Explorer — Custom Node Pack for ComfyUI
=============================================

A LoRA loader with visual preview and metadata extraction.
Supports sidecar images and optional CivitAI API integration.
"""

from .lora_explorer_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Register API routes (endpoints self-register via decorators on import)
from . import api_routes  # noqa: F401

# Tell ComfyUI to serve our JavaScript extension files
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
