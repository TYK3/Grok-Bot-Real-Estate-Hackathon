import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PropertyImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-[var(--re-surface-2)]", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cn("h-full w-full object-cover", imgClassName)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--re-muted)]">
          <ImageOff className="size-8" />
        </div>
      )}
    </div>
  );
}
