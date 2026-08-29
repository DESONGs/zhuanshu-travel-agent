import { useEffect, useRef } from "react";

const FOCUSABLE = "a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function OverlaySurface({
  children,
  onClose,
  overlayClassName,
  surfaceClassName,
  labelledBy,
  label,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef = null,
}) {
  const surfaceRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const overlay = surfaceRef.current?.parentElement;
    const background = [];
    let branch = overlay;
    while (branch?.parentElement && branch.parentElement !== document.body) {
      for (const element of branch.parentElement.children) {
        if (element === branch || background.some((entry) => entry.element === element)) continue;
        background.push({
          element,
          inert: element.hasAttribute("inert"),
          ariaHidden: element.getAttribute("aria-hidden"),
        });
      }
      branch = branch.parentElement;
    }
    background.forEach(({ element }) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    const focusTarget = initialFocusRef?.current || surfaceRef.current?.querySelector(FOCUSABLE) || surfaceRef.current;
    window.requestAnimationFrame(() => focusTarget?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = [...surfaceRef.current.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        surfaceRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      background.forEach(({ element, inert, ariaHidden }) => {
        if (!inert) element.removeAttribute("inert");
        if (ariaHidden == null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [closeOnEscape, initialFocusRef, onClose]);

  return <div className={overlayClassName} role="presentation" onMouseDown={(event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
  }}><div ref={surfaceRef} className={surfaceClassName} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={label} tabIndex={-1}>{children}</div></div>;
}
