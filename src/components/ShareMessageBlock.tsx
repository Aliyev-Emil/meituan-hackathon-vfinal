"use client";

import { useState } from "react";

interface ShareMessageBlockProps {
  message: string;
}

export default function ShareMessageBlock({ message }: ShareMessageBlockProps) {
  const [copied, setCopied] = useState(false);

  if (!message.trim()) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <p style={{ flex: 1, margin: 0, fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-line" }}>
        {message}
      </p>
      <button
        type="button"
        className="btn-secondary"
        onClick={handleCopy}
        style={{ flexShrink: 0, fontSize: 13, padding: "8px 14px" }}
        aria-label="Copy share message"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
