/**
 * LoRA Explorer — ComfyUI Extension Entry Point
 * ================================================
 *
 * Registers the extension with ComfyUI.
 * Delegates all logic to specialized modules:
 *
 *   constants.js       → design tokens
 *   canvas_utils.js    → preview/metadata canvas drawing
 *   metadata_helpers.js → metadata formatting
 *   explorer_modal.js  → fullscreen explorer UI
 *
 * This file only contains the extension hooks:
 *   - onNodeCreated  → adds "Browse LoRAs" button
 *   - onExecuted     → loads preview image from backend
 *   - onDrawForeground → renders preview + metadata on canvas
 */

import { app } from "../../scripts/app.js";
import { NODE_TYPE, EXTENSION_NAME, PREVIEW_SIZE, PADDING, BUTTON_HEIGHT } from "./constants.js";
import { drawPreviewImage, drawMetadataPanel } from "./canvas_utils.js";
import { filterDisplayMeta } from "./metadata_helpers.js";
import { openExplorer } from "./explorer_modal.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildImageUrl(imageInfo) {
    const params = new URLSearchParams({
        filename: imageInfo.filename,
        subfolder: imageInfo.subfolder || "",
        type: imageInfo.type || "temp",
    });
    return `/view?${params.toString()}`;
}

function getWidgetBottomY(node) {
    if (!node.widgets || node.widgets.length === 0) return 70;
    const last = node.widgets[node.widgets.length - 1];
    return last.last_y != null
        ? last.last_y + (last.computedHeight || 20)
        : 70 + node.widgets.length * 24;
}

function recomputeNodeSize(node) {
    let height = getWidgetBottomY(node) + PADDING;

    if (node._loraPreviewImages?.length > 0) {
        height += PREVIEW_SIZE + PADDING;
    }

    const minWidth = PREVIEW_SIZE + PADDING * 2 + 20;
    node.size[0] = Math.max(node.size[0], minWidth);
    node.size[1] = Math.max(node.size[1], height);
}

function normalizeTriggerWords(words) {
    const source = Array.isArray(words)
        ? words
        : String(words || "").split(",");
    const seen = new Set();
    const result = [];

    for (const word of source) {
        const clean = String(word || "").trim().replace(/^,+|,+$/g, "");
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        result.push(clean);
    }

    return result.join(", ");
}

function findPromptWidgets() {
    const nodes = app.graph?._nodes || [];
    const matches = [];

    for (const graphNode of nodes) {
        for (const widget of graphNode.widgets || []) {
            const name = String(widget?.name || "").toLowerCase();
            const type = String(widget?.type || "").toLowerCase();
            const value = widget?.value;
            const looksLikePrompt =
                name === "text" ||
                name === "prompt" ||
                name === "string" ||
                type === "customtext" ||
                (type === "string" && (widget.inputEl || typeof value === "string"));

            if (looksLikePrompt && typeof value === "string") {
                matches.push({ node: graphNode, widget });
            }
        }
    }

    return matches;
}

let lastPromptTarget = null;

function targetStillValid(target) {
    if (!target?.node || !target?.widget) return false;
    return (app.graph?._nodes || []).includes(target.node) && (target.node.widgets || []).includes(target.widget);
}

function graphNodeById(id) {
    return (app.graph?._nodes || []).find((node) => String(node?.id) === String(id)) || null;
}

function linkById(id) {
    const links = app.graph?.links;
    if (!links || id == null) return null;
    return links[id] || links[String(id)] || null;
}

function linkTargetId(link) {
    return link?.target_id ?? link?.targetId ?? (Array.isArray(link) ? link[3] : null);
}

function linkTargetSlot(link) {
    return link?.target_slot ?? link?.targetSlot ?? (Array.isArray(link) ? link[4] : null);
}

function outputLinks(node) {
    const links = [];
    for (const output of node?.outputs || []) {
        for (const linkId of output?.links || []) {
            const link = linkById(linkId);
            if (link) links.push(link);
        }
    }
    return links;
}

