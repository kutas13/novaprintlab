"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  hint?: string;
  disabled?: boolean;
}

export function Dropzone({
  accept = "image/png,image/jpeg",
  multiple = true,
  onFiles,
  className,
  hint = "PNG veya JPEG — sürükle bırak ya da tıklayarak seç",
  disabled,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const arr = Array.from(list).filter((f) => /image\/(png|jpe?g)/i.test(f.type));
      if (arr.length) onFiles(arr);
    },
    [onFiles]
  );

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
      className={cn(
        "relative cursor-pointer rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 p-10 text-center transition-all hover:border-blue-500/60 hover:bg-slate-900/70",
        active && "border-blue-500 bg-blue-500/5",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 ring-1 ring-blue-500/30 flex items-center justify-center">
          <UploadCloud className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-200">
            Tasarım dosyalarını bırak ya da seç
          </p>
          <p className="text-xs text-slate-500 mt-1">{hint}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
        disabled={disabled}
      />
    </div>
  );
}
