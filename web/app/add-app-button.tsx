"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useEffect, useState } from "react";

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
  const [status, setStatus] = useState<"checking" | "hidden" | "idle" | "saved" | "busy">("checking");

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        if (!(await sdk.isInMiniApp())) {
          if (!cancelled) setStatus("hidden");
          return;
        }

        const context = await sdk.context;
        if (cancelled) return;

        setStatus(context.client.added && context.client.notificationDetails ? "hidden" : "idle");
      } catch {
        if (!cancelled) setStatus("hidden");
      }
    }

    function onMiniAppAdded() {
      setStatus("saved");
    }

    function onNotificationsEnabled() {
      setStatus("hidden");
    }

    function onNotificationsDisabled() {
      setStatus("idle");
    }

    void loadState();
    sdk.on("miniAppAdded", onMiniAppAdded);
    sdk.on("notificationsEnabled", onNotificationsEnabled);
    sdk.on("notificationsDisabled", onNotificationsDisabled);

    return () => {
      cancelled = true;
      sdk.off("miniAppAdded", onMiniAppAdded);
      sdk.off("notificationsEnabled", onNotificationsEnabled);
      sdk.off("notificationsDisabled", onNotificationsDisabled);
    };
  }, []);

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

      setStatus(result.notificationDetails ?? context.client.notificationDetails ? "hidden" : "saved");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "checking" || status === "hidden") {
    return null;
  }

  return (
    <button className={variant === "primary" ? "primaryButton" : "shareButton"} type="button" onClick={addApp} disabled={status === "busy"}>
      {status === "saved" ? "Enable notifications" : status === "busy" ? "Adding" : label}
    </button>
  );
}
