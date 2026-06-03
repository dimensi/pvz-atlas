import { describe, expect, it } from "vitest";
import {
  buildPhoneUrl,
  buildTelegramUrl,
  formatTelegramLabel,
  normalizeTelegramHandle
} from "./contacts";

describe("owner contact helpers", () => {
  it("normalizes telegram handles and urls", () => {
    expect(normalizeTelegramHandle("@owner")).toBe("owner");
    expect(normalizeTelegramHandle("owner")).toBe("owner");
    expect(normalizeTelegramHandle("https://t.me/owner")).toBe("owner");
    expect(normalizeTelegramHandle("t.me/owner")).toBe("owner");
  });

  it("formats telegram labels with @ when missing", () => {
    expect(formatTelegramLabel("@owner")).toBe("@owner");
    expect(formatTelegramLabel("owner")).toBe("@owner");
    expect(formatTelegramLabel("https://t.me/owner")).toBe("@owner");
  });

  it("builds telegram and phone deeplinks", () => {
    expect(buildTelegramUrl("owner")).toBe("tg://resolve?domain=owner");
    expect(buildTelegramUrl("@owner")).toBe("tg://resolve?domain=owner");
    expect(buildPhoneUrl("+7 (900) 123-45-67")).toBe("tel:+79001234567");
  });
});
