import { getPreviewUrl, triggerCivitaiFetch } from "./explorer_api.js";

function stripExtension(filename = "") {
    return String(filename || "").replace(/\.[^.]+$/, "");
}

function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function triggerPreview(words = []) {
    if (!Array.isArray(words) || !words.length) return "";
    return words.slice(0, 4).join(", ") + (words.length > 4 ? "..." : "");
}

function civitaiUrl(lora = {}) {
    const id = lora.id || lora.model_id;
    return String(lora.model_url || (id ? `https://civitai.com/models/${id}` : "")).trim();
}

function imageCandidates(value) {
    const source = Array.isArray(value) ? value : [value];
    const seen = new Set();
    const result = [];
    for (const item of source) {
        const clean = String(item || "").trim();
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        result.push(clean);
    }
    return result;
}

function setImage(imgArea, sources, init = "L") {
    const candidates = imageCandidates(sources);
    imgArea.dataset.init = init;
    imgArea.querySelector("img")?.remove();
    imgArea.classList.toggle("lora-no-img", !candidates.length);
    if (!candidates.length) return;

    const tryCandidate = (index) => {
        const src = candidates[index];
        if (!src) {
            imgArea.classList.add("lora-no-img");
            return;
        }
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.fetchPriority = "low";
        img.onload = () => imgArea.classList.remove("lora-no-img");
        img.onerror = () => {
            img.remove();
            tryCandidate(index + 1);
        };
        img.src = src;
        imgArea.querySelector("img")?.remove();
        imgArea.prepend(img);
    };

    tryCandidate(0);
}

function progressShell() {
    const shell = document.createElement("div");
    shell.className = "lora-card-progress hidden";
    shell.innerHTML = `
        <div class="lora-progress-line">
            <span class="lora-progress-msg">Ready</span>
            <span class="lora-progress-size"></span>
        </div>
        <div class="lora-progress-track"><span class="lora-progress-fill"></span></div>
    `;
    return shell;
}

export function renderProgress(host, data = {}) {
    if (!host) return;
    host.classList.remove("hidden");
    const fill = host.querySelector(".lora-progress-fill");
    const msg = host.querySelector(".lora-progress-msg");
    const size = host.querySelector(".lora-progress-size");
    const total = Number(data.total_mb || 0);
    const downloaded = Number(data.downloaded_mb || 0);
    const percent = Number(data.percent);
    const hasPercent = Number.isFinite(percent) && total > 0;

    host.classList.toggle("indeterminate", !hasPercent && String(data.status || "") === "downloading");
    if (fill) fill.style.width = hasPercent ? `${Math.max(0, Math.min(100, percent))}%` : "42%";
    if (msg) msg.textContent = String(data.message || data.status || "Working");
    if (size) {
        size.textContent = total
            ? `${downloaded.toFixed(1)} MB / ${total.toFixed(1)} MB${hasPercent ? ` (${percent.toFixed(1)}%)` : ""}`
            : downloaded > 0
                ? `${downloaded.toFixed(1)} MB`
                : "";
    }
}

export function createCard(lora, callbacks = {}) {
    const legacySelect = typeof callbacks === "function" ? callbacks : null;
    const onSelect = legacySelect || callbacks.onSelect;
    const onOpenInfo = callbacks.onOpenInfo;
    const onMetadataUpdated = callbacks.onMetadataUpdated;

    const card = document.createElement("div");
    card.className = "lora-card";
    if (lora.update_available) card.classList.add("has-update");
    card.dataset.loraName = lora.name;

    const imgArea = document.createElement("div");
    imgArea.className = "lora-card-img";
    setImage(imgArea, lora.has_preview ? [`${getPreviewUrl(lora.name)}?t=${encodeURIComponent(lora.preview_version || "")}`] : [], "L");

    const overlay = document.createElement("div");
    overlay.className = "lora-card-overlay";

    const pickBtn = document.createElement("button");
    pickBtn.className = "lora-btn";
    pickBtn.textContent = "Use LoRA";
    pickBtn.onclick = (e) => {
        e.stopPropagation();
        onSelect?.(lora.name, lora);
    };

    const infoBtn = document.createElement("button");
    infoBtn.className = "lora-btn lora-btn-secondary";
    infoBtn.textContent = "Open Info";
    infoBtn.onclick = (e) => {
        e.stopPropagation();
        onOpenInfo?.(lora);
    };

    const fetchBtn = document.createElement("button");
    fetchBtn.className = "lora-btn lora-btn-secondary";
    fetchBtn.textContent = "Fetch Metadata";
    if (lora.model_id && lora.has_preview) fetchBtn.style.display = "none";
    fetchBtn.onclick = async (e) => {
        e.stopPropagation();
        fetchBtn.textContent = "Fetching...";
        fetchBtn.disabled = true;
        fetchBtn.classList.add("fetching");
        try {
            const res = await triggerCivitaiFetch(lora.name);
            if (res.success) {
                lora.has_preview = !!res.preview_downloaded || lora.has_preview;
                lora.preview_version = String(Date.now());
                if (lora.has_preview) refreshCardImage(card, lora);
                if (res.model_name) lora.model_name = res.model_name;
                if (res.base_model) lora.base_model = res.base_model;
                if (res.trigger_words) lora.trigger_words = res.trigger_words;
                updateMeta(card, lora);
                fetchBtn.textContent = "Fetched";
                if (lora.has_preview) fetchBtn.style.display = "none";
                onMetadataUpdated?.(lora, res);
            } else {
                fetchBtn.textContent = "Not Found";
            }
        } catch (err) {
            fetchBtn.textContent = "Error";
            console.error(err);
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.classList.remove("fetching");
        }
    };

    overlay.append(pickBtn, infoBtn, fetchBtn);
    imgArea.appendChild(overlay);

    const meta = document.createElement("div");
    meta.className = "lora-card-meta";
    meta.innerHTML = `
        ${lora.update_available ? `<span class="lora-update-badge">Update Available</span>` : ""}
        <span class="lora-card-title" title="${escapeHtml(lora.name)}">${escapeHtml(lora.model_name || stripExtension(lora.filename))}</span>
        <span class="lora-card-subtitle">${escapeHtml(lora.base_model || lora.filename || "")}</span>
        ${lora.trigger_words?.length ? `<span class="lora-card-triggers">${escapeHtml(triggerPreview(lora.trigger_words))}</span>` : ""}
        <button class="lora-open-info" type="button">Open Info</button>
    `;
    meta.querySelector(".lora-open-info")?.addEventListener("click", (e) => {
        e.stopPropagation();
        onOpenInfo?.(lora);
    });

    card.append(imgArea, meta);
    card.addEventListener("click", () => onSelect?.(lora.name, lora));
    return card;
}

