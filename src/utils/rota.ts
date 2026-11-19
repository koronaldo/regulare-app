export interface Coordenada {
  latitude: number;
  longitude: number;
}

/**
 * Uma parada do roteiro como o Google Maps vai recebê-la: coordenada exata (quando o processo já
 * tem uma gravada) ou o endereço em texto — aí quem localiza é o próprio Google, que é bem mais
 * preciso que o geocoder do aparelho.
 */
export type ParadaRoteiro = Coordenada | string;

function paraTextoParada(p: ParadaRoteiro): string {
  return typeof p === 'string' ? p : `${p.latitude},${p.longitude}`;
}

/**
 * Porta pro link de rotas do Google Maps (multi-parada, sem chave de API) — abre no app ou no
 * navegador. A ordem dos pontos é a que o usuário definiu na tela (arrastando), não é recalculada
 * aqui. Sem origem, o Google parte da localização atual do aparelho.
 */
export function montarUrlGoogleMaps(origem: Coordenada | null, paradas: ParadaRoteiro[]): string {
  const textos = paradas.map(paraTextoParada);
  const destination = textos[textos.length - 1];
  const waypoints = textos.slice(0, -1);

  const params = new URLSearchParams({ api: '1', travelmode: 'driving', destination });
  if (origem) params.set('origin', paraTextoParada(origem));
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Converte texto do banco ("-27,1004" ou "-27.1004") em número; null se vazio/inválido/zero. */
export function paraNumeroCoordenada(valor: string | number | null | undefined): number | null {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Coordenada válida a partir de lat/lng em texto, ou null. */
export function coordenadaDeTexto(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): Coordenada | null {
  const latitude = paraNumeroCoordenada(lat);
  const longitude = paraNumeroCoordenada(lng);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Distância em km entre dois pontos (haversine). */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
