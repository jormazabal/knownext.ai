import { useEffect, useRef, useState } from "react";

/** Measure the mounted surface, including when its content is still loading. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => setSize(previous =>
      previous.width === width && previous.height === height ? previous : { width, height });
    const measure = () => {
      const style = getComputedStyle(element);
      update(Math.max(0, element.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0")),
        Math.max(0, element.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0")));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) update(Math.max(0, rect.width), Math.max(0, rect.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