export function createRemoteCard(lora, callbacks = {}) {
    const card = document.createElement("div");
    card.className = "lora-card lora-card-remote";
    card.dataset.modelId = lora.id;
    card.dataset.versionId = lora.version?.id || "";

    const imgArea = document.createElement("div");
    imgArea.className = "lora-card-img lora-card-img-contain";
    setImage(imgArea, lora.preview_candidates?.length ? lora.preview_candidates : lora.preview_url, (lora.name || "L")[0] || "L");

    const overlay = document.createElement("div");
    overlay.className = "lora-card-overlay";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "lora-btn";
    downloadBtn.textContent = "Download & Use";

    const infoBtn = document.createElement("button");
    infoBtn.className = "lora-btn lora-btn-secondary";
    infoBtn.textContent = "Open Info";
    infoBtn.onclick = (e) => {
        e.stopPropagation();
        callbacks.onOpenInfo?.(lora);
    };

    overlay.append(downloadBtn, infoBtn);
    imgArea.appendChild(overlay);

    const words = Array.isArray(lora.trigger_words) ? lora.trigger_words : [];
    const creator = lora.creator ? `by ${lora.creator}` : "";
    const meta = document.createElement("div");
    meta.className = "lora-card-meta";
    meta.innerHTML = `
        <span class="lora-card-title" title="${escapeHtml(lora.name)}">${escapeHtml(lora.name)}</span>
        <span class="lora-card-subtitle">${escapeHtml([lora.base_model, creator].filter(Boolean).join(" - "))}</span>
        ${words.length ? `<span class="lora-card-triggers">${escapeHtml(triggerPreview(words))}</span>` : ""}
        ${civitaiUrl(lora) ? `<a class="lora-card-link" href="${escapeHtml(civitaiUrl(lora))}" target="_blank" rel="noopener">Open Civitai</a>` : ""}
        <button class="lora-open-info" type="button">Open Info</button>
    `;
    meta.querySelector(".lora-card-link")?.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    const progress = progressShell();
    meta.appendChild(progress);
    meta.querySelector(".lora-open-info")?.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.onOpenInfo?.(lora);
    });

    downloadBtn.onclick = async (e) => {
        e.stopPropagation();
        downloadBtn.disabled = true;
        downloadBtn.textContent = "Starting...";
        downloadBtn.classList.add("fetching");
        try {
            await callbacks.onDownload?.(lora, downloadBtn, progress);
        } finally {
            downloadBtn.classList.remove("fetching");
            if (downloadBtn.isConnected && downloadBtn.textContent === "Starting...") {
                downloadBtn.textContent = "Download & Use";
            }
            downloadBtn.disabled = false;
        }
    };

    card.append(imgArea, meta);
    card.addEventListener("click", () => callbacks.onOpenInfo?.(lora));
    return card;
}

function updateMeta(card, lora) {
    const nameEl = card.querySelector(".lora-card-title");
    const baseEl = card.querySelector(".lora-card-subtitle");
    const triggerEl = card.querySelector(".lora-card-triggers");
    if (nameEl) nameEl.textContent = lora.model_name || stripExtension(lora.filename);
    if (baseEl) baseEl.textContent = lora.base_model || lora.filename || "";
    if (triggerEl) triggerEl.textContent = triggerPreview(lora.trigger_words || []);
}

export function refreshCardImage(card, lora) {
    const imgArea = card.querySelector(".lora-card-img");
    if (!imgArea) return;
    setImage(imgArea, `${getPreviewUrl(lora.name)}?t=${Date.now()}`, "L");
    lora.has_preview = true;
}
