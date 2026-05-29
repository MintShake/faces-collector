"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HideButton({ fid }: { fid: number }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);

  function hide() {
    const hiddenFids = readHiddenFids();
    hiddenFids.add(String(fid));
    window.localStorage.setItem("faces.hiddenFids", JSON.stringify([...hiddenFids]));
    window.dispatchEvent(new Event("faces:hidden-fids-changed"));
    setHidden(true);
    router.push("/browse");
  }

  return (
    <button className="textButton danger" type="button" onClick={hide} disabled={hidden}>
      {hidden ? "Hidden" : "Hide locally"}
    </button>
  );
}

function readHiddenFids() {
  try {
    const value = window.localStorage.getItem("faces.hiddenFids");
    const parsed = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}
