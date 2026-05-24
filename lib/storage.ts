"use client";

import { STORAGE_BUCKET, supabase } from "./supabase";

export type StorageFolder = "originals" | "mockups";

function extOf(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^(png|jpg|jpeg|webp)$/i.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  return "png";
}

export async function uploadImage(
  file: File,
  folder: StorageFolder
): Promise<string> {
  const ext = extOf(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || `image/${ext}`,
    });

  if (error) throw error;
  return path;
}

export async function removeImage(path: string | null | undefined) {
  if (!path) return;
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  } catch {}
}
