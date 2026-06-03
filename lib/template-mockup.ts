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
  /** Counter-clockwise rotation of the design IN DEGREES around the print
   *  area's center. Use when a hanging shirt is slightly tilted in the
   *  photo. Range: -45..45 in the UI but the renderer accepts any value. */
  rotation: number;
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
  /** When true, the design picks up the blank's fabric folds/shading.
   *  We extract a luminance map from the blank's print area and multiply
   *  it onto the design before compositing. Adds the "wrinkled fabric
   *  sticks to the print" look. Default ON because most photos have
   *  some natural fabric texture. */
  fabricShading: boolean;
  createdAt: number;
}

export const DEFAULT_PRINT_AREA: PrintArea = {
  x: 0.32,
  y: 0.26,
  w: 0.36,
  h: 0.33,
  rotation: 0,
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
 * Pipeline (when all options are on):
 *   1. Draw the blank onto a square output canvas.
 *   2. Render the design onto a SCRATCH canvas at the print box's size,
 *      respecting the design's aspect ratio.
 *   3. If `fabricShading`, extract the blank's luminance map from the
 *      print area and multiply it onto the scratch canvas — this is what
 *      makes the print pick up wrinkles, folds and shading on the shirt
 *      (it's a poor man's displacement map but works surprisingly well).
 *   4. Rotate the scratch canvas around its center by `printArea.rotation`
 *      (degrees) and stamp it onto the output canvas with the chosen
 *      multiply blend strength.
 *   5. Export as JPEG.
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

  // Print area in output-canvas pixel coords
  const px = template.printArea.x * outputSize;
  const py = template.printArea.y * outputSize;
  const pw = template.printArea.w * outputSize;
  const ph = template.printArea.h * outputSize;

  // Contain-fit the design inside the print box (preserve aspect ratio).
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
  const dox = (pw - dw) / 2;
  const doy = (ph - dh) / 2;

  // Step 2 — build a SCRATCH canvas the size of the print box and paint the
  // design onto it. We do all the fabric-shading and rotation work on the
  // scratch canvas so the final composite onto the output is one clean
  // stamp.
  const scratch = document.createElement("canvas");
  scratch.width = Math.max(1, Math.round(pw));
  scratch.height = Math.max(1, Math.round(ph));
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("Scratch canvas context alınamadı.");

  sctx.drawImage(design, dox, doy, dw, dh);

  // Step 3 — fabric shading: extract a luminance map of the blank inside the
  // print box and MULTIPLY it onto the scratch canvas. This stamps the
  // fabric's folds/wrinkles/shadows onto the design so it doesn't look
  // pasted on. We only do this when the template opted in.
  if (template.fabricShading) {
    // Make a third canvas the same size as the scratch, draw the blank
    // image cropped to the print area into it, then convert to a high-
    // contrast grayscale that emphasises shadows under highlights.
    const shading = document.createElement("canvas");
    shading.width = scratch.width;
    shading.height = scratch.height;
    const shctx = shading.getContext("2d");
    if (shctx) {
      // The blank may not be square — figure out the cover-fit transform
      // so we sample the SAME pixels that landed inside the print area
      // on the output canvas.
      const blankCover = computeCoverRect(
        blank.naturalWidth,
        blank.naturalHeight,
        outputSize,
        outputSize
      );
      // Convert (px, py, pw, ph) in output pixels → source pixels in blank
      const sx = blankCover.sx + (px / outputSize) * blankCover.sw;
      const sy = blankCover.sy + (py / outputSize) * blankCover.sh;
      const sw = (pw / outputSize) * blankCover.sw;
      const sh = (ph / outputSize) * blankCover.sh;
      shctx.drawImage(blank, sx, sy, sw, sh, 0, 0, shading.width, shading.height);

      // Convert to a centered-around-1.0 luminance map: dark pixels darken
      // the design (folds), bright pixels brighten it slightly. We push
      // mid-gray (the dominant shirt color) towards white so the design
      // isn't tinted by the shirt color. Then a touch of contrast so the
      // wrinkles read more clearly.
      const imageData = shctx.getImageData(
        0,
        0,
        shading.width,
        shading.height
      );
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Luminance via Rec. 709 coefficients.
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        // Normalize 0..255 → 0..1, push mid-gray toward 1.0, apply contrast.
        let v = lum / 255;
        // Push the curve so values >= 0.5 land near 1 (don't tint the print
        // with the shirt's base color), but values < 0.5 stay dark (folds).
        v = v < 0.5 ? v * 1.4 : 0.7 + v * 0.3;
        // Mild contrast around 0.85 mid-point.
        v = clamp((v - 0.85) * 1.3 + 0.85, 0, 1);
        const out = Math.round(v * 255);
        data[i] = out;
        data[i + 1] = out;
        data[i + 2] = out;
        // Keep alpha
      }
      shctx.putImageData(imageData, 0, 0);

      // Multiply the shading map onto the design. Only inside the design's
      // contain-fit rectangle so we don't shade the empty padding area.
      sctx.save();
      sctx.globalCompositeOperation = "multiply";
      sctx.drawImage(shading, 0, 0);
      sctx.restore();

      // The multiply pass affects transparent pixels too (turning them
      // gray). Mask back to the original design alpha by drawing the
      // design once more with destination-in to clip the shaded result
      // to the design's silhouette.
      sctx.save();
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(design, dox, doy, dw, dh);
      sctx.restore();
    }
  }

  // Step 4 — stamp the scratch canvas onto the output canvas at the print
  // area's center, rotated by `printArea.rotation` degrees, using the
  // chosen multiply blend strength.
  const angle = ((template.printArea.rotation || 0) * Math.PI) / 180;
  const cx = px + pw / 2;
  const cy = py + ph / 2;

  if (template.blendStrength > 0) {
    // Two-pass: multiply for the fabric pickup + source-over for the
    // remaining opacity. Gives the user a smooth 0..1 dial.
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = template.blendStrength;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(scratch, -pw / 2, -ph / 2);
    ctx.restore();

    if (template.blendStrength < 1) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1 - template.blendStrength;
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.drawImage(scratch, -pw / 2, -ph / 2);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(scratch, -pw / 2, -ph / 2);
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Sister of drawCover() — returns the source-rect a cover-fit would use,
 *  so other passes (fabric shading) can sample the SAME pixels. */
function computeCoverRect(
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number
) {
  const ir = imgW / imgH;
  const cr = canvasW / canvasH;
  let sx = 0,
    sy = 0,
    sw = imgW,
    sh = imgH;
  if (ir > cr) {
    sw = imgH * cr;
    sx = (imgW - sw) / 2;
  } else if (ir < cr) {
    sh = imgW / cr;
    sy = (imgH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
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
