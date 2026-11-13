"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import { ImageOff } from "lucide-react";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

export function PropertyGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  if (!images.length) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-[var(--re-line)] bg-[var(--re-surface-2)] text-[var(--re-muted)]">
        <ImageOff className="size-10" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)]">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation
        pagination={{ clickable: true }}
        spaceBetween={0}
        slidesPerView={1}
        className="property-gallery aspect-[16/10] w-full"
      >
        {images.map((src, i) => (
          <SwiperSlide key={src + i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${alt} — photo ${i + 1}`}
              className="h-full w-full object-cover"
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
