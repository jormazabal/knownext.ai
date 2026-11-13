import { useEffect, type RefObject } from "react";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Focus follows document activation, never background updates or autosave. */
export function useActiveEditorFocus(active: boolean, ready: boolean, view: RefObject<EditorView>, request = 0) {
  useEffect(() => {
    if (!active || !ready) return;
    let frame: number | undefined;
    let observer: MutationObserver | undefined;
    const focus = () => {
      const editor = view.current;
      if (!editor || editor.isDestroyed) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        observer ??= new MutationObserver(() => {
          if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
            observer?.disconnect(); frame = requestAnimationFrame(focus);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return;
      }
      if (!editor.dom.getClientRects().length || editor.dom.closest('[hidden], [inert], [aria-hidden="true"]')) return;
      const focused = document.activeElement;
      // A slow-loading document must not interrupt text entered in search or AI.
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"]') && !focused.closest('.knownext-editor')) return;
      editor.focus();
    };
    frame = requestAnimationFrame(focus);
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [active, ready, view, request]);
}
