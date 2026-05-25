/**
 * LoRA Explorer — Metadata Helpers
 * =================================
 *
 * Functions for formatting and filtering metadata for display.
 */

import { META_DISPLAY_KEYS } from "./constants.js";

/**
 * Pretty-print a metadata key for display.
 *   "ss_base_model_version" → "Base Model Version"
 *   "civitai_model"         → "Civitai Model"
 *
 * @param {string} key  Raw metadata key.
 * @returns {string}  Human-readable label.
 */
export function prettifyKey(key) {
    return key
        .replace(/^ss_/, "")
        .replace(/^modelspec\./, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Filter and sort metadata into an ordered array of {label, value} rows.
 *
 * @param {Object} meta  Raw metadata dict from the backend.
 * @returns {Array<{label: string, value: string}>}  Ordered display rows.
 */
export function filterDisplayMeta(meta) {
    if (!meta) return [];

    const rows = [];
    for (const key of META_DISPLAY_KEYS) {
        if (meta[key] !== undefined && meta[key] !== "") {
            let val = meta[key];
            if (key === "file_size_mb") val = `${val} MB`;
            if (key === "sha256") val = String(val).substring(0, 16) + "…";
            rows.push({ label: prettifyKey(key), value: String(val) });
        }
    }
    return rows;
}