function downstreamPromptRole(node, depth = 0, seen = new Set()) {
    if (!node || depth > 4 || seen.has(node.id)) return "";
    seen.add(node.id);

    for (const link of outputLinks(node)) {
        const target = graphNodeById(linkTargetId(link));
        const inputName = String(target?.inputs?.[linkTargetSlot(link)]?.name || "").toLowerCase();
        if (/\bnegative\b/.test(inputName)) return "negative";
        if (/\bpositive\b/.test(inputName)) return "positive";
    }

    for (const link of outputLinks(node)) {
        const target = graphNodeById(linkTargetId(link));
        const role = downstreamPromptRole(target, depth + 1, seen);
        if (role) return role;
    }

    return "";
}

function promptEntryRole(entry) {
    const nodeText = `${entry.node?.title || ""} ${entry.node?.type || ""} ${entry.node?.comfyClass || ""}`.toLowerCase();
    if (/\bnegative\b/.test(nodeText)) return "negative";
    if (/\bpositive\b/.test(nodeText)) return "positive";
    return downstreamPromptRole(entry.node);
}

function promptTargetScore(entry, preferredNode = null) {
    const selectedNodes = Object.values(app.canvas?.selected_nodes || {});
    const nodeText = `${entry.node?.title || ""} ${entry.node?.type || ""} ${entry.node?.comfyClass || ""}`.toLowerCase();
    const widgetName = String(entry.widget?.name || "").toLowerCase();
    const role = promptEntryRole(entry);
    let score = 0;
    if (entry.node === preferredNode) score += 100;
    if (selectedNodes.includes(entry.node)) score += 60;
    if (entry.widget?.inputEl && document.activeElement === entry.widget.inputEl) score += 80;
    if (role === "positive") score += 700;
    if (role === "negative") score -= 900;
    if (/positive|prompt/.test(nodeText)) score += 30;
    if (/negative/.test(nodeText)) score -= 300;
    if (widgetName === "text" || widgetName === "prompt") score += 10;
    return score;
}

function bestPromptTarget(matches, preferredNode = null) {
    return matches
        .map((entry) => ({ entry, score: promptTargetScore(entry, preferredNode) }))
        .sort((a, b) => b.score - a.score)[0]?.entry || matches[0];
}

function hasPositiveTarget(matches) {
    return matches.some((entry) => promptEntryRole(entry) === "positive");
}

function isNegativeTarget(entry) {
    return promptEntryRole(entry) === "negative";
}

