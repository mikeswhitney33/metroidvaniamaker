import { useEffect, useState } from 'react';

const cache = new Map<string, HTMLImageElement>();

/** A loaded image element for a data URL, or undefined until it has loaded. */
export function useImage(src: string | undefined): HTMLImageElement | undefined {
  const [, setTick] = useState(0);
  const img = src ? cache.get(src) : undefined;
  useEffect(() => {
    if (!src || cache.get(src)?.complete) return;
    let el = cache.get(src);
    if (!el) {
      el = new Image();
      el.src = src;
      cache.set(src, el);
    }
    const done = () => setTick((t) => t + 1);
    el.addEventListener('load', done);
    return () => el.removeEventListener('load', done);
  }, [src]);
  return img?.complete && img.naturalWidth ? img : undefined;
}
