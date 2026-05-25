import {
    deleteApiKey,
    fetchCivitaiModel,
    fetchLoraList,
    fetchLoraMetadata,
    getApiKeyStatus,
    getCivitaiDownloadProgress,
    getPreviewUrl,
    saveApiKey,
    searchCivitaiLoras,
    startCivitaiDownload,
    triggerCivitaiFetch,
} from "./explorer_api.js";
import { injectModalStyles } from "./modal_styles.js";
import { createCard, createRemoteCard, renderProgress } from "./card_component.js";
import { filterLoras } from "./search_logic.js";
import { fetchAllPreviews } from "./batch_fetch.js";

let currentOverlay = null;
let onSelectCallback = null;

function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeWords(words = []) {
    const source = Array.isArray(words) ? words : String(words || "").split(",");
    const seen = new Set();
    const result = [];
    for (const word of source) {
        const clean = String(word || "").trim().replace(/^,+|,+$/g, "");
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        result.push(clean);
    }
    return result;
}

function triggerText(words = []) {
    return normalizeWords(words).join(", ");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyText(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    try {
        await navigator.clipboard?.writeText?.(value);
        return true;
    } catch {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
            ok = document.execCommand("copy");
        } catch {
            ok = false;
        }
        ta.remove();
        return ok;
    }
}

function buttonFeedback(btn, text, resetText = "", delay = 1100) {
    if (!btn) return;
    const previous = resetText || btn.dataset.defaultText || btn.textContent;
    btn.dataset.defaultText = previous;
    btn.textContent = text;
    if (delay > 0) {
        setTimeout(() => {
            if (btn.isConnected && btn.textContent === text) btn.textContent = previous;
        }, delay);
    }
}

function wordsFromLocalMeta(meta = {}, fallback = {}) {
    return normalizeWords(
        meta.trigger_words_list
        || meta.trigger_words
        || meta["modelspec.trigger_phrase"]
        || fallback.trigger_words
        || []
    );
}

function normalizeExamples(examples = []) {
    const source = Array.isArray(examples) ? examples : [];
    const result = [];
    const seen = new Set();
    for (const item of source) {
        const example = typeof item === "string" ? { url: item } : (item || {});
        const imageUrl = String(example.local_url || example.thumbnail_url || example.url || "").trim();
        if (!imageUrl || seen.has(imageUrl)) continue;
        seen.add(imageUrl);
        result.push({
            ...example,
            imageUrl,
            prompt: String(example.prompt || "").trim(),
            negative_prompt: String(example.negative_prompt || "").trim(),
        });
    }
    return result;
}