function setWidgetText(node, widget, value) {
    widget.value = value;

    if (widget.inputEl) {
        widget.inputEl.value = value;
        widget.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        widget.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function appendTriggerGroup(currentValue, triggerGroup) {
    const current = String(currentValue || "").trim();
    if (!current) return triggerGroup;
    if (current.endsWith(",")) return `${current} ${triggerGroup}`;
    return `${current}, ${triggerGroup}`;
}

function findPromptTarget(preferredNode = null) {
    const matches = findPromptWidgets();
    if (!matches.length) return null;
    const hasPositive = hasPositiveTarget(matches);
    const active = matches.find((entry) => entry.widget?.inputEl && document.activeElement === entry.widget.inputEl);
    if (active && (!hasPositive || !isNegativeTarget(active))) {
        lastPromptTarget = active;
        return active;
    }
    const selectedNodes = Object.values(app.canvas?.selected_nodes || {});
    const selected = matches.find((entry) => selectedNodes.includes(entry.node));
    if (selected && (!hasPositive || !isNegativeTarget(selected)) && (!targetStillValid(lastPromptTarget) || !selectedNodes.includes(lastPromptTarget.node))) {
        lastPromptTarget = selected;
        return selected;
    }
    if (targetStillValid(lastPromptTarget) && (!hasPositive || !isNegativeTarget(lastPromptTarget))) return lastPromptTarget;
    const best = bestPromptTarget(matches, preferredNode);
    lastPromptTarget = best;
    return best;
}

function applyTriggerWords(words, mode = "add", preferredNode = null) {
    const triggerGroup = normalizeTriggerWords(words);
    if (!triggerGroup) return "";

    const target = findPromptTarget(preferredNode);
    if (!target) {
        navigator.clipboard?.writeText?.(triggerGroup).catch(() => {});
        alert("No prompt text widget found. Trigger words were copied instead.");
        return triggerGroup;
    }

    const { node, widget } = target;
    const current = String(widget.value || "");
    const previousGroup = String(widget._loraExplorerLastTriggerGroup || "").trim();
    let nextValue = "";

    if (mode === "replace" && previousGroup && current.includes(previousGroup)) {
        nextValue = current.replace(previousGroup, triggerGroup);
    } else {
        nextValue = appendTriggerGroup(current, triggerGroup);
    }

    widget._loraExplorerLastTriggerGroup = triggerGroup;
    setWidgetText(node, widget, nextValue);
    lastPromptTarget = target;
    return nextValue;
}

function setLoraWidget(node, loraName) {
    const cleanName = String(loraName || "").trim();
    if (!cleanName) return;

    const widget = node.widgets?.find((item) => item.name === "lora_name");
    if (!widget) return;

    const values = widget.options?.values;
    if (Array.isArray(values) && !values.includes(cleanName)) {
        values.push(cleanName);
    }

    widget.value = cleanName;
    widget.callback?.(cleanName);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function createPromptController(preferredNode = null) {
    return {
        getText() {
            const target = findPromptTarget(preferredNode);
            return target ? String(target.widget.value || "") : "";
        },
        setText(value) {
            const target = findPromptTarget(preferredNode);
            if (!target) return "";
            setWidgetText(target.node, target.widget, String(value || ""));
            lastPromptTarget = target;
            return String(value || "");
        },
        addTriggers(words) {
            return applyTriggerWords(words, "add", preferredNode);
        },
        replaceTriggers(words) {
            return applyTriggerWords(words, "replace", preferredNode);
        },
    };
}

function handleExplorerAction(node, action, promptController = null) {
    const payload = typeof action === "string"
        ? { type: "select-lora", loraName: action }
        : (action || {});

    if (payload.type === "select-lora") {
        setLoraWidget(node, payload.loraName || payload.name);
        return;
    }

    if (payload.type === "add-triggers") {
        if (promptController?.addTriggers) promptController.addTriggers(payload.triggerWords);
        else applyTriggerWords(payload.triggerWords, "add");
        return;
    }

    if (payload.type === "replace-triggers") {
        if (promptController?.replaceTriggers) promptController.replaceTriggers(payload.triggerWords);
        else applyTriggerWords(payload.triggerWords, "replace");
        return;
    }

    if (payload.type === "prompt-set") {
        promptController?.setText?.(payload.value);
    }
}

/* ------------------------------------------------------------------ */
/*  Extension                                                          */
/* ------------------------------------------------------------------ */

app.registerExtension({
    name: EXTENSION_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== NODE_TYPE) return;

        // --- onNodeCreated: add Browse button ---
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);
            const node = this;

            const browseBtn = node.addWidget("button", "🔍 Browse LoRAs", null, () => {
                const promptController = createPromptController(node);
                openExplorer((action) => handleExplorerAction(node, action, promptController), promptController);
            });
            browseBtn.computedHeight = BUTTON_HEIGHT;
        };

        // --- onExecuted: receive preview image (ComfyUI native image handler will draw it) ---
        const origExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            origExecuted?.apply(this, arguments);
            // ComfyUI automatically displays message.images natively as an inner UI element.
            // We just let it do its job.
            recomputeNodeSize(this);
            this.setDirtyCanvas(true, true);
        };
    },
});
