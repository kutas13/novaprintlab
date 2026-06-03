// ────────────────────────────────────────────────────────────────────────────
// MOCKUP BULK DOWNLOAD HELPERS
//
// Wraps the "fetch every mockup URL → zip the blobs → trigger a browser
// download" workflow that both the Taha workshop page and the Drafts page
// need. Doing it in one place means the filename convention, error UX
// and JSZip lazy-import are consistent everywhere.
//
// Why JSZip and not a server endpoint:
//   • The mockup URLs are already public Supabase Storage links — we'd
//     gain nothing by proxying them through our Next.js server.
//   • Doing it client-side keeps egress on Supabase's free tier instead
//     of Vercel function bandwidth.
//   • JSZip is ~95KB gzipped and is dynamically imported on-click, so
//     the rest of the dashboard never pays for it.
// ────────────────────────────────────────────────────────────────────────────

import type { Design } from "@/lib/types";

/** Sanitize a string for use in a filename: ASCII-ish, no slashes. */
function slug(s: string): string {
  return (s || "design")
    .toLowerCase()
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    || "design";
}

/** Guess a file extension. Prefer the URL's own extension; fall back to
 *  the content-type, then to .jpg as a last resort because that's what
 *  every mockup pipeline outputs. */
function guessExt(url: string, contentType: string): string {
  const urlExt = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (urlExt && /^(jpe?g|png|webp|gif)$/i.test(urlExt)) {
    return urlExt.toLowerCase() === "jpeg" ? "jpg" : urlExt.toLowerCase();
  }
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  if (/gif/i.test(contentType)) return "gif";
  return "jpg";
}

/** Fetch every mockup attached to `design`, pack them into a ZIP, and
 *  trigger a browser download. Throws if `design` has no mockups, or if
 *  any single mockup fails to fetch (we'd rather hard-fail than ship a
 *  partial ZIP the user might mistake for a complete batch). */
export async function downloadMockupsZip(design: Design): Promise<number> {
  if (!design.mockups || design.mockups.length === 0) {
    throw new Error("Bu tasarımda indirilebilecek mockup yok.");
  }

  // Lazy-load JSZip so non-download routes never pull it.
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const base = slug(design.name);

  // Fetch all in parallel — Supabase Storage is fine with concurrent
  // public reads and this brings download time down from N×latency to
  // 1×latency for typical 6-mockup batches.
  const results = await Promise.all(
    design.mockups.map(async (m, idx) => {
      const res = await fetch(m.url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          `Mockup ${idx + 1} indirilemedi (HTTP ${res.status}).`
        );
      }
      const blob = await res.blob();
      const ext = guessExt(m.url, blob.type);
      // Pad index so OS sort order matches upload order (01, 02, …, 12).
      const paddedIdx = String(idx + 1).padStart(2, "0");
      return { name: `${base}-${paddedIdx}.${ext}`, blob };
    })
  );

  results.forEach(({ name, blob }) => zip.file(name, blob));

  const zipBlob = await zip.generateAsync({
    type: "blob",
    // Mockups are already JPEG/PNG (already compressed) — store-only is
    // faster and the file size barely changes.
    compression: "STORE",
  });

  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${base}-mockups.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before we revoke.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return results.length;
}
