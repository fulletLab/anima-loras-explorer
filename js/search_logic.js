/**
 * LoRA Explorer — Search Logic
 * ==============================
 *
 * Filtering logic for the LoRA list based on search queries.
 */

/**
 * Filter a LoRA list by a search query.
 * Matches against name, filename, model_name, base_model, and trigger_words.
 *
 * @param {Array}  loras  Full LoRA list from the API.
 * @param {string} query  Lowercase search query.
 * @returns {Array}  Filtered list.
 */
export function filterLoras(loras, query) {
    if (!query) return loras;

    return loras.filter((lora) => {
        const searchable = [
            lora.name,
            lora.filename,
            lora.model_name,
            lora.base_model,
            ...(lora.trigger_words || []),
        ]
            .join(" ")
            .toLowerCase();
        return searchable.includes(query);
    });
}
