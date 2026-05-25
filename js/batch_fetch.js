/**
 * LoRA Explorer — Batch Fetch Logic
 * ====================================
 *
 * Handles the "Fetch All Previews" action — iterates through
 * LoRAs without previews and fetches them from CivitAI one by one.
 */

import { triggerCivitaiFetch, getPreviewUrl } from "./explorer_api.js";
import { refreshCardImage } from "./card_component.js";

/**
 * Fetch previews from CivitAI for all LoRAs that don't have one.
 *
 * @param {HTMLElement} grid    The grid container element.
 * @param {Array}       loras   Full LoRA list (mutated in place).
 * @param {HTMLElement} btn     The "Fetch All" button (text is updated).
 */
export async function fetchAllPreviews(grid, loras, btn) {
    const missing = loras.filter((l) => !l.has_preview);
    if (missing.length === 0) {
        btn.textContent = "✅ All have previews!";
        return;
    }

    btn.textContent = `⏳ 0/${missing.length}…`;
    btn.style.pointerEvents = "none";

    let done = 0;
    for (const lora of missing) {
        try {
            const result = await triggerCivitaiFetch(lora.name);
            if (result.success && result.preview_downloaded) {
                lora.has_preview = true;
                if (result.model_name) lora.model_name = result.model_name;
                if (result.base_model) lora.base_model = result.base_model;
                if (result.trigger_words) lora.trigger_words = result.trigger_words;

                // Update the card in the DOM
                const card = grid.querySelector(
                    `[data-lora-name="${CSS.escape(lora.name)}"]`
                );
                if (card) {
                    refreshCardImage(card, lora);
                }
            }
        } catch (err) {
            console.warn(`[LoRA Explorer] Failed to fetch ${lora.name}:`, err);
        }
        done++;
        btn.textContent = `⏳ ${done}/${missing.length}…`;
    }

    btn.textContent = `✅ Done (${done})`;
    btn.style.pointerEvents = "auto";
}
