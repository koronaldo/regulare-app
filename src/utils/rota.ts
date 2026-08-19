export interface Coordenada {
  latitude: number;
  longitude: number;
}

/**
 * Porta pro link de rotas do Google Maps (multi-parada, sem chave de API) — abre no app ou no
 * navegador. A ordem dos pontos é a que o usuário definiu na tela (arrastando), não é recalculada
 * aqui.
 */
export function montarUrlGoogleMaps(origem: Coordenada | null, pontosOrdenados: Coordenada[]): string {
  const coords = pontosOrdenados.map((p) => `${p.latitude},${p.longitude}`);

  const origin = origem ? `${origem.latitude},${origem.longitude}` : coords[0];
  const meio = origem ? coords : coords.slice(1);
  const destination = meio[meio.length - 1];
  const waypoints = meio.slice(0, -1);

  const params = new URLSearchParams({ api: '1', travelmode: 'driving', origin, destination });
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