function exampleGridHtml(examples = []) {
    const clean = normalizeExamples(examples).slice(0, 80);
    if (!clean.length) return `<div class="lora-empty lora-info-empty"><span>No reference examples found.</span></div>`;
    return clean.map((example, index) => {
        const prompt = example.prompt || "";
        const neg = example.negative_prompt || "";
        return `
            <div class="lora-example-card">
                <img src="${escapeHtml(example.imageUrl)}" loading="lazy" decoding="async" alt="Reference example"/>
                <div class="lora-example-meta">
                    <span>${prompt ? escapeHtml(prompt) : "No prompt metadata"}</span>
                    ${neg ? `<small>Negative: ${escapeHtml(neg)}</small>` : ""}
                    <div class="lora-example-actions">
                        <button class="lora-btn-text" data-action="copy-example" data-example-index="${index}">Copy Prompt</button>
                        <button class="lora-btn-text" data-action="add-example" data-example-index="${index}">Add Prompt</button>
                        <button class="lora-btn-text" data-action="replace-example" data-example-index="${index}">Replace Prompt</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function sortLocalLoras(list, mode) {
    const items = [...list];
    const nameOf = (item) => String(item.model_name || item.filename || item.name || "").toLowerCase();
    if (mode === "az") return items.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    if (mode === "za") return items.sort((a, b) => nameOf(b).localeCompare(nameOf(a)));
    if (mode === "heavy") return items.sort((a, b) => Number(b.file_size_bytes || 0) - Number(a.file_size_bytes || 0));
    if (mode === "light") return items.sort((a, b) => Number(a.file_size_bytes || 0) - Number(b.file_size_bytes || 0));
    return items.sort((a, b) => Number(b.mtime || 0) - Number(a.mtime || 0));
}

function cleanRemoteQuery(value = "") {
    return String(value || "")
        .replace(/@/g, " ")
        .replace(/_/g, " ")
        .replace(/[,;|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function remoteKey(item = {}) {
    return String(item.id || item.model_id || item.name || "").trim().toLowerCase();
}

function mergeUniqueRemote(current = [], incoming = [], seen = new Set()) {
    const added = [];
    for (const item of incoming || []) {
        const key = remoteKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        current.push(item);
        added.push(item);
    }
    return added;
}

function civitaiUrl(item = {}) {
    const id = item.id || item.model_id;
    return String(item.model_url || (id ? `https://civitai.com/models/${id}` : "")).trim();
}

function versionOptionsHtml(versions = [], selectedId = "") {
    const list = Array.isArray(versions) ? versions : [];
    if (!list.length) return "";
    return `
        <label class="lora-version-picker">
            <span>Available Versions</span>
            <select id="lora-version-select">
                ${list.map((version) => {
                    const id = String(version.id || "");
                    const label = [
                        version.name || id,
                        version.base_model,
                        version.file_name,
                        version.file_size_kb ? `${(Number(version.file_size_kb) / 1024).toFixed(1)} MB` : "",
                        version.installed ? "installed" : "",
                    ].filter(Boolean).join(" | ");
                    return `<option value="${escapeHtml(id)}" ${id === String(selectedId || "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
                }).join("")}
            </select>
        </label>
    `;
}

export async function openExplorer(onSelect, promptController = null) {
    if (currentOverlay) closeExplorer();
    injectModalStyles();
    onSelectCallback = onSelect;

    let activeTab = "local";
    let localLoras = [];
    let remoteLoras = [];
    let remoteSeen = new Set();
    let remoteCursor = "";
    let remoteLoading = false;
    let remoteRenderToken = 0;
    let remoteFailureCount = 0;
    let remoteRetryTimer = null;
    let apiStatus = { has_key: false, masked: "" };
    let searchTimer = null;
    let promptSyncTimer = null;
    let localSort = localStorage.getItem("lora_explorer_local_sort") || "recent";
    let remoteEnabled = sessionStorage.getItem("lora_civitai_remote_enabled") === "true";
    let currentInfo = null;

    const overlay = document.createElement("div");
    overlay.id = "lora-explorer";
    overlay.innerHTML = `
        <div class="lora-backdrop"></div>
        <div class="lora-window">
            <div class="lora-hdr">
                <span class="lora-title">LoRA Explorer</span>
                <div class="lora-tabs">
                    <button class="lora-tab active" id="lora-tab-local">My LoRAs</button>
                    <button class="lora-tab" id="lora-tab-civitai">Search Civitai</button>
                </div>
                <select class="lora-local-sort" id="lora-local-sort" title="Sort My LoRAs">
                    <option value="recent">Most Recent</option>
                    <option value="az">A - Z</option>
                    <option value="za">Z - A</option>
                    <option value="heavy">Heaviest</option>
                    <option value="light">Lightest</option>
                </select>
                <div class="lora-search-wrap">
                    <i class="lora-search-icon">⌕</i>
                    <input type="text" class="lora-search" id="lora-search" placeholder="Search local LoRAs..." autocomplete="off" spellcheck="false"/>
                </div>
                <div class="lora-gap"></div>
                <span class="lora-auth" id="lora-civitai-auth">API key not set</span>
                <button class="lora-btn-text" id="lora-civitai-connect">Set API Key</button>
                <button class="lora-btn-text" id="lora-civitai-disconnect" style="display:none;">Remove Key</button>
                <button class="lora-btn-text" id="lora-btn-fetchall">Fetch Previews</button>
                <button class="lora-close" id="lora-btn-close" title="Close">&#10005;</button>
            </div>
            <div class="lora-prompt-panel">
                <div class="lora-prompt-head">
                    <span>Prompt Preview</span>
                    <small id="lora-prompt-status">editable</small>
                </div>
                <textarea id="lora-prompt-editor" spellcheck="false" placeholder="Active prompt text will appear here..."></textarea>
            </div>
            <div class="lora-body">
                <div class="lora-grid" id="lora-grid">
                    <div class="lora-empty"><div class="lora-spinner"></div><span>Loading LoRAs...</span></div>
                </div>
            </div>

            <div class="lora-key-modal hidden" id="lora-key-modal">
                <div class="lora-key-panel">
                    <div class="lora-panel-header">
                        <div class="lora-panel-copy">
                            <strong>Set Civitai API Key</strong>
                            <span>Generate a Personal API Key in your Civitai account settings, then paste it here. The key stays on this machine and is only sent to Civitai.</span>
                        </div>
                        <button class="lora-close" id="lora-key-close" title="Close">&#10005;</button>
                    </div>
                    <div class="lora-key-body">
                        <a class="lora-key-link" href="https://civitai.com/user/account" target="_blank" rel="noopener">Open Civitai API key settings</a>
                        <label class="lora-key-field">
                            <span>Personal API Key</span>
                            <textarea id="lora-key-input" rows="3" placeholder="paste your civitai api key here..."></textarea>
                        </label>
                        <p class="lora-key-hint">Your key is stored locally in config.json and never shared in workflows.</p>
                    </div>
                    <div class="lora-key-actions">
                        <button class="lora-btn-text" id="lora-key-save">Save Key</button>
                    </div>
                </div>
            </div>

            <div class="lora-info-modal hidden" id="lora-info-modal">
                <div class="lora-info-panel">
                    <div class="lora-panel-header">
                        <div class="lora-panel-copy">
                            <strong id="lora-info-title">LoRA Info</strong>
                            <span id="lora-info-subtitle"></span>
                        </div>
                        <button class="lora-close" id="lora-info-close" title="Close">&#10005;</button>
                    </div>
                    <div class="lora-info-body" id="lora-info-body"></div>
                </div>
            </div>

            <div class="lora-ftr">
                <span class="lora-count" id="lora-count"></span>
                <div class="lora-ftr-gap"></div>
                <button class="lora-btn-text" id="lora-load-more" style="display:none;">Load More</button>
            </div>
        </div>
    `;

    currentOverlay = overlay;
    document.body.appendChild(overlay);

    const grid = overlay.querySelector("#lora-grid");
    const bodyEl = overlay.querySelector(".lora-body");
    const count = overlay.querySelector("#lora-count");
    const search = overlay.querySelector("#lora-search");
    const promptEditor = overlay.querySelector("#lora-prompt-editor");
    const promptStatus = overlay.querySelector("#lora-prompt-status");
    const localTab = overlay.querySelector("#lora-tab-local");
    const remoteTab = overlay.querySelector("#lora-tab-civitai");
    const localSortSelect = overlay.querySelector("#lora-local-sort");
    const closeBtn = overlay.querySelector("#lora-btn-close");
    const fetchAllBtn = overlay.querySelector("#lora-btn-fetchall");
    const loadMoreBtn = overlay.querySelector("#lora-load-more");
    const authStatus = overlay.querySelector("#lora-civitai-auth");
    const connectBtn = overlay.querySelector("#lora-civitai-connect");
    const disconnectBtn = overlay.querySelector("#lora-civitai-disconnect");
    const keyModal = overlay.querySelector("#lora-key-modal");
    const keyClose = overlay.querySelector("#lora-key-close");
    const keyInput = overlay.querySelector("#lora-key-input");
    const keySave = overlay.querySelector("#lora-key-save");
    const infoModal = overlay.querySelector("#lora-info-modal");
    const infoClose = overlay.querySelector("#lora-info-close");
    const infoTitle = overlay.querySelector("#lora-info-title");
    const infoSubtitle = overlay.querySelector("#lora-info-subtitle");
    const infoBody = overlay.querySelector("#lora-info-body");

    const emit = (payload) => {
        try {
            onSelectCallback?.(payload);
        } catch (err) {
            console.error("[LoRA Explorer] Selection callback failed", err);
        }
    };

    const prompt = {
        getText() {
            return String(promptController?.getText?.() || "");
        },
        setText(value) {
            if (promptController?.setText) {
                promptController.setText(String(value || ""));
            } else {
                emit({ type: "prompt-set", value: String(value || "") });
            }
        },
        addTriggers(words) {
            if (promptController?.addTriggers) return promptController.addTriggers(words);
            emit({ type: "add-triggers", triggerWords: normalizeWords(words) });
            return this.getText();
        },
        replaceTriggers(words) {
            if (promptController?.replaceTriggers) return promptController.replaceTriggers(words);
            emit({ type: "replace-triggers", triggerWords: normalizeWords(words) });
            return this.getText();
        },
    };

    function refreshPromptPreview(message = "") {
        if (document.activeElement !== promptEditor) {
            const current = prompt.getText();
            if (promptEditor.value !== current) promptEditor.value = current;
        }
        if (message) {
            promptStatus.textContent = message;
            setTimeout(() => {
                if (promptStatus?.isConnected && promptStatus.textContent === message) {
                    promptStatus.textContent = "editable";
                }
            }, 1200);
        }
    }

    function openKeyModal() {
        keyModal.classList.remove("hidden");
        keyInput.value = "";
        setTimeout(() => keyInput.focus(), 20);
    }

    function closeKeyModal() {
        keyModal.classList.add("hidden");
        keyInput.value = "";
    }

    function closeInfoModal() {
        infoModal.classList.add("hidden");
        infoBody.innerHTML = "";
        currentInfo = null;
    }

    async function refreshApiKeyStatus() {
        try {
            apiStatus = await getApiKeyStatus();
            if (apiStatus.has_key) {
                authStatus.textContent = `API Key: ${apiStatus.masked}`;
                authStatus.classList.add("connected");
                connectBtn.style.display = "none";
                disconnectBtn.style.display = "inline-flex";
            } else {
                authStatus.textContent = "API key not set";
                authStatus.classList.remove("connected");
                connectBtn.style.display = "inline-flex";
                disconnectBtn.style.display = "none";
            }
        } catch (e) {
            console.warn("[LoRA Explorer] Could not fetch API key status", e);
        }
    }

    function upsertLocalEntry(entry) {
        if (!entry?.name) return;
        const index = localLoras.findIndex((item) => item.name === entry.name);
        if (index >= 0) {
            localLoras[index] = { ...localLoras[index], ...entry, preview_version: String(Date.now()) };
        } else {
            localLoras.unshift({ ...entry, preview_version: String(Date.now()) });
        }
    }

    function setActiveTab(tab) {
        activeTab = tab;
        localTab.classList.toggle("active", tab === "local");
        remoteTab.classList.toggle("active", tab === "remote");
        localSortSelect.style.display = tab === "local" ? "inline-flex" : "none";
        fetchAllBtn.style.display = tab === "local" ? "inline-flex" : "none";
        loadMoreBtn.style.display = "none";
        search.placeholder = tab === "local"
            ? "Search local LoRAs..."
            : "Search Civitai Anima LoRAs...";
        search.value = "";
        if (tab === "local") {
            renderLocal();
        } else {
            renderRemote();
        }
        setTimeout(() => search.focus(), 30);
    }

    function renderLocal() {
        const filtered = sortLocalLoras(filterLoras(localLoras, search.value.toLowerCase().trim()), localSort);
        grid.innerHTML = "";
        loadMoreBtn.style.display = "none";

        if (!filtered.length) {
            grid.innerHTML = `<div class="lora-empty"><span>No local LoRAs found.</span></div>`;
            count.textContent = "0 local LoRAs";
            return;
        }

        count.textContent = `${filtered.length} local LoRA${filtered.length !== 1 ? "s" : ""}`;
        const frag = document.createDocumentFragment();
        for (const lora of filtered) {
            frag.appendChild(createCard(lora, {
                onSelect: (name) => {
                    emit({ type: "select-lora", loraName: name });
                    refreshPromptPreview("LoRA selected");
                    closeExplorer();
                },
                onOpenInfo: openLocalInfo,
                onMetadataUpdated: (updated) => upsertLocalEntry({ ...lora, ...updated }),
            }));
        }
        grid.appendChild(frag);
    }

    function renderRemoteGate() {
        grid.innerHTML = `
            <div class="lora-net-gate">
                <strong>Internet Access Required</strong>
                <span>Search Civitai connects to civitai.red to browse Anima LoRAs. Enable it only when you want remote search and downloads.</span>
                <button class="lora-btn-text" id="lora-enable-remote">Enable Civitai Search</button>
            </div>
        `;
        count.textContent = "remote search disabled";
        loadMoreBtn.style.display = "none";
        grid.querySelector("#lora-enable-remote")?.addEventListener("click", async () => {
            remoteEnabled = true;
            sessionStorage.setItem("lora_civitai_remote_enabled", "true");
            await loadRemote(false);
        });
    }

    function updateRemoteCount(extra = "") {
        count.textContent = `${remoteLoras.length} Civitai result${remoteLoras.length !== 1 ? "s" : ""}${extra}`;
        loadMoreBtn.style.display = "none";
    }

    function appendRemoteCards(items = []) {
        if (!items.length) {
            updateRemoteCount(remoteLoading ? " - loading..." : "");
            return;
        }
        remoteRenderToken += 1;
        const renderToken = remoteRenderToken;
        const pageSize = 4;
        const renderChunk = (start = 0) => {
            if (renderToken !== remoteRenderToken) return;
            const frag = document.createDocumentFragment();
            const end = Math.min(start + pageSize, items.length);
            for (let i = start; i < end; i += 1) {
                frag.appendChild(createRemoteCard(items[i], {
                    onOpenInfo: openRemoteInfo,
                    onDownload: downloadRemote,
                }));
            }
            grid.appendChild(frag);
            updateRemoteCount(remoteLoading ? " - loading..." : "");
            if (end < items.length) {
                requestAnimationFrame(() => renderChunk(end));
            }
        };
        renderChunk();
    }

    function renderRemote() {
        remoteRenderToken += 1;
        if (!remoteEnabled) {
            renderRemoteGate();
            return;
        }

        grid.innerHTML = "";
        if (!remoteLoras.length) {
            grid.innerHTML = `<div class="lora-empty"><span>No Civitai LoRAs loaded yet.</span></div>`;
            count.textContent = "0 remote LoRAs";
            loadMoreBtn.style.display = "none";
            return;
        }

        updateRemoteCount();
        appendRemoteCards(remoteLoras);
    }

    async function loadLocal(showLoading = true) {
        if (showLoading) {
            grid.innerHTML = `<div class="lora-empty"><div class="lora-spinner"></div><span>Loading local LoRAs...</span></div>`;
        }
        localLoras = await fetchLoraList();
        if (activeTab === "local") renderLocal();
    }

    async function loadRemote(append = false) {
        if (!remoteEnabled || remoteLoading) return;
        remoteLoading = true;
        let loadedOk = false;
        const previousScrollTop = bodyEl?.scrollTop || 0;
        const previousText = loadMoreBtn.textContent;
        loadMoreBtn.textContent = "Loading...";
        if (!append) {
            remoteCursor = "";
            remoteLoras = [];
            remoteSeen = new Set();
            remoteFailureCount = 0;
            grid.innerHTML = `<div class="lora-empty"><div class="lora-spinner"></div><span>Searching Civitai...</span></div>`;
        }
        try {
            const data = await searchCivitaiLoras({
                query: cleanRemoteQuery(search.value),
                cursor: append ? remoteCursor : "",
                limit: 12,
            });
            loadedOk = true;
            remoteFailureCount = 0;
            if (!append) grid.innerHTML = "";
            const added = mergeUniqueRemote(remoteLoras, data.items || [], remoteSeen);
            remoteCursor = data.next_cursor || "";
            if (!remoteLoras.length) {
                renderRemote();
            } else if (append) {
                appendRemoteCards(added);
                if (bodyEl) bodyEl.scrollTop = previousScrollTop;
            } else {
                appendRemoteCards(remoteLoras);
                if (bodyEl) bodyEl.scrollTop = 0;
            }
        } catch (err) {
            remoteFailureCount += 1;
            const message = `Remote search failed: ${err.message}`;
            if (append && remoteLoras.length) {
                if (bodyEl) bodyEl.scrollTop = previousScrollTop;
                count.textContent = `${remoteLoras.length} Civitai results - ${message}`;
                if (remoteFailureCount <= 2 && remoteCursor) {
                    clearTimeout(remoteRetryTimer);
                    remoteRetryTimer = setTimeout(() => {
                        remoteRetryTimer = null;
                        if (activeTab === "remote" && remoteEnabled && remoteCursor && !remoteLoading) {
                            loadRemote(true);
                        }
                    }, 1200 * remoteFailureCount);
                }
            } else {
                grid.innerHTML = `<div class="lora-empty"><span>${escapeHtml(message)}</span></div>`;
                count.textContent = "search failed";
            }
        } finally {
            remoteLoading = false;
            loadMoreBtn.textContent = previousText || "Load More";
            if (loadedOk) updateRemoteCount();
            requestAnimationFrame(() => {
                if (loadedOk && activeTab === "remote") {
                    const distanceToBottom = bodyEl.scrollHeight - (bodyEl.scrollTop + bodyEl.clientHeight);
                    if (remoteCursor && distanceToBottom < 240) loadRemote(true);
                }
            });
        }
    }

    async function openRemoteInfo(lora) {
        infoTitle.textContent = lora.name || "LoRA Info";
        infoSubtitle.textContent = "Loading reference images and trigger words...";
        infoBody.innerHTML = `<div class="lora-empty"><div class="lora-spinner"></div><span>Loading info...</span></div>`;
        infoModal.classList.remove("hidden");

        try {
            const detail = await fetchCivitaiModel(lora.id, lora.version?.id || "");
            const words = normalizeWords(detail.trigger_words || detail.version?.trigger_words || []);
            const examples = normalizeExamples(detail.reference_examples?.length ? detail.reference_examples : (detail.reference_images || detail.preview_candidates || []));
            const version = detail.version || {};
            const fileSizeText = Number(version.file_size_kb || 0) > 0
                ? `${(Number(version.file_size_kb) / 1024).toFixed(2)} MB`
                : "";
            currentInfo = { type: "remote", item: detail, words, examples };
            infoTitle.textContent = detail.name || lora.name || "LoRA Info";
            infoSubtitle.textContent = [
                version.name ? `Version: ${version.name}` : "",
                version.base_model ? `Base: ${version.base_model}` : "",
                detail.creator ? `Creator: ${detail.creator}` : "",
                version.file_name ? `File: ${version.file_name}` : "",
            ].filter(Boolean).join("  |  ");

            infoBody.innerHTML = `
                <div class="lora-info-tools">
                    <button class="lora-btn-text" data-action="copy">Copy</button>
                    <button class="lora-btn-text" data-action="add">Add to Prompt</button>
                    <button class="lora-btn-text" data-action="replace">Replace Triggers</button>
                    <button class="lora-btn-text" data-action="download">Download & Use</button>
                    ${civitaiUrl(detail) ? `<a class="lora-btn-link" href="${escapeHtml(civitaiUrl(detail))}" target="_blank" rel="noopener">Open Civitai</a>` : ""}
                </div>
                <div class="lora-info-progress hidden">
                    <div class="lora-progress-line">
                        <span class="lora-progress-msg">Ready</span>
                        <span class="lora-progress-size"></span>
                    </div>
                    <div class="lora-progress-track"><span class="lora-progress-fill"></span></div>
                </div>
                <div class="lora-info-details">
                    ${version.name ? `<span><b>Version</b>${escapeHtml(version.name)}</span>` : ""}
                    ${version.base_model ? `<span><b>Base Model</b>${escapeHtml(version.base_model)}</span>` : ""}
                    ${version.file_name ? `<span><b>File</b>${escapeHtml(version.file_name)}</span>` : ""}
                    ${fileSizeText ? `<span><b>Size</b>${escapeHtml(fileSizeText)}</span>` : ""}
                </div>
                <div class="lora-trigger-list">${words.length ? escapeHtml(triggerText(words)) : "No trigger words listed for this LoRA."}</div>
                <div class="lora-ref-grid">${exampleGridHtml(examples)}</div>
            `;
        } catch (err) {
            currentInfo = null;
            infoBody.innerHTML = `<div class="lora-empty"><span>Could not load info: ${escapeHtml(err.message)}</span></div>`;
        }
    }

    async function openLocalInfo(lora, { checkUpdate = false } = {}) {
        infoTitle.textContent = lora.model_name || lora.name || "Local LoRA Info";
        infoSubtitle.textContent = checkUpdate ? "Checking Civitai versions..." : "Loading local metadata...";
        infoBody.innerHTML = `<div class="lora-empty"><div class="lora-spinner"></div><span>Loading info...</span></div>`;
        infoModal.classList.remove("hidden");

        try {
            const meta = await fetchLoraMetadata(lora.name, { checkUpdate });
            const words = wordsFromLocalMeta(meta, lora);
            const previewUrl = meta.preview_url || (meta.has_preview ? getPreviewUrl(lora.name) : "");
            const examples = normalizeExamples(meta.reference_examples?.length ? meta.reference_examples : (previewUrl ? [{ url: `${previewUrl}?t=${Date.now()}` }] : []));
            const latest = meta.latest_version || {};
            const availableVersions = Array.isArray(meta.available_versions) ? meta.available_versions : [];
            upsertLocalEntry({
                ...lora,
                has_preview: !!meta.has_preview || lora.has_preview,
                trigger_words: words,
                update_available: !!meta.update_available,
                latest_version: latest,
            });
            currentInfo = { type: "local", item: { ...lora, meta }, words, examples };
            infoTitle.textContent = meta.civitai_model || lora.model_name || lora.name || "Local LoRA Info";
            infoSubtitle.textContent = [
                meta.civitai_version ? `Installed: ${meta.civitai_version}` : "",
                meta.civitai_base_model || lora.base_model ? `Base: ${meta.civitai_base_model || lora.base_model}` : "",
                meta.file_name ? `File: ${meta.file_name}` : "",
                meta.file_size_mb ? `${meta.file_size_mb} MB` : "",
            ].filter(Boolean).join("  |  ");

            infoBody.innerHTML = `
                <div class="lora-info-tools">
                    <button class="lora-btn-text" data-action="copy">Copy</button>
                    <button class="lora-btn-text" data-action="add">Add to Prompt</button>
                    <button class="lora-btn-text" data-action="replace">Replace Triggers</button>
                    <button class="lora-btn-text" data-action="use-local">Use LoRA</button>
                    <button class="lora-btn-text" data-action="fetch-local">Fetch Metadata</button>
                    ${meta.model_id && remoteEnabled ? `<button class="lora-btn-text" data-action="check-updates">Check Updates</button>` : ""}
                    ${meta.update_available ? `<button class="lora-btn-text lora-update-action" data-action="download-update">Download New Version</button>` : ""}
                    ${availableVersions.length ? `<button class="lora-btn-text" data-action="download-selected-version">Download Selected Version</button>` : ""}
                    ${civitaiUrl(meta) ? `<a class="lora-btn-link" href="${escapeHtml(civitaiUrl(meta))}" target="_blank" rel="noopener">Open Civitai</a>` : ""}
                </div>
                <div class="lora-info-progress hidden">
                    <div class="lora-progress-line">
                        <span class="lora-progress-msg">Ready</span>
                        <span class="lora-progress-size"></span>
                    </div>
                    <div class="lora-progress-track"><span class="lora-progress-fill"></span></div>
                </div>
                ${meta.update_available ? `<div class="lora-update-banner">Update Available: ${escapeHtml(latest.name || latest.file_name || "new version")}</div>` : ""}
                ${versionOptionsHtml(availableVersions, latest.id || meta.version_id || "")}
                <div class="lora-info-details">
                    <span><b>Installed File</b>${escapeHtml(meta.file_name || lora.filename || lora.name)}</span>
                    ${meta.civitai_version ? `<span><b>Installed Version</b>${escapeHtml(meta.civitai_version)}</span>` : ""}
                    ${latest.name ? `<span><b>Latest Version</b>${escapeHtml(latest.name)}</span>` : ""}
                    ${latest.file_name ? `<span><b>Latest File</b>${escapeHtml(latest.file_name)}</span>` : ""}
                    ${latest.published_at || latest.created_at ? `<span><b>Release Date</b>${escapeHtml(latest.published_at || latest.created_at)}</span>` : ""}
                </div>
                <div class="lora-trigger-list">${words.length ? escapeHtml(triggerText(words)) : "No trigger words found yet. Try Fetch Metadata."}</div>
                <div class="lora-ref-grid">${exampleGridHtml(examples)}</div>
            `;
        } catch (err) {
            currentInfo = null;
            infoBody.innerHTML = `<div class="lora-empty"><span>Could not load local info: ${escapeHtml(err.message)}</span></div>`;
        }
    }

    async function downloadRemote(lora, btn, progressHost, versionOverride = "") {
        if (!apiStatus.has_key) {
            openKeyModal();
            buttonFeedback(btn, "API Key Required", "Download & Use", 1800);
            return null;
        }

        const modelId = lora.id || lora.model_id;
        const versionId = versionOverride || lora.version?.id || lora.version_id || "";
        if (!modelId) {
            buttonFeedback(btn, "Missing Model", "Download & Use", 1500);
            return null;
        }

        btn.disabled = true;
        buttonFeedback(btn, "Starting...", "", 0);
        try {
            const started = await startCivitaiDownload({ modelId, versionId });
            const jobId = started.job_id;
            let snapshot = {};
            while (jobId) {
                await sleep(500);
                snapshot = await getCivitaiDownloadProgress(jobId);
                renderProgress(progressHost, snapshot);
                if (snapshot.status === "failed") {
                    throw new Error(snapshot.error || snapshot.message || "Download failed");
                }
                if (snapshot.status === "done") break;
            }

            const result = snapshot.result || {};
            const localEntry = snapshot.local_entry || result.local_entry;
            if (localEntry?.name) {
                upsertLocalEntry(localEntry);
                search.value = "";
                emit({
                    type: "select-lora",
                    loraName: localEntry.name,
                    triggerWords: result.trigger_words || lora.trigger_words || [],
                });
                setActiveTab("local");
                renderLocal();
            } else {
                await loadLocal(false);
            }
            buttonFeedback(btn, "Downloaded", "Download & Use", 1500);
            refreshPromptPreview("LoRA selected");
            return result;
        } catch (err) {
            renderProgress(progressHost, { status: "failed", message: err.message || "Download failed", downloaded_mb: 0 });
            buttonFeedback(btn, "Failed", "Download & Use", 1800);
            if (err?.data?.needs_key || err?.status === 401) openKeyModal();
            return null;
        } finally {
            btn.disabled = false;
        }
    }

    infoBody.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn || !currentInfo) return;
        e.preventDefault();
        const action = btn.dataset.action;
        const words = normalizeWords(currentInfo.words || []);
        const exampleIndex = Number(btn.dataset.exampleIndex);
        const example = Number.isFinite(exampleIndex) ? currentInfo.examples?.[exampleIndex] : null;
        const examplePrompt = String(example?.prompt || "").trim();
        const progressHost = infoBody.querySelector(".lora-info-progress");
        btn.disabled = true;
        try {
            if (action === "copy") {
                const ok = await copyText(triggerText(words));
                buttonFeedback(btn, ok ? "Copied" : "Copy Failed", "Copy");
            } else if (action === "add") {
                prompt.addTriggers(words);
                refreshPromptPreview("Added");
                buttonFeedback(btn, "Added", "Add to Prompt");
            } else if (action === "replace") {
                prompt.replaceTriggers(words);
                refreshPromptPreview("Replaced");
                buttonFeedback(btn, "Replaced", "Replace Triggers");
            } else if (action === "download") {
                await downloadRemote(currentInfo.item, btn, progressHost);
            } else if (action === "copy-example") {
                const ok = await copyText(examplePrompt);
                buttonFeedback(btn, ok ? "Copied" : "No Prompt", "Copy Prompt");
            } else if (action === "add-example") {
                if (examplePrompt) {
                    prompt.setText(prompt.getText().trim() ? `${prompt.getText().trim()}, ${examplePrompt}` : examplePrompt);
                    refreshPromptPreview("Example added");
                    buttonFeedback(btn, "Added", "Add Prompt");
                } else {
                    buttonFeedback(btn, "No Prompt", "Add Prompt");
                }
            } else if (action === "replace-example") {
                if (examplePrompt) {
                    prompt.setText(examplePrompt);
                    refreshPromptPreview("Example replaced");
                    buttonFeedback(btn, "Replaced", "Replace Prompt");
                } else {
                    buttonFeedback(btn, "No Prompt", "Replace Prompt");
                }
            } else if (action === "use-local") {
                emit({ type: "select-lora", loraName: currentInfo.item.name });
                buttonFeedback(btn, "Selected", "Use LoRA");
                closeExplorer();
            } else if (action === "fetch-local") {
                buttonFeedback(btn, "Fetching...", "", 0);
                const res = await triggerCivitaiFetch(currentInfo.item.name);
                const updatedItem = {
                    ...currentInfo.item,
                    ...(res.local_entry || {}),
                    model_name: res.model_name || currentInfo.item.model_name,
                    base_model: res.base_model || currentInfo.item.base_model,
                    trigger_words: res.trigger_words || currentInfo.item.trigger_words,
                    has_preview: !!res.preview_downloaded || !!res.local_entry?.has_preview || currentInfo.item.has_preview,
                };
                upsertLocalEntry(updatedItem);
                buttonFeedback(btn, res.success ? `Fetched ${res.examples_downloaded || 0} images` : "Not Found", "Fetch Metadata", 1600);
                await openLocalInfo(updatedItem);
                if (activeTab === "local") renderLocal();
            } else if (action === "check-updates") {
                buttonFeedback(btn, "Checking...", "", 0);
                await openLocalInfo(currentInfo.item, { checkUpdate: true });
            } else if (action === "download-update") {
                const meta = currentInfo.item.meta || {};
                const versionId = meta.latest_version?.id || "";
                await downloadRemote({ id: meta.model_id, version: { id: versionId } }, btn, progressHost, versionId);
            } else if (action === "download-selected-version") {
                const meta = currentInfo.item.meta || {};
                const versionId = infoBody.querySelector("#lora-version-select")?.value || "";
                await downloadRemote({ id: meta.model_id, version: { id: versionId } }, btn, progressHost, versionId);
            }
        } finally {
            if (btn.isConnected) btn.disabled = false;
        }
    });

    const escHandler = (e) => {
        if (e.key !== "Escape") return;
        if (!keyModal.classList.contains("hidden")) {
            closeKeyModal();
            return;
        }
        if (!infoModal.classList.contains("hidden")) {
            closeInfoModal();
            return;
        }
        closeExplorer();
    };
    document.addEventListener("keydown", escHandler);
    overlay._escHandler = escHandler;
    overlay._cleanup = () => {
        clearTimeout(searchTimer);
        clearTimeout(remoteRetryTimer);
    };

    closeBtn.onclick = closeExplorer;
    overlay.querySelector(".lora-backdrop").onclick = closeExplorer;
    localTab.onclick = () => setActiveTab("local");
    remoteTab.onclick = async () => {
        setActiveTab("remote");
        if (remoteEnabled && !remoteLoras.length) await loadRemote(false);
    };
    connectBtn.onclick = openKeyModal;
    keyClose.onclick = closeKeyModal;
    keyModal.onclick = (e) => { if (e.target === keyModal) closeKeyModal(); };
    infoClose.onclick = closeInfoModal;
    infoModal.onclick = (e) => { if (e.target === infoModal) closeInfoModal(); };

    keySave.onclick = async () => {
        const val = keyInput.value.trim();
        if (!val) return;
        keySave.textContent = "Saving...";
        keySave.disabled = true;
        try {
            const res = await saveApiKey(val);
            if (res.success) {
                closeKeyModal();
                await refreshApiKeyStatus();
            }
        } catch (e) {
            alert("Error saving key: " + e.message);
        }
        keySave.textContent = "Save Key";
        keySave.disabled = false;
    };

    disconnectBtn.onclick = async () => {
        if (!confirm("Remove Civitai API Key?")) return;
        await deleteApiKey();
        await refreshApiKeyStatus();
    };

    promptEditor.addEventListener("input", () => {
        prompt.setText(promptEditor.value);
        promptStatus.textContent = "updated";
    });

    localSortSelect.value = localSort;
    localSortSelect.addEventListener("change", () => {
        localSort = localSortSelect.value || "recent";
        localStorage.setItem("lora_explorer_local_sort", localSort);
        if (activeTab === "local") renderLocal();
    });

    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        if (activeTab === "local") {
            renderLocal();
            return;
        }
        searchTimer = setTimeout(() => loadRemote(false), 420);
    });

    fetchAllBtn.addEventListener("click", async () => {
        await fetchAllPreviews(grid, localLoras, fetchAllBtn);
        await loadLocal(false);
    });

    loadMoreBtn.addEventListener("click", () => loadRemote(true));

    const remoteScrollHandler = () => {
        if (activeTab !== "remote" || !remoteEnabled || remoteLoading || !remoteCursor) return;
        const distanceToBottom = bodyEl.scrollHeight - (bodyEl.scrollTop + bodyEl.clientHeight);
        if (distanceToBottom < 900) {
            loadRemote(true);
        }
    };
    bodyEl?.addEventListener("scroll", remoteScrollHandler, { passive: true });
    overlay._remoteScrollHandler = remoteScrollHandler;

    refreshPromptPreview();
    promptSyncTimer = setInterval(() => refreshPromptPreview(), 350);
    overlay._promptSyncTimer = promptSyncTimer;
    await refreshApiKeyStatus();
    await loadLocal();
}

export function closeExplorer() {
    if (!currentOverlay) return;
    if (currentOverlay._escHandler) {
        document.removeEventListener("keydown", currentOverlay._escHandler);
    }
    if (currentOverlay._promptSyncTimer) {
        clearInterval(currentOverlay._promptSyncTimer);
    }
    if (currentOverlay._remoteScrollHandler) {
        currentOverlay.querySelector(".lora-body")?.removeEventListener("scroll", currentOverlay._remoteScrollHandler);
    }
    currentOverlay._cleanup?.();
    currentOverlay.remove();
    currentOverlay = null;
    onSelectCallback = null;
}
