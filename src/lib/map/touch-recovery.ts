interface MapDragging {
  enabled(): boolean;
  disable(): void;
  enable(): void;
}

/** Clear Leaflet's drag lock if iOS interrupts a touch without finishing it. */
export function attachMapTouchRecovery(container: HTMLElement, dragging: MapDragging): () => void {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  if (!win) {
    return () => {};
  }

  let activeTouch = false;
  let endCheck: number | undefined;

  const resetDragging = () => {
    if (dragging.enabled()) {
      dragging.disable();
      dragging.enable();
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      return;
    }

    if (activeTouch || doc.body.classList.contains("leaflet-dragging")) {
      resetDragging();
    }
    activeTouch = true;
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!activeTouch || event.touches.length > 0) {
      return;
    }

    activeTouch = false;
    if (endCheck !== undefined) {
      win.clearTimeout(endCheck);
    }
    // Leaflet handles touchend in the bubble phase. Check after its handler ran.
    endCheck = win.setTimeout(() => {
      endCheck = undefined;
      if (doc.body.classList.contains("leaflet-dragging")) {
        resetDragging();
      }
    }, 0);
  };

  const onInterruptedTouch = () => {
    if (activeTouch) {
      activeTouch = false;
      resetDragging();
    }
  };

  const onTouchCancel = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      onInterruptedTouch();
    }
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") {
      onInterruptedTouch();
    }
  };

  container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  doc.addEventListener("touchend", onTouchEnd, true);
  doc.addEventListener("touchcancel", onTouchCancel, true);
  win.addEventListener("blur", onInterruptedTouch);
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    container.removeEventListener("touchstart", onTouchStart, true);
    doc.removeEventListener("touchend", onTouchEnd, true);
    doc.removeEventListener("touchcancel", onTouchCancel, true);
    win.removeEventListener("blur", onInterruptedTouch);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    if (endCheck !== undefined) {
      win.clearTimeout(endCheck);
    }
  };
}
