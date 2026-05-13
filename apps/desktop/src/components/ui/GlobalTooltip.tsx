import { useEffect, useLayoutEffect, useRef, useState } from "react";

type TooltipState = {
  text: string;
  preferredPlacement: "top" | "bottom";
  anchorLeft: number;
  anchorTop: number;
  anchorBottom: number;
};

type TooltipLayout = {
  left: number;
  top: number;
  arrowLeft: number;
  placement: "top" | "bottom";
};

const tooltipOffset = 8;
const viewportPadding = 8;
const arrowPadding = 12;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function GlobalTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [layout, setLayout] = useState<TooltipLayout | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const width = tooltipRect.width;
    const height = tooltipRect.height;
    const anchorX = tooltip.anchorLeft;
    const canShowTop = tooltip.anchorTop - tooltipOffset - height >= viewportPadding;
    const canShowBottom = tooltip.anchorBottom + tooltipOffset + height <= window.innerHeight - viewportPadding;
    let placement = tooltip.preferredPlacement;

    if (placement === "top" && !canShowTop && canShowBottom) placement = "bottom";
    if (placement === "bottom" && !canShowBottom && canShowTop) placement = "top";

    const left = clamp(anchorX - width / 2, viewportPadding, window.innerWidth - width - viewportPadding);
    const rawTop = placement === "bottom" ? tooltip.anchorBottom + tooltipOffset : tooltip.anchorTop - tooltipOffset - height;
    const top = clamp(rawTop, viewportPadding, window.innerHeight - height - viewportPadding);
    const arrowLeft = clamp(anchorX - left, arrowPadding, width - arrowPadding);

    setLayout({ left, top, arrowLeft, placement });
  }, [tooltip]);

  useEffect(() => {
    let activeElement: HTMLElement | null = null;

    function resolveTooltipElement(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>("[data-tooltip]");
    }

    function showTooltip(element: HTMLElement) {
      const text = element.dataset.tooltip;
      if (!text) return;
      const rect = element.getBoundingClientRect();
      const preferredPlacement = element.dataset.tooltipPlacement === "bottom" ? "bottom" : "top";
      activeElement = element;
      setLayout(null);
      setTooltip({
        text,
        preferredPlacement,
        anchorLeft: rect.left + rect.width / 2,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
      });
    }

    function hideTooltip(element?: HTMLElement | null) {
      if (element && activeElement && element !== activeElement) return;
      activeElement = null;
      setTooltip(null);
      setLayout(null);
    }

    function handleMouseOver(event: MouseEvent) {
      const element = resolveTooltipElement(event.target);
      if (element) showTooltip(element);
    }

    function handleMouseOut(event: MouseEvent) {
      const element = resolveTooltipElement(event.target);
      if (!element) return;
      const nextTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (nextTarget && element.contains(nextTarget)) return;
      hideTooltip(element);
    }

    function handleFocusIn(event: FocusEvent) {
      const element = resolveTooltipElement(event.target);
      if (element) showTooltip(element);
    }

    function handleFocusOut(event: FocusEvent) {
      hideTooltip(resolveTooltipElement(event.target));
    }

    function handleViewportChange() {
      if (activeElement) showTooltip(activeElement);
    }

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  if (!tooltip) return null;

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed z-[9999] max-w-[240px] rounded-[5px] bg-ink-primary px-2 py-1.5 text-center text-[11px] font-medium leading-tight text-white shadow-menu"
      style={{
        left: layout?.left ?? 0,
        top: layout?.top ?? 0,
        visibility: layout ? "visible" : "hidden",
      }}
      role="tooltip"
    >
      {tooltip.text}
      <span
        className="absolute h-0 w-0 -translate-x-1/2 border-x-[5px] border-x-transparent"
        style={
          (layout?.placement ?? tooltip.preferredPlacement) === "bottom"
            ? { top: -5, left: layout?.arrowLeft ?? 0, borderBottom: "5px solid #111827" }
            : { bottom: -5, left: layout?.arrowLeft ?? 0, borderTop: "5px solid #111827" }
        }
      />
    </div>
  );
}
