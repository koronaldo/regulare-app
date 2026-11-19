import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraxProvider, SortableContainer, SortableItem, useSortableList } from 'react-native-drax';
import * as Location from 'expo-location';

import { listarSinistrosParaRoteiro, type SinistroRoteiro } from '../src/db/sinistros';
import { mostrarAlerta } from '../src/utils/alerta';
import {
  coordenadaDeTexto,
  distanciaKm,
  montarUrlGoogleMaps,
  type Coordenada,
  type ParadaRoteiro,
} from '../src/utils/rota';
import { MapaRoteiro, type PontoRoteiro } from '../src/components/MapaRoteiro';

/**
 * A lista arrastável exige altura fixa por item. Etiqueta compacta (nome, sinistro e endereço em
 * uma linha cada) pra caber mais itens na tela e o arraste não precisar rolar tanto.
 */
const ALTURA_ITEM = 72;

function enderecoCompleto(item: SinistroRoteiro): string {
  const partes = [
    [item.endereco, item.nro_predio].filter(Boolean).join(', '),
    item.bairro,
    item.cep,
    item.nm_cidade && item.id_estado ? `${item.nm_cidade} - ${item.id_estado}` : item.nm_cidade,
  ];
  return partes.filter((p) => p && p.trim()).join(', ');
}

/** Raio máximo (km) entre o ponto geocodificado e o centro da cidade do processo. */
const RAIO_MAXIMO_CIDADE_KM = 40;

/**
 * Endereço no formato que os geocoders entendem melhor ("Rua X, 123 - Bairro, Cidade - UF, CEP,
 * Brasil"). Sem o país, o geocoder pode achar uma rua homônima em outra cidade/país.
 */
function enderecoParaBusca(item: SinistroRoteiro, incluirNumero = true): string {
  const rua = [item.endereco?.trim(), incluirNumero ? item.nro_predio?.trim() : null]
    .filter(Boolean)
    .join(', ');
  const ruaBairro = [rua, item.bairro?.trim()].filter(Boolean).join(' - ');
  const cidade = [item.nm_cidade?.trim(), item.id_estado?.trim()].filter(Boolean).join(' - ');
  return [ruaBairro, cidade, item.cep?.trim(), 'Brasil'].filter(Boolean).join(', ');
}

/** Coordenada já gravada no processo (tela Coordenadas), se houver. */
function coordenadaGravada(item: SinistroRoteiro): Coordenada | null {
  return coordenadaDeTexto(item.coorde_lat, item.coorde_log);
}

/**
 * Geocodifica no aparelho só pra desenhar o mapa de prévia. Descarta resultados longe da cidade do
 * processo (o geocoder do Android às vezes devolve rua homônima em outra cidade ou só o centro do
 * CEP); se o endereço com número não der certo, tenta sem o número.
 */
