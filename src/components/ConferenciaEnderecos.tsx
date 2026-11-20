import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { atualizarCoordenadaSinistro, type SinistroRoteiro } from '../db/sinistros';
import { mostrarAlerta } from '../utils/alerta';
import {
  conferirEndereco,
  enderecoCompleto,
  enderecoParaBusca,
  TOLERANCIA_CONFERENCIA_KM,
  type ResultadoConferencia,
  type SituacaoConferencia,
} from '../utils/enderecoProcesso';
import type { Coordenada } from '../utils/rota';

interface Props {
  visivel: boolean;
  processos: SinistroRoteiro[];
  onFechar: () => void;
  /** Avisa a tela de roteiros que a coordenada do processo foi corrigida. */
  onCoordenadaCorrigida: (idSinistro: number, coordenada: Coordenada) => void;
}

const APARENCIA: Record<
  SituacaoConferencia,
  { icone: keyof typeof Ionicons.glyphMap; cor: string; fundo: string; titulo: string }
> = {
  ok: { icone: 'checkmark-circle', cor: '#1f8a4c', fundo: '#e8f6ee', titulo: 'Confere' },
  divergente: {
    icone: 'warning',
    cor: '#b7791f',
    fundo: '#fdf6e3',
    titulo: 'Coordenada longe do endereço',
  },
  fora_cidade: {
    icone: 'close-circle',
    cor: '#c0392b',
    fundo: '#fdecea',
    titulo: 'Coordenada fora da cidade',
  },
  sem_coordenada: {
    icone: 'help-circle',
    cor: '#5b6b7a',
    fundo: '#eef1f4',
    titulo: 'Sem coordenada gravada',
  },
  nao_verificado: {
    icone: 'help-circle',
    cor: '#5b6b7a',
    fundo: '#eef1f4',
    titulo: 'Não foi possível conferir',
  },
};

