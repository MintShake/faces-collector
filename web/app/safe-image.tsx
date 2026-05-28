"use client";

import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
};

export function SafeImage({
  fallbackSrc = "/miniapp/icon.png",
  src,
  className,
  ...props
}: SafeImageProps) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);

  const shouldDeferRemote = useMemo(
    () => typeof src === "string" && /^https?:\/\//.test(src),
    [src]
  );
  const isUsingFallback = failed || (shouldDeferRemote && !mounted);
  const activeSrc = isUsingFallback ? fallbackSrc : src;
  const imageClassName = isUsingFallback
    ? [className, "imageFallback"].filter(Boolean).join(" ")
    : className;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <img
      {...props}
      className={imageClassName}
      src={activeSrc}
      onError={(event) => {
        props.onError?.(event);

        if (!failed) {
          setFailed(true);
        }
      }}
    />
  );
}
