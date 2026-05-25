/**
 * LoRA Explorer — Canvas Drawing Utilities
 * ==========================================
 *
 * Pure canvas-drawing functions used by the node's onDrawForeground.
 * Each function takes a CanvasRenderingContext2D and draws one element.
 */

import {
    PREVIEW_SIZE,
    PADDING,
    BORDER_RADIUS,
    META_FONT,
    META_LINE_HEIGHT,
    META_LABEL_COLOR,
    META_VALUE_COLOR,
    BG_PANEL,
} from "./constants.js";
import { filterDisplayMeta } from "./metadata_helpers.js";

/**
 * Draw a rounded-rectangle path (does NOT fill or stroke).
 */
export function traceRoundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Draw a preview image with rounded corners and a subtle border.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img         Loaded image element.
 * @param {number} x                    Left edge.
 * @param {number} y                    Top edge.
 * @param {number} contentWidth         Available width.
 * @returns {number}  The drawn image height.
 */
export function drawPreviewImage(ctx, img, x, y, contentWidth) {
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let drawW = Math.min(contentWidth, PREVIEW_SIZE);
    let drawH = drawW / aspectRatio;

    if (drawH > PREVIEW_SIZE) {
        drawH = PREVIEW_SIZE;
        drawW = drawH * aspectRatio;
    }

    const imgX = x + (contentWidth - drawW) / 2;

    // Rounded clip
    ctx.save();
    ctx.beginPath();
    traceRoundRect(ctx, imgX, y, drawW, drawH, BORDER_RADIUS);
    ctx.clip();
    ctx.drawImage(img, imgX, y, drawW, drawH);
    ctx.restore();

    // Subtle border
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    traceRoundRect(ctx, imgX, y, drawW, drawH, BORDER_RADIUS);
    ctx.stroke();

    return drawH;
}

/**
 * Draw the metadata panel (key-value rows on a dark background).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} meta         Raw metadata dict.
 * @param {number} x            Left edge.
 * @param {number} y            Top edge.
 * @param {number} contentWidth Available width.
 * @returns {number}  The drawn panel height (0 if nothing drawn).
 */
export function drawMetadataPanel(ctx, meta, x, y, contentWidth) {
    const metaRows = filterDisplayMeta(meta);
    if (metaRows.length === 0) return 0;

    const panelH = metaRows.length * META_LINE_HEIGHT + PADDING * 2;

    // Background
    ctx.fillStyle = BG_PANEL;
    ctx.beginPath();
    traceRoundRect(ctx, x, y, contentWidth, panelH, BORDER_RADIUS);
    ctx.fill();

    ctx.font = META_FONT;
    ctx.textBaseline = "top";

    let textY = y + PADDING;
    for (const row of metaRows) {
        // Label
        ctx.fillStyle = META_LABEL_COLOR;
        ctx.fillText(row.label + ":", x + PADDING, textY);

        // Value (truncated)
        ctx.fillStyle = META_VALUE_COLOR;
        const labelWidth = ctx.measureText(row.label + ": ").width;
        const maxValWidth = contentWidth - PADDING * 2 - labelWidth;
        let displayVal = row.value;
        while (ctx.measureText(displayVal).width > maxValWidth && displayVal.length > 3) {
            displayVal = displayVal.slice(0, -4) + "…";
        }
        ctx.fillText(displayVal, x + PADDING + labelWidth, textY);

        textY += META_LINE_HEIGHT;
    }

    return panelH;
}