function formatarDistancia(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

function formatarCoordenada(c: Coordenada): string {
  return `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`;
}

function abrirNoMapa(consulta: string) {
  Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`,
  );
}

function explicacao(r: ResultadoConferencia): string {
  switch (r.situacao) {
    case 'ok':
      if (r.corrigida)
        return 'Coordenada corrigida para a posição do endereço. Ela vai para o servidor na próxima transferência do cadastro.';
      return `A coordenada está a ${formatarDistancia(r.distanciaKm ?? 0)} do endereço cadastrado.`;
    case 'divergente':
      return r.distanciaKm != null
        ? `A coordenada está a ${formatarDistancia(r.distanciaKm)} do endereço cadastrado (tolerância de ${TOLERANCIA_CONFERENCIA_KM} km).`
        : 'A coordenada aponta para uma cidade diferente da cadastrada.';
    case 'fora_cidade':
      return 'A coordenada está a mais de 40 km da cidade do processo — provavelmente está errada.';
    case 'sem_coordenada':
      return r.coordenadaEndereco
        ? 'O processo não tem coordenada. O roteiro vai usar o endereço em texto, que o Google Maps localiza.'
        : 'O processo não tem coordenada e o endereço não foi localizado pelo aparelho. Confira o endereço no mapa.';
    case 'nao_verificado':
      return 'O endereço cadastrado não foi localizado pelo aparelho, então não deu pra comparar. Confira a coordenada no mapa.';
  }
}

/**
 * Confere, parada por parada, se a coordenada gravada no processo corresponde ao endereço
 * cadastrado. Mostra pra onde a coordenada aponta e deixa abrir cada um no mapa.
 */
export function ConferenciaEnderecos({
  visivel,
  processos: processosRecebidos,
  onFechar,
  onCoordenadaCorrigida,
}: Props) {
  const insets = useSafeAreaInsets();
  // Lista congelada na abertura: corrigir uma coordenada atualiza a lista da tela de roteiros, e
  // isso não deve reiniciar a conferência das demais paradas.
  const [processos] = useState(processosRecebidos);
  const [resultados, setResultados] = useState<Record<number, ResultadoConferencia>>({});
  const [corrigindo, setCorrigindo] = useState<number | null>(null);

  function pedirCorrecao(item: SinistroRoteiro, r: ResultadoConferencia) {
    const nova = r.coordenadaEndereco;
    if (!nova) return;
    const atual = r.coordenada ? formatarCoordenada(r.coordenada) : 'nenhuma';
    mostrarAlerta(
      'Corrigir coordenada',
      `Substituir a coordenada do processo ${item.nro_sinistro ?? ''} pela posição do endereço cadastrado?\n\n` +
        `Atual: ${atual}\nNova: ${formatarCoordenada(nova)}\n\n` +
        'A nova coordenada vai para o servidor na próxima transferência do cadastro.',
      [
        { text: 'Cancelar' },
        { text: 'Corrigir', onPress: () => corrigir(item, nova) },
      ],
    );
  }

  async function corrigir(item: SinistroRoteiro, nova: Coordenada) {
    setCorrigindo(item.id_sinistro);
    try {
      await atualizarCoordenadaSinistro(item.id_sinistro, nova.latitude, nova.longitude);
      setResultados((atual) => {
        const anterior = atual[item.id_sinistro];
        if (!anterior) return atual;
        return {
          ...atual,
          [item.id_sinistro]: {
            ...anterior,
            situacao: 'ok',
            coordenada: nova,
            distanciaKm: 0,
            enderecoDaCoordenada: null,
            cidadeDiferente: false,
            corrigida: true,
          },
        };
      });
      onCoordenadaCorrigida(item.id_sinistro, nova);
    } catch {
      mostrarAlerta('Erro', 'Não foi possível gravar a nova coordenada.');
    } finally {
      setCorrigindo(null);
    }
  }

  useEffect(() => {
    if (!visivel) return;
    let cancelado = false;

    // Um por vez: o geocoder do aparelho limita requisições seguidas.
    (async () => {
      // A geocodificação reversa pode exigir a permissão de localização no Android. Se for
      // negada, a conferência segue — só o "aponta para" pode vir vazio.
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch {
        // segue sem permissão
      }
      for (const item of processos) {
        if (cancelado) return;
        const resultado = await conferirEndereco(item);
        if (cancelado) return;
        setResultados((atual) => ({ ...atual, [item.id_sinistro]: resultado }));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [visivel, processos]);

  const conferidos = processos.filter((p) => resultados[p.id_sinistro]);
  const comProblema = conferidos.filter((p) =>
    ['divergente', 'fora_cidade'].includes(resultados[p.id_sinistro].situacao),
  ).length;
  const confere = conferidos.filter((p) => resultados[p.id_sinistro].situacao === 'ok').length;
  const terminou = conferidos.length === processos.length;

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
          <Pressable onPress={onFechar} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitulo}>Conferência de endereços</Text>
            <Text style={styles.headerSubtitulo}>
              {terminou
                ? `${confere} conferem · ${comProblema} com problema · ${processos.length - confere - comProblema} sem verificação`
                : `Conferindo ${conferidos.length + 1} de ${processos.length}…`}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.lista}>
          {processos.map((item, indice) => {
            const r = resultados[item.id_sinistro];
            const aparencia = r ? APARENCIA[r.situacao] : null;
            return (
              <View key={item.id_sinistro} style={styles.card}>
                <View style={styles.cardTopo}>
                  <Text style={styles.ordem}>{indice + 1}</Text>
                  <View style={styles.flex1}>
                    <Text style={styles.segurado} numberOfLines={1}>
                      {item.nm_segurado || 'Segurado não informado'}
                    </Text>
                    <Text style={styles.sinistro}>Sinistro {item.nro_sinistro}</Text>
                  </View>
                </View>

                {!r || !aparencia ? (
                  <View style={styles.conferindo}>
                    <ActivityIndicator size="small" color="#1c3d5a" />
                    <Text style={styles.textoSecundario}>Conferindo…</Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.situacao, { backgroundColor: aparencia.fundo }]}>
                      <Ionicons name={aparencia.icone} size={18} color={aparencia.cor} />
                      <Text style={[styles.situacaoTitulo, { color: aparencia.cor }]}>
                        {aparencia.titulo}
                      </Text>
                    </View>
                    <Text style={styles.explicacao}>{explicacao(r)}</Text>

                    <Text style={styles.rotulo}>Endereço cadastrado</Text>
                    <Text style={styles.valor}>
                      {enderecoCompleto(item) || 'Endereço não informado'}
                    </Text>

                    {r.coordenada && (
                      <>
                        <Text style={styles.rotulo}>A coordenada gravada aponta para</Text>
                        <Text style={styles.valor}>
                          {r.enderecoDaCoordenada || 'Endereço não identificado'}
                        </Text>
                        <Text style={styles.textoSecundario}>{formatarCoordenada(r.coordenada)}</Text>
                      </>
                    )}

                    <View style={styles.botoes}>
                      {r.coordenada && (
                        <Pressable
                          style={styles.botao}
                          onPress={() => abrirNoMapa(formatarCoordenada(r.coordenada!))}
                        >
                          <Ionicons name="locate-outline" size={16} color="#1c3d5a" />
                          <Text style={styles.botaoTexto}>Ver coordenada</Text>
                        </Pressable>
                      )}
                      {!!item.endereco?.trim() && (
                        <Pressable
                          style={styles.botao}
                          onPress={() => abrirNoMapa(enderecoParaBusca(item))}
                        >
                          <Ionicons name="home-outline" size={16} color="#1c3d5a" />
                          <Text style={styles.botaoTexto}>Ver endereço</Text>
                        </Pressable>
                      )}
                    </View>
                    {r.situacao !== 'ok' && r.coordenadaEndereco && (
                      <Pressable
                        style={[styles.botaoCorrigir, corrigindo !== null && styles.desabilitado]}
                        disabled={corrigindo !== null}
                        onPress={() => pedirCorrecao(item, r)}
                      >
                        {corrigindo === item.id_sinistro ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="build-outline" size={16} color="#fff" />
                        )}
                        <Text style={styles.botaoCorrigirTexto}>
                          {r.coordenada ? 'Corrigir coordenada pelo endereço' : 'Gravar coordenada do endereço'}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            );
          })}
          <Text style={styles.rodape}>
            A localização do endereço é feita pelo geocoder do aparelho, que às vezes acerta só a
            rua ou o bairro. Use &quot;Ver coordenada&quot; e &quot;Ver endereço&quot; para comparar
            no mapa.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  lista: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  ordem: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1c3d5a',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 26,
    fontWeight: '700',
    fontSize: 13,
  },
  flex1: {
    flex: 1,
  },
  segurado: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  sinistro: {
    fontSize: 12,
    color: '#5b6b7a',
  },
  conferindo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  situacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  situacaoTitulo: {
    fontWeight: '700',
    fontSize: 13,
  },
  explicacao: {
    fontSize: 13,
    color: '#3d4b58',
    marginTop: 8,
  },
  rotulo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8a97a3',
    textTransform: 'uppercase',
    marginTop: 10,
  },
  valor: {
    fontSize: 13,
    color: '#1c3d5a',
    marginTop: 2,
  },
  textoSecundario: {
    fontSize: 12,
    color: '#8a97a3',
  },
  botoes: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#c2ccd6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  botaoTexto: {
    color: '#1c3d5a',
    fontSize: 13,
    fontWeight: '600',
  },
  botaoCorrigir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1c3d5a',
    borderRadius: 6,
    paddingVertical: 9,
    marginTop: 8,
  },
  botaoCorrigirTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  desabilitado: {
    opacity: 0.5,
  },
  rodape: {
    fontSize: 12,
    color: '#8a97a3',
    textAlign: 'center',
    marginTop: 4,
  },
});
