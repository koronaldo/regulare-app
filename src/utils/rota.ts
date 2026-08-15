export interface Coordenada {
  latitude: number;
  longitude: number;
}

/** Distância em km entre 2 pontos (fórmula de haversine) — usada só pra decidir a ordem do roteiro. */
function distanciaKm(a: Coordenada, b: Coordenada): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Ordena os pontos sempre indo pro mais próximo ainda não visitado (heurística do vizinho mais
 * perto — não é o ótimo absoluto, mas é o que dá pra fazer no aparelho sem depender da API paga
 * de rotas do Google). Se `origem` vier (localização atual do aparelho), a busca começa dali;
 * senão começa do primeiro ponto da lista.
 */
export function ordenarPorProximidade<T extends Coordenada>(origem: Coordenada | null, pontos: T[]): T[] {
  const restantes = [...pontos];
  const ordenado: T[] = [];
  let atual: Coordenada | null = origem;

  if (!atual && restantes.length > 0) {
    const primeiro = restantes.shift()!;
    ordenado.push(primeiro);
    atual = primeiro;
  }

  while (restantes.length > 0) {
    let melhorIndice = 0;
    let melhorDistancia = Infinity;
    restantes.forEach((p, i) => {
      const d = distanciaKm(atual!, p);
      if (d < melhorDistancia) {
        melhorDistancia = d;
        melhorIndice = i;
      }
    });
    const [proximo] = restantes.splice(melhorIndice, 1);
    ordenado.push(proximo);
    atual = proximo;
  }

  return ordenado;
}

/** Porta pro link de rotas do Google Maps (multi-parada, sem chave de API) — abre no app ou no navegador. */
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
