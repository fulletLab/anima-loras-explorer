/**
 * LoRA Explorer — Design Tokens & Constants
 * ===========================================
 *
 * Single source of truth for all visual constants.
 * Change values here to restyle the entire explorer.
 */

/* ---- Layout ---- */
export const PREVIEW_SIZE       = 384;
export const CARD_MIN_WIDTH     = 220;
export const PADDING            = 10;
export const BORDER_RADIUS      = 12;
export const BUTTON_HEIGHT      = 34;

/* ---- Typography ---- */
export const FONT_FAMILY        = "'Inter', 'Segoe UI', system-ui, sans-serif";
export const META_FONT          = `13px ${FONT_FAMILY}`;
export const META_LINE_HEIGHT   = 18;

/* ---- Colors ---- */
export const META_LABEL_COLOR   = "#aaa";
export const META_VALUE_COLOR   = "#eee";
export const BG_PANEL           = "rgba(30, 30, 42, 0.85)";
export const BG_OVERLAY         = "rgba(0, 0, 0, 0.88)";
export const BG_HEADER          = "rgba(22, 22, 34, 0.95)";
export const BG_CARD            = "rgba(30, 30, 46, 0.8)";
export const BG_INPUT           = "rgba(255,255,255,0.05)";
export const ACCENT_PRIMARY     = "#8b5cf6";
export const ACCENT_SECONDARY   = "#06b6d4";
export const ACCENT_DANGER      = "#f87171";
export const ACCENT_TAG_BG      = "rgba(139,92,246,0.15)";
export const ACCENT_TAG_TEXT    = "#a78bfa";
export const BORDER_SUBTLE      = "rgba(255,255,255,0.06)";
export const BORDER_LIGHT       = "rgba(255,255,255,0.1)";
export const TEXT_PRIMARY       = "#e0e0e0";
export const TEXT_MUTED         = "#888";
export const TEXT_PLACEHOLDER   = "rgba(255,255,255,0.3)";

/* ---- Node type identifier ---- */
export const NODE_TYPE          = "LoraExplorerLoader";
export const EXTENSION_NAME     = "LoraExplorer.Preview";

/* ---- Metadata display priority ---- */
export const META_DISPLAY_KEYS  = [
    "civitai_model",
    "civitai_version",
    "civitai_base_model",
    "trigger_words",
    "modelspec.title",
    "modelspec.trigger_phrase",
    "ss_base_model_version",
    "ss_network_module",
    "ss_network_dim",
    "ss_network_alpha",
    "file_name",
    "file_size_mb",
    "sha256",
];
