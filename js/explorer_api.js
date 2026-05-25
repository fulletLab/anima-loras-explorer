/**
 * LoRA Explorer — API Client
 * ===========================
 *
 * Functions to communicate with the LoRA Explorer backend API.
 */

/**
 * Fetch the list of all available LoRAs with preview info.
 * @returns {Promise<Array>}  Array of LoRA info objects.
 */
export async function fetchLoraList() {
    const resp = await fetch("/lora-explorer/list");
    if (!resp.ok) throw new Error(`Failed to fetch LoRA list: ${resp.status}`);
    return resp.json();
}

/**
 * Build the URL to load a LoRA's preview image.
 * @param {string} loraName  The LoRA identifier (same as dropdown value).
 * @returns {string}  URL to the preview image endpoint.
 */
export function getPreviewUrl(loraName) {
    return `/lora-explorer/preview/${encodeURIComponent(loraName)}`;
}

/**
 * Fetch full metadata for a specific LoRA.
 * @param {string} loraName
 * @returns {Promise<Object>}
 */
export async function fetchLoraMetadata(loraName, { checkUpdate = false } = {}) {
    const suffix = checkUpdate ? "?check_update=1" : "";
    const resp = await fetch(`/lora-explorer/metadata/${encodeURIComponent(loraName)}${suffix}`);
    if (!resp.ok) throw new Error(`Failed to fetch metadata: ${resp.status}`);
    return resp.json();
}

/**
 * Trigger CivitAI fetch for a specific LoRA (downloads preview + metadata).
 * @param {string} loraName
 * @returns {Promise<Object>}  Result object with success flag.
 */
export async function triggerCivitaiFetch(loraName) {
    const resp = await fetch("/lora-explorer/fetch-civitai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lora_name: loraName }),
    });
    if (!resp.ok) throw new Error(`CivitAI fetch failed: ${resp.status}`);
    return resp.json();
}

export async function searchCivitaiLoras({ query = "", cursor = "", limit = 50 } = {}) {
    const params = new URLSearchParams({
        query: String(query || ""),
        cursor: String(cursor || ""),
        limit: String(limit || 50),
    });
    const resp = await fetch(`/lora-explorer/civitai/search?${params.toString()}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Civitai search failed: ${resp.status}`);
    return data;
}

export async function fetchCivitaiModel(modelId, versionId = "") {
    const params = new URLSearchParams();
    if (versionId) params.set("version_id", String(versionId));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const resp = await fetch(`/lora-explorer/civitai/model/${encodeURIComponent(modelId)}${suffix}`);
    if (!resp.ok) throw new Error(`Civitai model info failed: ${resp.status}`);
    return resp.json();
}

export async function downloadCivitaiLora({ modelId, versionId = "" } = {}) {
    const resp = await fetch("/lora-explorer/civitai/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, version_id: versionId }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(data?.error || `Civitai download failed: ${resp.status}`);
        err.status = resp.status;
        err.data = data;
        throw err;
    }
    return data;
}

export async function startCivitaiDownload({ modelId, versionId = "" } = {}) {
    const resp = await fetch("/lora-explorer/civitai/download/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, version_id: versionId }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(data?.error || `Civitai download failed: ${resp.status}`);
        err.status = resp.status;
        err.data = data;
        throw err;
    }
    return data;
}

export async function getCivitaiDownloadProgress(jobId) {
    const resp = await fetch(`/lora-explorer/civitai/download/progress/${encodeURIComponent(jobId)}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(data?.error || `Civitai download progress failed: ${resp.status}`);
        err.status = resp.status;
        err.data = data;
        throw err;
    }
    return data;
}

/* ------------------------------------------------------------------ */
/*  API Key management                                                 */
/* ------------------------------------------------------------------ */

/**
 * Check if a CivitAI API key is configured.
 * @returns {Promise<{has_key: boolean, masked: string}>}
 */
export async function getApiKeyStatus() {
    const resp = await fetch("/lora-explorer/api-key");
    if (!resp.ok) throw new Error(`Failed to check API key: ${resp.status}`);
    return resp.json();
}

/**
 * Save a CivitAI API key to config.json.
 * @param {string} apiKey  The raw API key.
 * @returns {Promise<{success: boolean, has_key: boolean, masked: string}>}
 */
export async function saveApiKey(apiKey) {
    const resp = await fetch("/lora-explorer/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
    });
    if (!resp.ok) throw new Error(`Failed to save API key: ${resp.status}`);
    return resp.json();
}

/**
 * Remove the CivitAI API key from config.json.
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteApiKey() {
    const resp = await fetch("/lora-explorer/api-key", { method: "DELETE" });
    if (!resp.ok) throw new Error(`Failed to delete API key: ${resp.status}`);
    return resp.json();
}
