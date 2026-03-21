import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkPath: string;
  linkLabel: string | null;
  displayOrder: number;
};

type BannerCarouselProps = {
  banners: Banner[];
};

const AUTO_ADVANCE_MS = 5000;

const BannerCarousel = ({ banners }: BannerCarouselProps) => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = banners.length;

  const goTo = useCallback((index: number) => {
    setCurrent(((index % count) + count) % count);
  }, [count]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Auto-advance
  useEffect(() => {
    if (count < 2 || paused) return;
    timerRef.current = setInterval(next, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [count, paused, next]);

  if (count === 0) return null;

  const banner = banners[current];

  return (
    <div
      className="banner-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="banner-slide"
        role="button"
        tabIndex={0}
        aria-label={`Go to ${banner.linkPath}`}
        onClick={() => navigate(banner.linkPath)}
        onKeyDown={(e) => e.key === "Enter" && navigate(banner.linkPath)}
        style={{ backgroundImage: `url(${banner.imageUrl})` }}
      >
        <div className="banner-overlay">
          <div className="banner-text">
            <h2 className="banner-title">{banner.title}</h2>
            {banner.subtitle && <p className="banner-subtitle">{banner.subtitle}</p>}
            {banner.linkLabel && (
              <span className="banner-cta">{banner.linkLabel} →</span>
            )}
          </div>
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className="banner-arrow banner-arrow-prev"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous banner"
          >
            ‹
          </button>
          <button
            type="button"
            className="banner-arrow banner-arrow-next"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next banner"
          >
            ›
          </button>
          <div className="banner-dots" role="tablist" aria-label="Banner navigation">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={`Banner ${i + 1}: ${b.title}`}
                className={`banner-dot${i === current ? " active" : ""}`}
                onClick={(e) => { e.stopPropagation(); goTo(i); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BannerCarousel;
