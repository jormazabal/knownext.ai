import { useEffect, useRef, type ReactNode } from "react";

// Ancestors can be isolated by more than one modal. Parent-first unmounts
// must not restore a child's captured `true` after the last owner is gone.
const isolationOwners = new WeakMap<HTMLElement, { count: number; original: boolean }>();
function isolate(node: HTMLElement): () => void {
  const owner = isolationOwners.get(node) ?? { count: 0, original: Boolean(node.inert) };
  owner.count += 1;
  isolationOwners.set(node, owner);
  node.inert = true;
  return () => {
    owner.count -= 1;
    if (owner.count === 0) {
      node.inert = owner.original;
      isolationOwners.delete(node);
    }
  };
}

/** Shared modal boundary: keyboard ownership, background isolation and focus return. */
export function ModalFrame({ label, onClose, children, className = "", role = "dialog", fallbackFocus }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  fallbackFocus?: () => HTMLElement | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const keyboardTargets=useRef<()=>HTMLElement[]>(()=>[]);
  const close = useRef(onClose);
  close.current = onClose;
  const focusFallback=useRef(fallbackFocus);
  focusFallback.current=fallbackFocus;
  useEffect(() => {
    const dialog = root.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const parentDialog = dialog.parentElement?.closest<HTMLElement>('[role="dialog"],[role="alertdialog"]');
    const releaseIsolation: Array<() => void> = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          releaseIsolation.push(isolate(sibling));
        }
      }
      branch = branch.parentElement;
    }
    const selector = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]';
    const targets = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector))
      .filter(el => {
        if (el.closest('[hidden],[inert]') || el.tabIndex < 0) return false;
        let ancestor: HTMLElement | null = el;
        while (ancestor && ancestor !== dialog) {
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility === "hidden") return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? targets()[0] ?? dialog).focus();
    keyboardTargets.current=targets;
    return () => {
      keyboardTargets.current=()=>[];
      releaseIsolation.forEach(release => release());
      const returnFocus = () => {
        const candidates = [previous, parentDialog, focusFallback.current?.()];
        for (const target of candidates) {
          if (!target?.isConnected || target.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
          let visible = true;
          for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.display === "none" || style.visibility === "hidden") { visible = false; break; }
          }
          if (!visible) continue;
          target.focus({ preventScroll: true });
          if (document.activeElement === target) return true;
        }
        return false;
      };
      // React may still be disposing a nested owner in this same commit.
      if (!returnFocus()) queueMicrotask(returnFocus);
    };
  }, []);
  return <div ref={root} role={role} aria-modal="true" aria-label={label} tabIndex={-1}
    onKeyDown={event=>{
      // React children own their menus/completions before the modal boundary.
      if(event.defaultPrevented)return;
      if(event.key==="Escape"&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();close.current();}
      else if(event.key==="Tab"){
        const items=keyboardTargets.current(),first=items[0],last=items[items.length-1];
        if(!first){event.preventDefault();root.current?.focus();}
        else if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }}
    className={`knownext-modal-overlay fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/20 p-3 ${className}`}>
    {children}
  </div>;
}
