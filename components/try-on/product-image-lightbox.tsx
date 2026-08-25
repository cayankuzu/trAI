"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { CatalogImage } from "@/lib/product-catalog";

type ProductImageLightboxProps = {
  image: Pick<CatalogImage, "src" | "alt"> & Partial<Pick<CatalogImage, "view">> | null;
  onClose: () => void;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function ProductImageLightbox({
  image,
  onClose,
  eyebrow = "ÜRÜN GÖRSELİ",
  title,
  description,
}: ProductImageLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!image) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      className="product-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="product-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-lightbox-title"
        aria-describedby="product-lightbox-description"
      >
        <header>
          <div>
            <small>{eyebrow}</small>
            <h2 id="product-lightbox-title">{title ?? (image.view ? `${image.view} görünüm` : "Büyük görsel")}</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Büyük görseli kapat">
            ×
          </button>
        </header>
        <div className="product-lightbox-image">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 720px) 92vw, 720px"
            unoptimized={image.src.startsWith("http")}
          />
        </div>
        <p id="product-lightbox-description">{description ?? image.alt}</p>
      </section>
    </div>
  );
}
