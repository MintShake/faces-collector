"use client";

import { useState, type ImgHTMLAttributes } from "react";

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
};

export function SafeImage({
  fallbackSrc = "/miniapp/icon.png",
  src,
  className,
  ...props
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const activeSrc = failed ? fallbackSrc : src;
  const imageClassName = failed
    ? [className, "imageFallback"].filter(Boolean).join(" ")
    : className;

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
