function trimValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeTelegramHandle(telegram: string): string | null {
  const trimmed = trimValue(telegram);
  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (trimmed.startsWith("@")) {
    const handle = trimmed.slice(1).trim();
    return handle || null;
  }

  return trimmed;
}

export function formatTelegramLabel(telegram: string | null | undefined): string | null {
  const trimmed = trimValue(telegram);
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("@")) {
    return trimmed;
  }

  const handle = normalizeTelegramHandle(trimmed);
  return handle ? `@${handle}` : null;
}

export function buildTelegramUrl(telegram: string | null | undefined): string | null {
  const handle = telegram ? normalizeTelegramHandle(telegram) : null;
  return handle ? `tg://resolve?domain=${encodeURIComponent(handle)}` : null;
}

export function buildPhoneUrl(phone: string | null | undefined): string | null {
  const trimmed = trimValue(phone);
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}