async function geocodificarProcesso(item: SinistroRoteiro): Promise<Coordenada | null> {
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

/** Minúsculas e sem acentos, pra busca casar "São Paulo" com "sao paulo". */
function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Busca por segurado, número do sinistro, rua (endereço/bairro) ou cidade. */
function correspondeBusca(item: SinistroRoteiro, termo: string): boolean {
  if (!termo) return true;
  const campos = [item.nm_segurado, item.nro_sinistro, item.endereco, item.bairro, item.nm_cidade];
  return campos.some((campo) => normalizar(campo).includes(termo));
}

export default function RoteirosScreen() {
  const { codreg } = useLocalSearchParams<{ codreg: string }>();
  const codregNum = Number(codreg);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [processos, setProcessos] = useState<SinistroRoteiro[]>([]);
  const [idsSelecionados, setIdsSelecionados] = useState<number[]>([]);
  const [montando, setMontando] = useState(false);
  const [busca, setBusca] = useState('');
  /** Cache de geocodificação por sinistro: null = endereço não localizado (não tenta de novo). */
  const [coordenadas, setCoordenadas] = useState<Record<number, Coordenada | null>>({});
  /** Só fica preenchida depois que o usuário monta um roteiro e concede a permissão. */
  const [origem, setOrigem] = useState<Coordenada | null>(null);

  useEffect(() => {
    if (!codregNum) return;
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      try {
        const lista = await listarSinistrosParaRoteiro(codregNum);
        if (!cancelado) {
          setProcessos(lista);
          setIdsSelecionados([]);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [codregNum]);

  const mapaProcessos = useMemo(
    () => new Map(processos.map((p) => [p.id_sinistro, p])),
    [processos],
  );
  const selecionados = useMemo(
    () =>
      idsSelecionados.map((id) => mapaProcessos.get(id)).filter((p): p is SinistroRoteiro => !!p),
    [idsSelecionados, mapaProcessos],
  );
  const disponiveis = useMemo(
    () => processos.filter((p) => !idsSelecionados.includes(p.id_sinistro)),
    [processos, idsSelecionados],
  );
  const termoBusca = normalizar(busca);
  const disponiveisFiltrados = useMemo(
    () => disponiveis.filter((p) => correspondeBusca(p, termoBusca)),
    [disponiveis, termoBusca],
  );

  // Geocodifica um endereço por vez: grava no cache e deixa o próprio efeito reexecutar (ele
  // depende de `coordenadas`) pra pegar o próximo pendente. O resultado é guardado mesmo quando
  // falha (null), então reordenar, remover ou reselecionar nunca refaz a busca.
  useEffect(() => {
    let cancelado = false;

    async function geocodificarProximo() {
      const pendente = selecionados.find((p) => !(p.id_sinistro in coordenadas));
      if (!pendente) return;

      const coord = coordenadaGravada(pendente) ?? (await geocodificarProcesso(pendente));
      if (cancelado) return;
      setCoordenadas((atual) => ({ ...atual, [pendente.id_sinistro]: coord }));
    }

    geocodificarProximo();
    return () => {
      cancelado = true;
    };
  }, [selecionados, coordenadas]);

  /** Paradas que já têm coordenada, numeradas na ordem da trajetória. */
  const pontosMapa = useMemo<PontoRoteiro[]>(() => {
    const pontos: PontoRoteiro[] = [];
    selecionados.forEach((item, indice) => {
      const coord = coordenadas[item.id_sinistro];
      if (!coord) return;
      pontos.push({
        ...coord,
        ordem: indice + 1,
        rotulo: item.nm_segurado || item.nro_sinistro || `Sinistro ${item.id_sinistro}`,
      });
    });
    return pontos;
  }, [selecionados, coordenadas]);

  const localizando = selecionados.some((p) => !(p.id_sinistro in coordenadas));

  const listaRef = useRef<FlatList<SinistroRoteiro>>(null);

  const sortable = useSortableList({
    data: selecionados,
    numColumns: 1,
    keyExtractor: (item) => String(item.id_sinistro),
    onReorder: ({ data }) => setIdsSelecionados(data.map((d) => d.id_sinistro)),
    // Só sobe/desce: evita o item "escapar" pros lados e facilita soltar na posição certa.
    lockToMainAxis: true,
    longPressDelay: 200,
    // Rola a lista mais cedo quando o dedo chega perto da borda, em passos menores.
    autoScrollBackThreshold: 0.15,
    autoScrollForwardThreshold: 0.85,
    autoScrollJumpRatio: 0.12,
    inactiveItemStyle: { opacity: 0.6 },
  });

  function selecionar(idSinistro: number) {
    setIdsSelecionados((atual) => [...atual, idSinistro]);
  }

  function desselecionar(idSinistro: number) {
    setIdsSelecionados((atual) => atual.filter((id) => id !== idSinistro));
  }

  async function montarRoteiro() {
    if (selecionados.length === 0) {
      mostrarAlerta('Nada selecionado', 'Selecione ao menos um processo para montar o roteiro.');
      return;
    }

    setMontando(true);
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();

      let origemAtual: Coordenada | null = null;
      if (permissao.granted) {
        try {
          const posicao = await Location.getCurrentPositionAsync({});
          origemAtual = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude };
          setOrigem(origemAtual);
        } catch {
          origemAtual = null;
        }
      }

      const pontos: ParadaRoteiro[] = [];
      const falhas: string[] = [];

      // Respeita a ordem em que os processos foram arrastados/selecionados — sem reordenar por
      // distância. Pro Google Maps vai a coordenada gravada no processo (exata) ou, na falta dela,
      // o endereço em texto: quem localiza é o próprio Google, que acerta bem mais que o geocoder
      // do aparelho. A geocodificação local serve só pro mapa de prévia.
      for (const item of selecionados) {
        const coord = coordenadaGravada(item);
        const temEndereco = !!item.endereco?.trim() && !!item.nm_cidade?.trim();
        if (coord) {
          pontos.push(coord);
        } else if (temEndereco) {
          pontos.push(enderecoParaBusca(item));
        } else {
          falhas.push(
            item.nm_segurado ||
              item.nro_sinistro ||
              enderecoCompleto(item) ||
              `Sinistro ${item.id_sinistro}`,
          );
        }
      }

      if (pontos.length === 0) {
        mostrarAlerta(
          'Endereço incompleto',
          'Nenhum dos processos selecionados tem endereço (rua e cidade) cadastrado.',
        );
        return;
      }

      const url = montarUrlGoogleMaps(origemAtual, pontos);

      if (falhas.length > 0) {
        mostrarAlerta('Processos sem endereço ficaram fora do roteiro', falhas.join(', '), [
          { text: 'OK', onPress: () => Linking.openURL(url) },
        ]);
      } else {
        await Linking.openURL(url);
      }
    } finally {
      setMontando(false);
    }
  }

  function voltar() {
    router.back();
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <DraxProvider>
        <StatusBar style="light" />

        <View style={styles.header}>
          <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitulo}>Roteiros</Text>
            <Text style={styles.headerSubtitulo}>Processos sem data de vistoria</Text>
          </View>
        </View>

        {carregando ? (
          <View style={styles.centro}>
            <ActivityIndicator color="#1c3d5a" />
          </View>
        ) : processos.length === 0 ? (
          <View style={styles.centro}>
            <Ionicons name="map-outline" size={40} color="#c2ccd6" />
            <Text style={styles.vazioTexto}>Nenhum processo pendente de vistoria.</Text>
          </View>
        ) : (
          <>
            <View style={styles.barraBusca}>
              <Ionicons name="search" size={18} color="#8a97a3" />
              <TextInput
                style={styles.campoBusca}
                placeholder="Buscar por segurado, sinistro, rua ou cidade"
                placeholderTextColor="#8a97a3"
                value={busca}
                onChangeText={setBusca}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {busca.length > 0 && (
                <Pressable
                  onPress={() => setBusca('')}
                  hitSlop={10}
                  accessibilityLabel="Limpar busca"
                >
                  <Ionicons name="close-circle" size={18} color="#8a97a3" />
                </Pressable>
              )}
            </View>
            <SortableContainer sortable={sortable} scrollRef={listaRef} style={styles.flex1}>
              <FlatList
                ref={listaRef}
                data={sortable.data}
                keyExtractor={sortable.stableKeyExtractor}
                onScroll={sortable.onScroll}
                onContentSizeChange={sortable.onContentSizeChange}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.lista}
                ListHeaderComponent={
                  <>
                    {selecionados.length > 0 && (
                      <>
                        <MapaRoteiro pontos={pontosMapa} origem={origem} />
                        {localizando && (
                          <Text style={styles.dicaArrastar}>Localizando endereços…</Text>
                        )}
                      </>
                    )}
                    <Text style={styles.tituloSecao}>Selecionados</Text>
                    {selecionados.length === 0 && (
                      <Text style={styles.mensagemVazia}>
                        Selecione os processos na lista abaixo para montar o roteiro.
                      </Text>
                    )}
                    {selecionados.length > 0 && (
                      <Text style={styles.dicaArrastar}>
                        Toque e segure num item pra arrastar e mudar a ordem.
                      </Text>
                    )}
                  </>
                }
                renderItem={({ item, index }) => (
                  <SortableItem
                    sortable={sortable}
                    index={index}
                    style={styles.itemArrastavel}
                    hoverDraggingStyle={styles.itemArrastando}
                  >
                    <View style={[styles.card, styles.cardSelecionado]}>
                      <Ionicons name="reorder-three-outline" size={22} color="#1c3d5a" />
                      <Text style={styles.numeroOrdem}>{index + 1}</Text>
                      <View style={styles.cardTexto}>
                        <Text style={styles.cardSeguradoCompacto} numberOfLines={1}>
                          {item.nm_segurado || 'Segurado não informado'}
                        </Text>
                        <Text style={styles.cardLinhaCompacta} numberOfLines={1}>
                          Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                        </Text>
                        <Text style={styles.cardLinhaCompacta} numberOfLines={1}>
                          {enderecoCompleto(item) || 'Endereço não informado'}
                        </Text>
                      </View>
                      <Switch
                        value
                        onValueChange={() => desselecionar(item.id_sinistro)}
                        trackColor={{ true: '#1c3d5a' }}
                      />
                    </View>
                  </SortableItem>
                )}
                ListFooterComponent={
                  <>
                    <Text style={[styles.tituloSecao, styles.tituloSecaoDisponiveis]}>
                      {termoBusca
                        ? `Disponíveis (${disponiveisFiltrados.length} de ${disponiveis.length})`
                        : `Disponíveis (${disponiveis.length})`}
                    </Text>
                    {!!termoBusca && disponiveisFiltrados.length === 0 && (
                      <Text style={styles.mensagemVazia}>
                        Nenhum processo encontrado para “{busca.trim()}”.
                      </Text>
                    )}
                    {disponiveisFiltrados.map((item) => (
                      <View key={item.id_sinistro} style={styles.card}>
                        <View style={styles.cardTexto}>
                          <Text style={styles.cardSegurado} numberOfLines={1}>
                            {item.nm_segurado || 'Segurado não informado'}
                          </Text>
                          <Text style={styles.cardLinha} numberOfLines={1}>
                            Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                          </Text>
                          <Text style={styles.cardEndereco}>
                            {enderecoCompleto(item) || 'Endereço não informado'}
                          </Text>
                        </View>
                        <Switch
                          value={false}
                          onValueChange={() => selecionar(item.id_sinistro)}
                          trackColor={{ true: '#1c3d5a' }}
                        />
                      </View>
                    ))}
                  </>
                }
              />
            </SortableContainer>
          </>
        )}

        <View style={[styles.rodape, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={[styles.botaoMontar, montando && styles.botaoDesabilitado]}
            onPress={montarRoteiro}
            disabled={montando}
          >
            {montando ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="navigate-outline" size={20} color="#fff" />
            )}
            <Text style={styles.botaoMontarTexto}>{montando ? 'Montando…' : 'Montar Roteiro'}</Text>
          </Pressable>
        </View>
      </DraxProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  flex1: {
    flex: 1,
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botaoVoltar: {
    marginTop: 2,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitulo: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitulo: {
    color: '#9db3c7',
    fontSize: 12,
    marginTop: 2,
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
  },
  barraBusca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e8ed',
  },
  campoBusca: {
    flex: 1,
    fontSize: 14,
    color: '#1c3d5a',
    paddingVertical: 10,
  },
  lista: {
    padding: 16,
    paddingBottom: 24,
  },
  tituloSecao: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8a97a3',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tituloSecaoDisponiveis: {
    marginTop: 18,
  },
  mensagemVazia: {
    fontSize: 13,
    color: '#8a97a3',
    fontStyle: 'italic',
    marginBottom: 14,
  },
  dicaArrastar: {
    fontSize: 12,
    color: '#8a97a3',
    marginBottom: 8,
  },
  itemArrastavel: {
    height: ALTURA_ITEM,
    marginBottom: 8,
  },
  itemArrastando: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e8b93a',
    transform: [{ scale: 1.03 }],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cardSeguradoCompacto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
    lineHeight: 18,
  },
  cardLinhaCompacta: {
    fontSize: 11,
    color: '#48545e',
    lineHeight: 15,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e3e8ed',
    // Sem altura fixa: os disponíveis crescem pra mostrar o endereço inteiro.
    minHeight: ALTURA_ITEM - 8,
  },
  cardSelecionado: {
    borderColor: '#1c3d5a',
    backgroundColor: '#eef4f8',
    marginBottom: 0,
    minHeight: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
    // A lista arrastável mede cada item por ALTURA_ITEM, então aqui a altura é fixa mesmo.
    height: ALTURA_ITEM - 8,
  },
  numeroOrdem: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
    width: 18,
    textAlign: 'center',
  },
  cardTexto: {
    flex: 1,
  },
  cardSegurado: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  cardLinha: {
    fontSize: 12,
    color: '#48545e',
    marginTop: 2,
  },
  cardEndereco: {
    fontSize: 12,
    color: '#48545e',
    marginTop: 2,
    lineHeight: 16,
  },
  cardDestaque: {
    color: '#2a88ad',
    fontWeight: '600',
  },
  rodape: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f5',
  },
  botaoMontar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 14,
  },
  botaoDesabilitado: {
    opacity: 0.7,
  },
  botaoMontarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
