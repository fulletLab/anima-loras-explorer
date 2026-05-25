# 🔍 LoRA Explorer for ComfyUI

A custom node that combines **LoRA model loading** with a **visual explorer** — preview what a LoRA looks like before committing to a generation.

![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| Feature | Description |
|---|---|
| **LoRA Loading** | Drop-in replacement for the standard LoRA loader (MODEL + CLIP) |
| **Visual Preview** | Shows a large preview image directly in the node |
| **Metadata Display** | Extracts and shows safetensors metadata (base model, network dim, trigger words, etc.) |
| **CivitAI Integration** | Optionally fetches preview images and metadata from CivitAI API |
| **Smart Caching** | SHA256 hashes and CivitAI data are cached locally to avoid redundant work |

---

## 📦 Installation

### Option 1: ComfyUI Manager
Search for **"LoRA Explorer"** in the ComfyUI Manager and install.

### Option 2: Manual
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/YOUR_USERNAME/loras-explores.git
```

Restart ComfyUI after installation.

---

## 🚀 Usage

1. Add the node: **Add Node → loaders → lora explorer → 🔍 LoRA Explorer**
2. Connect `MODEL` and `CLIP` inputs (same as standard LoRA loader)
3. Select a LoRA from the dropdown
4. Run the workflow — the preview image and metadata will appear in the node

### Preview Images

The node looks for **sidecar preview images** next to your LoRA files:

```
models/loras/
├── my_cool_lora.safetensors
├── my_cool_lora.preview.png    ← This will be shown!
└── my_cool_lora.civitai.json   ← Cached CivitAI metadata
```

Supported naming conventions (checked in order):
- `name.preview.png`
- `name.png`
- `name.preview.jpg`
- `name.jpg`

---

## 🌐 CivitAI Integration (Optional)

If you don't have preview images locally, the node can download them from CivitAI automatically.

### Setup

1. Get your API key from [CivitAI Account Settings](https://civitai.com/user/account)
2. Edit `config.json` in the node directory:

```json
{
    "civitai_api_key": "your_api_key_here"
}
```

3. Enable **"fetch_civitai"** in the node widget
4. Run — the node will:
   - Calculate the SHA256 hash of the LoRA
   - Query CivitAI for model info
   - Download the preview image as a sidecar file
   - Save metadata as a `.civitai.json` sidecar

> **🔒 Security Note:** The API key is stored in `config.json` and **never** exposed in workflows. Safe for public sharing.

---

## 📁 Project Structure

```
loras-explores/
├── __init__.py            # Package init + WEB_DIRECTORY
├── lora_explorer_node.py  # Node class (thin orchestrator)
├── metadata_utils.py      # Safetensors header parsing
├── preview_utils.py       # Preview image discovery & serving
├── hash_utils.py          # SHA256 calculation + caching
├── civitai_api.py         # CivitAI API client
├── config.json            # User configuration (API key)
├── js/
│   └── lora_explorer.js   # Frontend preview widget
└── README.md
```

---

## 🛠️ Configuration

| Option | Location | Description |
|---|---|---|
| `civitai_api_key` | `config.json` | Your CivitAI API token (optional) |
| `fetch_civitai` | Node widget | Enable/disable CivitAI fetching per execution |

---

## 📝 License

MIT License — free to use, modify, and distribute.
