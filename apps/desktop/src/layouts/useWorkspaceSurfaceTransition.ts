import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

/** Changing the workspace surface closes its temporary drawer without remounting editors. */
export function useWorkspaceSurfaceTransition(settings: boolean, settingsRoot: RefObject<HTMLElement>, documentRoot: RefObject<HTMLElement>, setNavigationOpen: Dispatch<SetStateAction<boolean>>) {
  const previous = useRef(false);
  useEffect(() => {
    const returning = previous.current;
    previous.current = settings;
    let frame: number | undefined;
    if (settings || returning) setNavigationOpen(false);
    if (settings) frame = requestAnimationFrame(() => settingsRoot.current?.focus({preventScroll: true}));
    else if (returning) frame = requestAnimationFrame(() => Array.from(documentRoot.current?.querySelectorAll<HTMLElement>('[contenteditable="true"]') ?? []).find(element => element.getClientRects().length > 0)?.focus({preventScroll: true}));
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [settings, settingsRoot, documentRoot, setNavigationOpen]);
}
