"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useState } from "react";

type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

export function AddAppButton({
  user,
  variant = "secondary",
  label = "Add app"
}: {
  user?: MiniAppUser;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "saved" | "busy">("idle");

  async function addApp() {
    setStatus("busy");

    try {
      if (!(await sdk.isInMiniApp())) {
        setStatus("idle");
        return;
      }

      const context = await sdk.context;
      const result = await sdk.actions.addMiniApp();
      const activeUser = user ?? context.user;

      await fetch("/api/users", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...activeUser,
          notificationDetails: result.notificationDetails ?? context.client.notificationDetails
        })
      });

      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <button className={variant === "primary" ? "primaryButton" : "shareButton"} type="button" onClick={addApp} disabled={status === "busy"}>
      {status === "saved" ? "Notifications on" : status === "busy" ? "Adding" : label}
    </button>
  );
}
