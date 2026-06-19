"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useEffect, useRef, useState } from "react";

export function ShareButton({
  fid,
  count,
  variant = "secondary",
  label,
  text
}: {
  fid?: number;
  count?: number;
  variant?: "primary" | "secondary" | "compact";
  label?: string;
  text?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inMiniApp, setInMiniApp] = useState(false);
  const [canShareNative, setCanShareNative] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sdk.isInMiniApp().then(setInMiniApp).catch(() => setInMiniApp(false));
    setCanShareNative(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  function buildShare() {
    const path = fid ? `/fid/${fid}` : "/";
    const url = new URL(path, window.location.origin).toString();
    const shareText = text ?? (fid
      ? `${count?.toLocaleString() ?? "A"} profile pic${count === 1 ? "" : "s"} saved on Faces — every version of this person, in one place.`
      : "Faces saves profile pic history across the social web.");

    return { url, shareText };
  }

  async function handleClick() {
    if (inMiniApp) {
      const { url, shareText } = buildShare();
      await sdk.actions.composeCast({ text: shareText, embeds: [url] });
      return;
    }

    setOpen((value) => !value);
  }

  function shareToFarcaster() {
    const { url, shareText } = buildShare();
    window.open(
      `https://farcaster.xyz/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(url)}`,
      "_blank",
      "noreferrer"
    );
    setOpen(false);
  }

  function shareToX() {
    const { url, shareText } = buildShare();
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noreferrer"
    );
    setOpen(false);
  }

  async function shareNative() {
    const { url, shareText } = buildShare();
    try {
      await navigator.share({ title: "Faces", text: shareText, url });
    } catch {
      // User cancelled the native share sheet.
    }
    setOpen(false);
  }

  async function copyLink() {
    const { url } = buildShare();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    setOpen(false);
  }

  return (
    <div className="shareWrap" ref={wrapRef}>
      <button className={`shareButton ${variant}`} type="button" onClick={handleClick}>
        {copied ? "Copied" : label ?? "Share"}
      </button>
      {open && (
        <div className="shareMenu" role="menu">
          <button type="button" role="menuitem" onClick={shareToFarcaster}>Share to Farcaster</button>
          <button type="button" role="menuitem" onClick={shareToX}>Share to X</button>
          {canShareNative && (
            <button type="button" role="menuitem" onClick={shareNative}>More options…</button>
          )}
          <button type="button" role="menuitem" onClick={copyLink}>Copy link</button>
        </div>
      )}
    </div>
  );
}
