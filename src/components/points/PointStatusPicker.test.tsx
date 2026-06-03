import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PointStatusPicker } from "./PointStatusPicker";

describe("PointStatusPicker", () => {
  it("renders editable statuses without closed", () => {
    render(<PointStatusPicker value="new" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Новый" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Активный" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Проверить" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Закрыт" })).toBeNull();
  });

  it("marks the current status as pressed", () => {
    render(<PointStatusPicker value="active" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Активный" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: "Новый" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("calls onSelect when another status is chosen", () => {
    const onSelect = vi.fn();

    render(<PointStatusPicker value="new" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Активный" }));

    expect(onSelect).toHaveBeenCalledWith("active");
  });

  it("does not call onSelect when the current status is tapped again", () => {
    const onSelect = vi.fn();

    render(<PointStatusPicker value="new" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Новый" }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
