import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraxProvider, SortableContainer, SortableItem, useSortableList } from 'react-native-drax';
import * as Location from 'expo-location';

import { listarSinistrosParaRoteiro, type SinistroRoteiro } from '../src/db/sinistros';
import { mostrarAlerta } from '../src/utils/alerta';
import { montarUrlGoogleMaps, type Coordenada } from '../src/utils/rota';

const ALTURA_ITEM = 82;

function enderecoCompleto(item: SinistroRoteiro): string {
  const partes = [
    [item.endereco, item.nro_predio].filter(Boolean).join(', '),
    item.bairro,
    item.nm_cidade && item.id_estado ? `${item.nm_cidade} - ${item.id_estado}` : item.nm_cidade,
    item.cep,
  ];
  return partes.filter((p) => p && p.trim()).join(', ');
}

export default function RoteirosScreen() {
  const { codreg } = useLocalSearchParams<{ codreg: string }>();
  const codregNum = Number(codreg);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [processos, setProcessos] = useState<SinistroRoteiro[]>([]);
  const [idsSelecionados, setIdsSelecionados] = useState<number[]>([]);
  const [montando, setMontando] = useState(false);

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

  const mapaProcessos = useMemo(() => new Map(processos.map((p) => [p.id_sinistro, p])), [processos]);
  const selecionados = useMemo(
    () => idsSelecionados.map((id) => mapaProcessos.get(id)).filter((p): p is SinistroRoteiro => !!p),
    [idsSelecionados, mapaProcessos],
  );
  const disponiveis = useMemo(
    () => processos.filter((p) => !idsSelecionados.includes(p.id_sinistro)),
    [processos, idsSelecionados],
  );

  const listaRef = useRef<FlatList<SinistroRoteiro>>(null);

  const sortable = useSortableList({
    data: selecionados,
    numColumns: 1,
    keyExtractor: (item) => String(item.id_sinistro),
    onReorder: ({ data }) => setIdsSelecionados(data.map((d) => d.id_sinistro)),
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

      let origem: Coordenada | null = null;
      if (permissao.granted) {
        try {
          const posicao = await Location.getCurrentPositionAsync({});
          origem = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude };
        } catch {
          origem = null;
        }
      }

      const pontos: Coordenada[] = [];
      const falhas: string[] = [];

      // Respeita a ordem em que os processos foram arrastados/selecionados — sem reordenar por distância.
      for (const item of selecionados) {
        const endereco = enderecoCompleto(item);
        if (!endereco) {
          falhas.push(item.nm_segurado || item.nro_sinistro || `Sinistro ${item.id_sinistro}`);
          continue;
        }
        try {
          const resultados = await Location.geocodeAsync(endereco);
          if (resultados.length === 0) {
            falhas.push(item.nm_segurado || item.nro_sinistro || endereco);
            continue;
          }
          pontos.push({ latitude: resultados[0].latitude, longitude: resultados[0].longitude });
        } catch {
          falhas.push(item.nm_segurado || item.nro_sinistro || endereco);
        }
      }

      if (pontos.length === 0) {
        mostrarAlerta('Endereço não localizado', 'Não foi possível localizar nenhum dos endereços selecionados.');
        return;
      }
      if (!origem && pontos.length < 2) {
        mostrarAlerta(
          'Localização necessária',
          'Sem acesso à localização atual, selecione ao menos 2 processos para montar o roteiro.',
        );
        return;
      }

      const url = montarUrlGoogleMaps(origem, pontos);

      if (falhas.length > 0) {
        mostrarAlerta('Alguns endereços não foram localizados', falhas.join(', '), [
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
          <SortableContainer sortable={sortable} scrollRef={listaRef} style={styles.flex1}>
            <FlatList
              ref={listaRef}
              data={sortable.data}
              keyExtractor={sortable.stableKeyExtractor}
              onScroll={sortable.onScroll}
              onContentSizeChange={sortable.onContentSizeChange}
              scrollEventThrottle={16}
              contentContainerStyle={styles.lista}
              ListHeaderComponent={
                <>
                  <Text style={styles.tituloSecao}>Selecionados</Text>
                  {selecionados.length === 0 && (
                    <Text style={styles.mensagemVazia}>Selecione os processos na lista abaixo para montar o roteiro.</Text>
                  )}
                  {selecionados.length > 0 && (
                    <Text style={styles.dicaArrastar}>Toque e segure num item pra arrastar e mudar a ordem.</Text>
                  )}
                </>
              }
              renderItem={({ item, index }) => (
                <SortableItem sortable={sortable} index={index} style={styles.itemArrastavel}>
                  <View style={[styles.card, styles.cardSelecionado]}>
                    <Ionicons name="reorder-three-outline" size={20} color="#8a97a3" />
                    <Text style={styles.numeroOrdem}>{index + 1}</Text>
                    <View style={styles.cardTexto}>
                      <Text style={styles.cardSegurado} numberOfLines={1}>
                        {item.nm_segurado || 'Segurado não informado'}
                      </Text>
                      <Text style={styles.cardLinha} numberOfLines={1}>
                        Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                      </Text>
                      <Text style={styles.cardLinha} numberOfLines={1}>
                        {enderecoCompleto(item) || 'Endereço não informado'}
                      </Text>
                    </View>
                    <Switch value onValueChange={() => desselecionar(item.id_sinistro)} trackColor={{ true: '#1c3d5a' }} />
                  </View>
                </SortableItem>
              )}
              ListFooterComponent={
                <>
                  <Text style={[styles.tituloSecao, styles.tituloSecaoDisponiveis]}>Disponíveis ({disponiveis.length})</Text>
                  {disponiveis.map((item) => (
                    <View key={item.id_sinistro} style={styles.card}>
                      <View style={styles.cardTexto}>
                        <Text style={styles.cardSegurado} numberOfLines={1}>
                          {item.nm_segurado || 'Segurado não informado'}
                        </Text>
                        <Text style={styles.cardLinha} numberOfLines={1}>
                          Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                        </Text>
                        <Text style={styles.cardLinha} numberOfLines={1}>
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
    height: ALTURA_ITEM - 8,
  },
  cardSelecionado: {
    borderColor: '#1c3d5a',
    backgroundColor: '#eef4f8',
    marginBottom: 0,
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
