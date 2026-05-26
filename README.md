# Anima LoRA Explorer for ComfyUI

A ComfyUI LoRA loader with a visual explorer, local LoRA management, Civitai Anima search, prompt trigger tools, download progress, reference examples, and version update checks.

Current version: `1.0.1`

---

## Installation

### ComfyUI Manager

Search for `Anima LoRA Explorer` in ComfyUI Manager after the package is published to the ComfyUI Registry.

### Manual Install

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/fulletLab/anima-loras-explorer.git
```

Restart ComfyUI after installation.

The node appears as:

```text
LoRA Explorer
```

---

## Node Usage

1. Add the node from `loaders/lora explorer`.
2. Connect `MODEL` and `CLIP`.
3. Choose a LoRA from the `lora_name` dropdown.
4. Adjust model and CLIP strengths.
5. Run the workflow.

The loader applies the selected LoRA to both MODEL and CLIP, similar to the default ComfyUI LoRA loader.

---

## Explorer Features

### My LoRAs

Browse installed LoRAs from ComfyUI's LoRA folders. The list merges ComfyUI's indexed names with direct filesystem scanning, so newly downloaded LoRAs can appear before a ComfyUI restart.

Sort local LoRAs by:

- most recent
- A to Z
- Z to A
- heaviest
- lightest

### Search Civitai

Search remote Anima LoRAs through the backend proxy using:

```text
https://civitai.red/api/v1/models
```

The search uses:

- `types=LORA`
- `baseModels=Anima`
- `sortBy=models_v9`
- cursor pagination

Remote search is behind an English internet opt-in gate. No remote request is made until the user enables it.

### Civitai API Key

Search and info can work without an API key. Downloads require a saved Civitai API key.

The key is entered from the Explorer UI and stored locally in:

```text
config.json
```

The key is not stored in workflows and should not be committed to Git.

### Downloads

Remote downloads save LoRAs under the first ComfyUI LoRA root:

```text
models/loras/Civitai/Anima/
```

Downloads include:

- the selected SafeTensor LoRA
- `.civitai.json` sidecar metadata
- preview sidecar image
- downloaded reference examples when available
- `.examples.json` with prompt and metadata from Civitai image examples

Download progress shows MB, percent when available, and current phase.

### Reference Examples

`Open Info` shows LoRA reference images as thumbnails. Example cards can include:

- image preview
- positive prompt
- negative prompt
- generation metadata when Civitai provides it
- copy prompt actions

Video-first Civitai entries are skipped automatically until a valid `png`, `jpg`, `jpeg`, or `webp` image is found.

### Prompt Trigger Tools

LoRA Explorer never inserts `@lora`. It uses Civitai trained words.

Info actions include:

- `Copy`
- `Add to Prompt`
- `Replace Triggers`
- `Use LoRA`
- `Download & Use`

`Add to Prompt` appends trigger words. `Replace Triggers` replaces only the last trigger group inserted by LoRA Explorer; otherwise it appends.

### Prompt Preview

The Explorer includes an editable prompt preview connected to the active positive prompt text widget, so trigger actions are visible immediately.

### Local Metadata

For installed LoRAs, `Open Info` can show:

- filename
- size
- base model
- trigger words
- sidecar metadata
- downloaded examples
- Civitai link when known

`Fetch Metadata` downloads Civitai metadata, previews, and examples for local LoRAs when possible.

### Version Updates

If a local LoRA has Civitai sidecar metadata, the Explorer can compare the installed version with available Civitai model versions.

When a newer downloadable SafeTensor version exists, the UI shows an update action. New versions download beside the old file instead of deleting it.

---

## Sidecar Files

Example local layout:

```text
models/loras/Civitai/Anima/
├── example_lora.safetensors
├── example_lora.preview.png
├── example_lora.civitai.json
├── example_lora.examples.json
└── example_lora.examples/
    ├── example_001.jpg
    └── example_002.jpg
```

---

## Registry Metadata

This package includes `pyproject.toml` for ComfyUI Registry publishing:

```toml
[tool.comfy]
PublisherId = "fulletlab"
DisplayName = "Anima LoRA Explorer"
```

Publish with:

```bash
comfy node publish
```

---

## Git Safety

Do not commit:

- `config.json`
- `lora_hashes.json`
- `__pycache__/`
- `*.pyc`
- `*.download`
- downloaded model files

---

## License

MIT License.
