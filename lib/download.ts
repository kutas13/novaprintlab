"use client";

export async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return true;
  } catch (e) {
    console.error("[downloadUrl]", e);
    return false;
  }
}

export function safeFilename(name: string, fallback = "file"): string {
  const base = (name || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || fallback;
}

export function extFromUrl(url: string, fallback = "png"): string {
  const m = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return fallback;
}
