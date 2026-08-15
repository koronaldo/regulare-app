import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { listarSinistrosParaRoteiro, type SinistroRoteiro } from '../src/db/sinistros';
import { mostrarAlerta } from '../src/utils/alerta';
import { montarUrlGoogleMaps, ordenarPorProximidade, type Coordenada } from '../src/utils/rota';

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
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [montando, setMontando] = useState(false);

  useEffect(() => {
    if (!codregNum) return;
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      try {
        const lista = await listarSinistrosParaRoteiro(codregNum);
        if (!cancelado) setProcessos(lista);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [codregNum]);

  function alternarSelecao(idSinistro: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(idSinistro)) novo.delete(idSinistro);
      else novo.add(idSinistro);
      return novo;
    });
  }

  async function montarRoteiro() {
    const escolhidos = processos.filter((p) => selecionados.has(p.id_sinistro));
    if (escolhidos.length === 0) {
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

      const pontos: (Coordenada & { label: string })[] = [];
      const falhas: string[] = [];

      for (const item of escolhidos) {
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
          pontos.push({
            latitude: resultados[0].latitude,
            longitude: resultados[0].longitude,
            label: item.nm_segurado || item.nro_sinistro || endereco,
          });
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

      const ordenados = ordenarPorProximidade(origem, pontos);
      const url = montarUrlGoogleMaps(origem, ordenados);

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
    <View style={styles.container}>
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
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {processos.length === 0 && (
            <View style={styles.centro}>
              <Ionicons name="map-outline" size={40} color="#c2ccd6" />
              <Text style={styles.vazioTexto}>Nenhum processo pendente de vistoria.</Text>
            </View>
          )}

          {processos.map((item) => {
            const selecionado = selecionados.has(item.id_sinistro);
            return (
              <Pressable
                key={item.id_sinistro}
                style={[styles.card, selecionado && styles.cardSelecionado]}
                onPress={() => alternarSelecao(item.id_sinistro)}
              >
                <Switch
                  value={selecionado}
                  onValueChange={() => alternarSelecao(item.id_sinistro)}
                  trackColor={{ true: '#1c3d5a' }}
                />
                <View style={styles.cardTexto}>
                  <Text style={styles.cardSegurado} numberOfLines={1}>
                    {item.nm_segurado || 'Segurado não informado'}
                  </Text>
                  <Text style={styles.cardLinha}>
                    Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                  </Text>
                  <Text style={styles.cardLinha} numberOfLines={2}>
                    {enderecoCompleto(item) || 'Endereço não informado'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e3e8ed',
  },
  cardSelecionado: {
    borderColor: '#1c3d5a',
    backgroundColor: '#eef4f8',
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
