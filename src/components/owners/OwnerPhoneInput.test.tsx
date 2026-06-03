import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerPhoneInput } from "./OwnerPhoneInput";

describe("OwnerPhoneInput", () => {
  it("formats russian phone number correctly", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <OwnerPhoneInput id="phone" value="+79991234567" onValueChange={onValueChange} />
    );

    const input = container.querySelector("input");
    expect(input?.value).toBe("+7 (999) 123-45-67");
  });

  it("handles pasting a number starting with 8", () => {
    const onValueChange = vi.fn();
    const { container } = render(<OwnerPhoneInput id="phone" value="" onValueChange={onValueChange} />);
    const input = container.querySelector("input");

    fireEvent.input(input as HTMLInputElement, {
      target: { value: "89991234567" }
    });

    // onAccept will be called with the masked value
    expect(onValueChange).toHaveBeenCalledWith("+7 (999) 123-45-67");
  });

  it("handles typing 8 as the first character", () => {
    const onValueChange = vi.fn();
    const { container } = render(<OwnerPhoneInput id="phone" value="" onValueChange={onValueChange} />);
    const input = container.querySelector("input");

    fireEvent.input(input as HTMLInputElement, {
      target: { value: "8" }
    });

    // 8 is swallowed, value remains empty or just the mask prefix
    // onAccept might not be called if the value didn't meaningfully change from empty
    expect(input?.value).toBe("");
  });
});
