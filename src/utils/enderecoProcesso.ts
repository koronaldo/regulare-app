import * as Location from 'expo-location';

import type { SinistroRoteiro } from '../db/sinistros';
import { coordenadaDeTexto, distanciaKm, type Coordenada } from './rota';

/** Endereço do processo pra exibir na tela (rua, nº, bairro, CEP, cidade - UF). */
export function enderecoCompleto(item: SinistroRoteiro): string {
  const partes = [
    [item.endereco, item.nro_predio].filter(Boolean).join(', '),
    item.bairro,
    item.cep,
    item.nm_cidade && item.id_estado ? `${item.nm_cidade} - ${item.id_estado}` : item.nm_cidade,
  ];
  return partes.filter((p) => p && p.trim()).join(', ');
}

/** Raio máximo (km) entre o ponto geocodificado e o centro da cidade do processo. */
export const RAIO_MAXIMO_CIDADE_KM = 40;

/**
 * Endereço no formato que os geocoders entendem melhor ("Rua X, 123 - Bairro, Cidade - UF, CEP,
 * Brasil"). Sem o país, o geocoder pode achar uma rua homônima em outra cidade/país.
 */
export function enderecoParaBusca(item: SinistroRoteiro, incluirNumero = true): string {
  const rua = [item.endereco?.trim(), incluirNumero ? item.nro_predio?.trim() : null]
    .filter(Boolean)
    .join(', ');
  const ruaBairro = [rua, item.bairro?.trim()].filter(Boolean).join(' - ');
  const cidade = [item.nm_cidade?.trim(), item.id_estado?.trim()].filter(Boolean).join(' - ');
  return [ruaBairro, cidade, item.cep?.trim(), 'Brasil'].filter(Boolean).join(', ');
}

/** Coordenada já gravada no processo (tela Coordenadas), se houver. */
export function coordenadaGravada(item: SinistroRoteiro): Coordenada | null {
  return coordenadaDeTexto(item.coorde_lat, item.coorde_log);
}

/**
 * Geocodifica no aparelho só pra desenhar o mapa de prévia. Descarta resultados longe da cidade do
 * processo (o geocoder do Android às vezes devolve rua homônima em outra cidade ou só o centro do
 * CEP); se o endereço com número não der certo, tenta sem o número.
 */
export async function geocodificarProcesso(item: SinistroRoteiro): Promise<Coordenada | null> {
  const centro = coordenadaDeTexto(item.cidade_lat, item.cidade_lng);
  const tentativas = [enderecoParaBusca(item, true), enderecoParaBusca(item, false)];

  for (const endereco of new Set(tentativas)) {
    if (!item.endereco?.trim() && !item.nm_cidade?.trim()) break;
    try {
      const resultados = await Location.geocodeAsync(endereco);
      const valido = resultados.find(
        (r) => !centro || distanciaKm(centro, r) <= RAIO_MAXIMO_CIDADE_KM,
      );
      if (valido) return { latitude: valido.latitude, longitude: valido.longitude };
    } catch {
      // tenta a próxima forma do endereço
    }
  }
  return null;
}


/**
 * Distância máxima (km) entre a coordenada gravada e o endereço geocodificado pra considerar que
 * conferem. O geocoder do aparelho às vezes devolve só o meio da rua ou o centro do CEP — por isso
 * não dá pra exigir precisão de metros.
 */
export const TOLERANCIA_CONFERENCIA_KM = 1;

export type SituacaoConferencia =
  /** Coordenada gravada bate com o endereço cadastrado. */
  | 'ok'
  /** Coordenada gravada está longe do endereço cadastrado (ou aponta pra outra cidade). */
  | 'divergente'
  /** Coordenada gravada está fora da cidade do processo. */
  | 'fora_cidade'
  /** Processo sem coordenada gravada: o roteiro vai pelo endereço em texto. */
  | 'sem_coordenada'
  /** Tem coordenada, mas o endereço não pôde ser localizado pra comparar. */
  | 'nao_verificado';

export interface ResultadoConferencia {
  situacao: SituacaoConferencia;
  coordenada: Coordenada | null;
  /** Onde o endereço cadastrado cai segundo o geocoder do aparelho. */
  coordenadaEndereco: Coordenada | null;
  /** Distância entre a coordenada gravada e o endereço geocodificado. */
  distanciaKm: number | null;
  /** Endereço que a coordenada gravada aponta (geocodificação reversa). */
  enderecoDaCoordenada: string | null;
  /** A coordenada gravada aponta pra uma cidade diferente da cadastrada. */
  cidadeDiferente: boolean;
  /** A coordenada foi corrigida nesta conferência (usuário tocou em "Corrigir"). */
  corrigida?: boolean;
}

/** Minúsculas e sem acentos, pra comparar nomes de cidade. */
function semAcento(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

async function enderecoReverso(
  coord: Coordenada,
): Promise<{ texto: string | null; cidade: string | null }> {
  try {
    const [r] = await Location.reverseGeocodeAsync(coord);
    if (!r) return { texto: null, cidade: null };
    const rua = [r.street, r.streetNumber].filter(Boolean).join(', ');
    // No Android a cidade às vezes vem em subregion quando city está vazio.
    const cidade = r.city || r.subregion || null;
    const cidadeUf = [cidade, r.region].filter(Boolean).join(' - ');
    const texto =
      [rua, r.district, cidadeUf].filter(Boolean).join(', ') || r.formattedAddress || null;
    return { texto, cidade };
  } catch {
    return { texto: null, cidade: null };
  }
}

/**
 * Confere se a coordenada gravada no processo corresponde ao endereço cadastrado: geocodifica o
 * endereço, mede a distância até a coordenada e, no sentido inverso, descobre que endereço a
 * coordenada aponta — pro usuário comparar com os próprios olhos.
 */
export async function conferirEndereco(item: SinistroRoteiro): Promise<ResultadoConferencia> {
  const coordenada = coordenadaGravada(item);
  const coordenadaEndereco = await geocodificarProcesso(item);

  if (!coordenada) {
    return {
      situacao: 'sem_coordenada',
      coordenada: null,
      coordenadaEndereco,
      distanciaKm: null,
      enderecoDaCoordenada: null,
      cidadeDiferente: false,
    };
  }

  const reverso = await enderecoReverso(coordenada);
  const cidadeDiferente =
    !!reverso.cidade && !!item.nm_cidade?.trim() && semAcento(reverso.cidade) !== semAcento(item.nm_cidade);
  const distancia = coordenadaEndereco ? distanciaKm(coordenada, coordenadaEndereco) : null;
  const centro = coordenadaDeTexto(item.cidade_lat, item.cidade_lng);

  let situacao: SituacaoConferencia;
  if (centro && distanciaKm(coordenada, centro) > RAIO_MAXIMO_CIDADE_KM) situacao = 'fora_cidade';
  else if (distancia != null) situacao = distancia <= TOLERANCIA_CONFERENCIA_KM ? 'ok' : 'divergente';
  else if (cidadeDiferente) situacao = 'divergente';
  else situacao = 'nao_verificado';

  return {
    situacao,
    coordenada,
    coordenadaEndereco,
    distanciaKm: distancia,
    enderecoDaCoordenada: reverso.texto,
    cidadeDiferente,
  };
}
