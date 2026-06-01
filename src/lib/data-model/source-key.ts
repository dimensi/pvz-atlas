export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeAddressPart(value: string): string {
  return normalizeText(value)
    .replace(/[.,;:]/g, "")
    .replace(/\b(ул|улица)\b/g, "street")
    .replace(/\b(пр-т|проспект)\b/g, "avenue")
    .replace(/\s+/g, " ");
}

export function createPointSourceKey(input: {
  brand: string;
  city: string;
  address: string;
}): string {
  return [
    normalizeText(input.brand),
    normalizeAddressPart(input.city),
    normalizeAddressPart(input.address)
  ].join("|");
}
