import { CSSProperties } from "react";

export type PhotoStackImage = string | { src: string; alt?: string };

const defaultPhotos: PhotoStackImage[] = [
  "/images/vcs/components/three-model-back.png",
  "/images/vcs/components/three-model-middle.png",
  "/images/vcs/components/three-model-front.png",
];

function photoSource(photo: PhotoStackImage) {
  return typeof photo === "string" ? { src: photo, alt: "" } : photo;
}

export function PhotoStack({
  images = defaultPhotos,
  layout = "fan",
  className = "",
  style,
  cardStyle,
  ariaLabel,
}: {
  images?: PhotoStackImage[];
  layout?: "fan" | "diagonal";
  className?: string;
  style?: CSSProperties;
  cardStyle?: CSSProperties;
  ariaLabel?: string;
}) {
  if (images.length < 3 || images.length > 5) {
    throw new RangeError(`PhotoStack expects 3 to 5 images; received ${images.length}.`);
  }

  const count = images.length;
  const cardWidth = layout === "diagonal" ? 42 - (count - 3) * 2 : 50 - (count - 3) * 6;
  const firstLeft = layout === "diagonal" ? 2 : 4;
  const lastLeft = 96 - cardWidth;
  const leftStep = (lastLeft - firstLeft) / (count - 1);
  const middleIndex = (count - 1) / 2;
  const diagonalLastTop = 96 - cardWidth * 1.8;

  return (
    <div
      className={`photo-stack ${className}`.trim()}
      data-layout={layout}
      data-photo-stack
      style={style}
      role="img"
      aria-label={ariaLabel ?? `Stack of ${count} portraits`}
    >
      {images.map((photo, index) => {
        const { src, alt = "" } = photoSource(photo);
        const distanceFromMiddle = Math.abs(index - middleIndex);
        const rotation = layout === "diagonal"
          ? 0
          : -15 + (23 * index) / (count - 1);
        const top = layout === "diagonal"
          ? 2 + ((diagonalLastTop - 2) * index) / (count - 1)
          : 9 + distanceFromMiddle * (count === 3 ? 3 : 2);

        return (
          <div
            key={`${src}-${index}`}
            className="photo-stack-card"
            style={{
              ...cardStyle,
              left: `${firstLeft + leftStep * index}%`,
              top: `${top}%`,
              width: `${cardWidth}%`,
              aspectRatio: "2 / 3",
              zIndex: index + 1,
              transform: rotation === 0 ? "none" : `rotate(${rotation}deg)`,
            }}
          >
            <img src={src} alt={alt} />
          </div>
        );
      })}
      <style jsx>{`
        .photo-stack { position: relative; display: block; width: 100%; aspect-ratio: 1.2 / 1; }
        .photo-stack-card { position: absolute; aspect-ratio: 2 / 3; overflow: hidden; box-shadow: 0 12px 28px rgb(0 0 0 / 24%); }
        .photo-stack-card img { display: block; width: 100%; height: 100%; object-fit: cover; }
        :global(.lineage-node) > .photo-stack { height: 100%; width: auto; aspect-ratio: 1.2 / 1; }
        :global(.production-lineage-compact) > .photo-stack { width: 100%; height: 100%; aspect-ratio: 1.2 / 1; }
      `}</style>
    </div>
  );
}
