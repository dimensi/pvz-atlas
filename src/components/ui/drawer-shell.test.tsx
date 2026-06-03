import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DrawerFooter } from "@/components/ui/drawer";
import { DrawerShell } from "@/components/ui/drawer-shell";

vi.mock("@/components/ui/drawer", () => ({
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-content">{children}</div>
  ),
  DrawerFooter: ({ children }: { children: React.ReactNode }) => (
    <footer data-slot="drawer-footer">{children}</footer>
  )
}));

describe("DrawerShell", () => {
  it("keeps footer outside the scrollable body", () => {
    render(
      <DrawerShell
        header={<header>Header</header>}
        footer={
          <DrawerFooter>
            <button type="button">Done</button>
          </DrawerFooter>
        }
        contentKey="step-1"
      >
        <p>Scrollable body</p>
      </DrawerShell>
    );

    const scroll = screen.getByTestId("drawer-scroll");
    const footer = screen.getByTestId("drawer-footer");

    expect(scroll.contains(screen.getByText("Scrollable body"))).toBe(true);
    expect(footer.contains(screen.getByRole("button", { name: "Done" }))).toBe(true);
    expect(scroll.contains(footer)).toBe(false);
  });
});
