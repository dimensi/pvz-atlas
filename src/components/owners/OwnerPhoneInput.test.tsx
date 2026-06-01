import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerPhoneInput, normalizeRussianPhoneForMask } from "./OwnerPhoneInput";

describe("OwnerPhoneInput", () => {
  it("normalizes common Russian phone input before masking", () => {
    expect(normalizeRussianPhoneForMask("89991234567")).toBe("+79991234567");
    expect(normalizeRussianPhoneForMask("9991234567")).toBe("+79991234567");
    expect(normalizeRussianPhoneForMask("+7 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizeRussianPhoneForMask("")).toBe("");
  });

  it("does not rewrite existing non-Russian phone values on mount", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <OwnerPhoneInput id="phone" value="+1 (555) 123-45-67" onValueChange={onValueChange} />
    );

    const input = container.querySelector("input");

    expect(input?.value).toBe("+1 (555) 123-45-67");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps unsupported values editable as plain phone text", () => {
    const onValueChange = vi.fn();
    const { container } = render(<OwnerPhoneInput id="phone" value="+1" onValueChange={onValueChange} />);
    const input = container.querySelector("input");

    fireEvent.change(input as HTMLInputElement, {
      target: { value: "+1 (555)" }
    });

    expect(onValueChange).toHaveBeenCalledWith("+1 (555)");
  });
});
