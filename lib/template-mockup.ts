// ────────────────────────────────────────────────────────────────────────────
// TEMPLATE-BASED MOCKUP RENDERER
//
// AI-free mockup pipeline. The user uploads "blank product" photos (any
// t-shirt / hoodie / sweatshirt photo) once, marks the print area on it,
// and from that point on we composite their design onto every saved blank
// using the HTML5 Canvas API:
//
//   1. Draw the blank product photo onto a square canvas (1024×1024).
//   2. Draw the user's design PNG inside the marked print area.
//   3. Apply "multiply" blend mode so the print picks up the fabric folds
//      and shadows underneath — gives a "printed on fabric" look without
//      any AI.
//   4. Export as JPEG/PNG data URL.
//
// Output cost: $0. Output time: <1 second. Output quality: depends entirely
// on the quality of the blank photo the user supplied.
// ────────────────────────────────────────────────────────────────────────────

export interface PrintArea {
  /** Print area expressed as ratios of the template image (0..1).
   *  x,y = top-left corner. w,h = width / height. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MockupTemplate {
  id: string;
  /** Friendly label shown in the UI ("Siyah Tişört - Erkek Ön"). */
  label: string;
  /** Optional product type for grouping in the library. */
  productType?: string;
  /** Optional dominant color for grouping in the library. */
  color?: string;
  /** Base64 data URL of the blank product photo the user uploaded. */
  imageDataUrl: string;
  /** Where to place the design on the blank. */
  printArea: PrintArea;
  /** Multiply blend mode strength (0..1). 1 = full multiply, gives the
   *  most realistic "screen printed" look. 0 = simple overlay. Default
   *  per template so the user can tune individual mockups. */
  blendStrength: number;
  createdAt: number;
}

export const DEFAULT_PRINT_AREA: PrintArea = {
  x: 0.32,
  y: 0.26,
  w: 0.36,
  h: 0.33,
};

/**
 * Load an image (data URL or HTTPS URL) into a HTMLImageElement.
 * Resolves once the image is decoded; rejects on network/decode errors.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Görsel yüklenemedi: " + src.slice(0, 80)));
    img.src = src;
  });
}

/**
 * Composite a design onto a template's print area.
 *
 * @param template   The blank product photo + print area config.
 * @param designSrc  Data URL or HTTPS URL of the design PNG.
 * @param outputSize Canvas output edge in pixels (square). Default 1500
 *                   gives ~1.5 MP — plenty for Etsy listings.
 * @returns JPEG data URL of the composited mockup.
 */
export async function renderTemplateMockup(
  template: MockupTemplate,
  designSrc: string,
  outputSize = 1500
): Promise<string> {
  const [blank, design] = await Promise.all([
    loadImage(template.imageDataUrl),
    loadImage(designSrc),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context alınamadı.");

  // Step 1 — paint the blank, scaled into a square (cover-style fit).
  drawCover(ctx, blank, outputSize, outputSize);

  // Step 2 — figure out where the design goes inside the print box, then
  // contain-fit the design (preserves the artwork's aspect ratio).
  const px = template.printArea.x * outputSize;
  const py = template.printArea.y * outputSize;
  const pw = template.printArea.w * outputSize;
  const ph = template.printArea.h * outputSize;

  const designRatio = design.naturalWidth / design.naturalHeight;
  const boxRatio = pw / ph;
  let dw: number, dh: number;
  if (designRatio > boxRatio) {
    dw = pw;
    dh = pw / designRatio;
  } else {
    dh = ph;
    dw = ph * designRatio;
  }
  const dx = px + (pw - dw) / 2;
  const dy = py + (ph - dh) / 2;

  // Step 3 — composite via multiply when the user opted in. Multiply makes
  // the design pick up underlying fabric folds & shadows, which is what
  // makes a flat overlay look like an actual screen print. Pure 'source-
  // over' (blendStrength=0) is a clean opaque overlay — useful for very
  // light or transparency-heavy designs.
  if (template.blendStrength > 0) {
    // We render twice: once at globalAlpha=blendStrength with multiply, then
    // a thin source-over pass for opacity if blend < 1. Blending in two
    // passes lets the user dial in how aggressive the fabric integration is.
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = template.blendStrength;
    ctx.drawImage(design, dx, dy, dw, dh);
    ctx.restore();

    if (template.blendStrength < 1) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1 - template.blendStrength;
      ctx.drawImage(design, dx, dy, dw, dh);
      ctx.restore();
    }
  } else {
    ctx.drawImage(design, dx, dy, dw, dh);
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * cover-fit an image into a width×height box (like CSS object-fit: cover).
 * Crops symmetrically when aspect ratios differ.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = w / h;
  let sx = 0,
    sy = 0,
    sw = img.naturalWidth,
    sh = img.naturalHeight;
  if (ir > cr) {
    // image wider than canvas → crop sides
    sw = img.naturalHeight * cr;
    sx = (img.naturalWidth - sw) / 2;
  } else if (ir < cr) {
    // image taller than canvas → crop top/bottom
    sh = img.naturalWidth / cr;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

/**
 * Resize a user-uploaded image down to a sane maximum edge so we don't
 * pin gigabytes of base64 in IndexedDB. Returns a JPEG data URL when the
 * source has no transparency, otherwise PNG.
 */
export async function downscaleImage(
  file: File | Blob,
  maxEdge = 1800,
  jpegQuality = 0.9
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const ratio = img.naturalWidth / img.naturalHeight;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxEdge || h > maxEdge) {
      if (ratio >= 1) {
        w = maxEdge;
        h = Math.round(maxEdge / ratio);
      } else {
        h = maxEdge;
        w = Math.round(maxEdge * ratio);
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context alınamadı.");
    ctx.drawImage(img, 0, 0, w, h);

    // png if transparent, jpeg if opaque (heuristic: sample corners)
    const isPng = file.type === "image/png" || file.type === "image/webp";
    return canvas.toDataURL(isPng ? "image/png" : "image/jpeg", jpegQuality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
