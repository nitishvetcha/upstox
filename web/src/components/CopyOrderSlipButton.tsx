"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyOrderSlipButton({ slipText }: { slipText: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(slipText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = slipText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-700 hover:text-white"
      title="Copy order slip to clipboard for quick terminal entry"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-zinc-400" />}
      <span>{copied ? "Copied Slip!" : "Copy Order Slip"}</span>
    </button>
  );
}
