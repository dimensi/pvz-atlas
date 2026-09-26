import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachMapTouchRecovery } from "./touch-recovery";

function dispatchTouch(target: EventTarget, type: string, count: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: { length: count } });
  target.dispatchEvent(event);
}

describe("Leaflet touch recovery", () => {
  const dragging = {
    enabled: vi.fn(() => true),
    disable: vi.fn(),
    enable: vi.fn()
  };
  let container: HTMLElement;
  let detach: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    detach = attachMapTouchRecovery(container, dragging);
  });

  afterEach(() => {
    detach();
    container.remove();
    document.body.classList.remove("leaflet-dragging");
    vi.useRealTimers();
  });

  it("leaves a completed one-finger pan alone", () => {
    dispatchTouch(container, "touchstart", 1);
    dispatchTouch(container, "touchend", 0);
    vi.runAllTimers();

    expect(dragging.disable).not.toHaveBeenCalled();
    dispatchTouch(container, "touchstart", 1);
    expect(dragging.disable).not.toHaveBeenCalled();
  });

  it("clears a stale drag before the next one-finger pan", () => {
    dispatchTouch(container, "touchstart", 1);
    dispatchTouch(container, "touchstart", 1);

    expect(dragging.disable).toHaveBeenCalledOnce();
    expect(dragging.enable).toHaveBeenCalledOnce();
  });

  it("recovers when a cancellation or app background interrupts the gesture", () => {
    dispatchTouch(container, "touchstart", 1);
    dispatchTouch(container, "touchcancel", 0);
    expect(dragging.disable).toHaveBeenCalledOnce();

    dispatchTouch(container, "touchstart", 1);
    window.dispatchEvent(new Event("blur"));
    expect(dragging.disable).toHaveBeenCalledTimes(2);
  });

  it("does not reset a gesture while another finger is still down", () => {
    dispatchTouch(container, "touchstart", 1);
    dispatchTouch(container, "touchstart", 2);
    dispatchTouch(container, "touchcancel", 1);

    expect(dragging.disable).not.toHaveBeenCalled();
    dispatchTouch(container, "touchend", 0);
    vi.runAllTimers();
    expect(dragging.disable).not.toHaveBeenCalled();
  });

  it("clears a drag class left behind after the final touchend", () => {
    dispatchTouch(container, "touchstart", 1);
    document.body.classList.add("leaflet-dragging");
    dispatchTouch(container, "touchend", 0);
    vi.runAllTimers();

    expect(dragging.disable).toHaveBeenCalledOnce();
    expect(dragging.enable).toHaveBeenCalledOnce();
  });
});
