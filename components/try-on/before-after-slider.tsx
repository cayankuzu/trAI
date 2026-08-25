"use client";

import Image from "next/image";
import { useState } from "react";

type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  splitPercent: number;
  onSplitChange: (value: number) => void;
  onBeforeInvalid?: () => void;
  onAfterInvalid?: () => void;
};

const BLACK_CHANNEL_MAX = 8;
const BLACK_PIXEL_RATIO = 0.995;
const MAX_MEAN_LUMA = 4;

export function clampSplitPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function getAfterClipPath(splitPercent: number) {
  return `inset(0 0 0 ${clampSplitPercent(splitPercent)}%)`;
}

export function isAlmostEntirelyBlackRgba(pixels: Uint8ClampedArray) {
  const pixelCount = Math.floor(pixels.length / 4);
  if (pixelCount === 0) return false;

  let blackPixels = 0;
  let lumaTotal = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const alpha = (pixels[offset + 3] ?? 0) / 255;
    const red = Math.round((pixels[offset] ?? 0) * alpha + 255 * (1 - alpha));
    const green = Math.round((pixels[offset + 1] ?? 0) * alpha + 255 * (1 - alpha));
    const blue = Math.round((pixels[offset + 2] ?? 0) * alpha + 255 * (1 - alpha));
    if (Math.max(red, green, blue) <= BLACK_CHANNEL_MAX) blackPixels += 1;
    lumaTotal += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  }

  return blackPixels / pixelCount >= BLACK_PIXEL_RATIO
    && lumaTotal / pixelCount <= MAX_MEAN_LUMA;
}

function loadedImageIsBlack(image: HTMLImageElement) {
  if (image.naturalWidth < 1 || image.naturalHeight < 1) return false;
  const maximumEdge = 64;
  const scale = Math.min(1, maximumEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;

  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return isAlmostEntirelyBlackRgba(context.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    // A remote host without CORS can make the canvas unreadable. The server-side
    // generated-image guard remains authoritative in that case.
    return false;
  }
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  splitPercent,
  onSplitChange,
  onBeforeInvalid,
  onAfterInvalid,
}: BeforeAfterSliderProps) {
  const safeSplit = clampSplitPercent(splitPercent);
  const beforeIsLocal = beforeUrl.startsWith("blob:");
  const [failedBeforeUrl, setFailedBeforeUrl] = useState("");
  const [failedAfterUrl, setFailedAfterUrl] = useState("");
  const beforeUnavailable = failedBeforeUrl === beforeUrl;
  const afterUnavailable = failedAfterUrl === afterUrl;

  return (
    <figure className="comparison-slider">
      <div className="comparison-slider-stage">
        {beforeUnavailable ? (
          <div className="comparison-image-fallback" role="status">{beforeLabel} görseli açılamadı.</div>
        ) : (
          <Image
            src={beforeUrl}
            alt={beforeLabel}
            fill
            sizes="(max-width: 900px) 100vw, 52vw"
            loading="eager"
            unoptimized={beforeIsLocal || beforeUrl.startsWith("http")}
            crossOrigin="anonymous"
            onError={() => setFailedBeforeUrl(beforeUrl)}
            onLoad={(event) => {
              if (!loadedImageIsBlack(event.currentTarget)) return;
              setFailedBeforeUrl(beforeUrl);
              onBeforeInvalid?.();
            }}
          />
        )}
        <div className="comparison-slider-after" style={{ clipPath: getAfterClipPath(safeSplit) }}>
          {afterUnavailable ? (
            <div className="comparison-image-fallback" role="status">{afterLabel} görseli açılamadı.</div>
          ) : (
            <Image
              src={afterUrl}
              alt={afterLabel}
              fill
              sizes="(max-width: 900px) 100vw, 52vw"
              loading="eager"
              unoptimized
              crossOrigin="anonymous"
              onError={() => setFailedAfterUrl(afterUrl)}
              onLoad={(event) => {
                if (!loadedImageIsBlack(event.currentTarget)) return;
                setFailedAfterUrl(afterUrl);
                onAfterInvalid?.();
              }}
            />
          )}
        </div>
        <span className="comparison-label is-left">{beforeLabel}</span>
        <span className="comparison-label is-right">{afterLabel}</span>
        <span className="comparison-divider" style={{ left: `${safeSplit}%` }} aria-hidden>
          <span>↔</span>
        </span>
        <input
          className="comparison-range"
          type="range"
          min="0"
          max="100"
          value={safeSplit}
          aria-label={`${beforeLabel} ve ${afterLabel} karşılaştırma çizgisi`}
          aria-valuetext={`${beforeLabel} %${Math.round(safeSplit)}, ${afterLabel} %${Math.round(100 - safeSplit)}`}
          onChange={(event) => onSplitChange(Number(event.target.value))}
        />
      </div>
    </figure>
  );
}
