export function buildYandexRouteUrl(point: {
  lat: number;
  lon: number;
  label?: string | null;
}): string {
  const params = new URLSearchParams({
    rtext: `~${point.lat},${point.lon}`,
    rtt: "auto"
  });

  if (point.label) {
    params.set("text", point.label);
  }

  return `https://yandex.ru/maps/?${params.toString()}`;
}

export function getYandexRouteUrl(lat: number, lon: number): string {
  return buildYandexRouteUrl({ lat, lon });
}
