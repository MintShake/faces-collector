import type { HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "w3m-button": HTMLAttributes<HTMLElement> & { size?: "sm" | "md"; label?: string; loadingLabel?: string };
    }
  }
}
