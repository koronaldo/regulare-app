import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { captureScreen } from 'react-native-view-shot';
import { Directory, Paths } from 'expo-file-system';

import { Secao } from '../../../src/components/form/Secao';
import { inserirFoto } from '../../../src/db/fotos';
import { buscarSinistroPorId, type SinistroDetalhe } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { reduzImagem } from '../../../src/utils/imagem';

function diretorioFotos(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'Fotos');
}

/** Porta de getDms (definicoes.js). */
function paraGrauMinutoSegundo(valor: number): string {
  const val = Math.abs(valor);
  const grau = Math.floor(val);
  const minuto = Math.floor((val - grau) * 60);
  const segundo = Math.round((val - grau - minuto / 60) * 3600 * 1000) / 1000;
  return `${grau}° ${minuto}' ${segundo}" `;
}

/** Porta de ddToDms (definicoes.js). */
function paraCoordenadasGrau(lat: number, lng: number): { latitude: string; longitude: string } {
  return {
    latitude: (lat >= 0 ? 'N => ' : 'S => ') + paraGrauMinutoSegundo(lat),
    longitude: (lng >= 0 ? 'L => ' : 'O => ') + paraGrauMinutoSegundo(lng),
  };
}

export default function CoordenadasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const { width: larguraTela, height: alturaTela } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [sinistro, setSinistro] = useState<SinistroDetalhe | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [erroLocalizacao, setErroLocalizacao] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const buscarLocalizacao = useCallback(async () => {
    setErroLocalizacao(null);
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (!permissao.granted) {
        setErroLocalizacao('Permissão de localização não concedida.');
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude });
    } catch {
      setErroLocalizacao('Erro identificando o local. Verifique se o GPS está ativado.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [dados] = await Promise.all([buscarSinistroPorId(idSinistro), buscarLocalizacao()]);
          if (cancelado) return;
          setSinistro(dados);
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      carregar();
      return () => {
        cancelado = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idSinistro]),
  );

  async function enviarParaAlbum() {
    setEnviando(true);
    try {
      const capturaUri = await captureScreen({ format: 'jpg', quality: 0.9 });
      const arquivo = await reduzImagem(capturaUri, larguraTela, alturaTela, diretorioFotos(idSinistro), 'gps');
      await inserirFoto(idSinistro, {
        arquivo,
        legenda: 'Imagem GPS',
        posicao: alturaTela >= larguraTela ? 'R' : 'P',
      });
      mostrarAlerta('Sucesso', 'Foto inserida no álbum com sucesso!');
    } catch {
      mostrarAlerta('Erro', 'Erro ao enviar a captura para o álbum.');
    } finally {
      setEnviando(false);
    }
  }

  function voltar() {
    router.back();
  }

  if (carregando) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#1c3d5a" />
        <Text style={styles.textoAguarde}>Aguarde identificando o local...</Text>
      </View>
    );
  }

  const grau = coords ? paraCoordenadasGrau(coords.latitude, coords.longitude) : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo} numberOfLines={1}>
            {sinistro?.nm_segurado || '-'}
          </Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {sinistro?.nro_sinistro}
          </Text>
        </View>
      </View>

      <View style={styles.conteudo}>
        <Secao titulo="Localização e Coordenadas do Sinistro">
          <Text style={styles.rotulo}>Seguradora</Text>
          <Text style={styles.valor}>{sinistro?.nm_seguradora || '-'}</Text>

          <Text style={styles.rotulo}>Segurado</Text>
          <Text style={styles.valor}>{sinistro?.nm_segurado || '-'}</Text>

          <Text style={styles.rotulo}>Endereço</Text>
          <Text style={styles.valor}>
            {sinistro?.endereco || '-'} {sinistro?.bairro || ''}
          </Text>

          <View style={styles.linhaDupla}>
            <View style={styles.colunaDupla}>
              <Text style={styles.rotulo}>Nº Sinistro</Text>
              <Text style={styles.valor}>{sinistro?.nro_sinistro || '-'}</Text>
            </View>
            <View style={styles.colunaDupla}>
              <Text style={styles.rotulo}>Apólice</Text>
              <Text style={styles.valor}>{sinistro?.apolice || '-'}</Text>
            </View>
          </View>

          <Text style={styles.rotulo}>Cidade</Text>
          <Text style={styles.valor}>
            {sinistro?.nm_cidade || '-'} / {sinistro?.id_estado || '-'}
          </Text>

          <View style={styles.divisor} />

          <Text style={styles.rotulo}>Coordenadas Google</Text>
          {erroLocalizacao ? (
            <Text style={styles.textoErro}>{erroLocalizacao}</Text>
          ) : coords ? (
            <>
              <Text style={styles.valor}>Latitude: {coords.latitude}</Text>
              <Text style={styles.valor}>Longitude: {coords.longitude}</Text>
            </>
          ) : (
            <ActivityIndicator color="#1c3d5a" style={styles.spinnerInline} />
          )}

          {grau && (
            <>
              <Text style={styles.rotulo}>Coordenadas em Grau</Text>
              <Text style={styles.valor}>{grau.latitude}</Text>
              <Text style={styles.valor}>{grau.longitude}</Text>
            </>
          )}

          {erroLocalizacao && (
            <Pressable style={styles.botaoTentarNovamente} onPress={buscarLocalizacao}>
              <Ionicons name="refresh" size={16} color="#1c3d5a" />
              <Text style={styles.botaoTentarNovamenteTexto}>Tentar novamente</Text>
            </Pressable>
          )}
        </Secao>
      </View>

      <View style={[styles.rodape, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={[styles.botaoRodape, styles.botaoNeutro]} onPress={voltar}>
          <Ionicons name="chevron-back" size={20} color="#1c3d5a" />
          <Text style={styles.botaoRodapeTexto}>Anterior</Text>
        </Pressable>
        <Pressable
          style={[styles.botaoRodape, styles.botaoPrimario, enviando && styles.botaoDesabilitado]}
          onPress={enviarParaAlbum}
          disabled={enviando}
        >
          {enviando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.botaoRodapePrimarioTexto}>Enviar para Álbum</Text>
            </>
          )}
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
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f6f8',
    gap: 12,
  },
  textoAguarde: {
    color: '#2a88ad',
    fontWeight: '600',
    fontSize: 13,
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontSize: 13,
    marginTop: 2,
  },
  conteudo: {
    flex: 1,
    padding: 16,
  },
  rotulo: {
    fontSize: 11,
    color: '#8a97a3',
    textTransform: 'uppercase',
    marginTop: 10,
  },
  valor: {
    fontSize: 14,
    color: '#1c3d5a',
    fontWeight: '600',
  },
  linhaDupla: {
    flexDirection: 'row',
    gap: 24,
  },
  colunaDupla: {
    flex: 1,
  },
  divisor: {
    height: 1,
    backgroundColor: '#dde3e8',
    marginVertical: 14,
  },
  textoErro: {
    color: '#d32f2f',
    fontSize: 13,
    marginTop: 4,
  },
  spinnerInline: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  botaoTentarNovamente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#eef2f5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  botaoTentarNovamenteTexto: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 13,
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e6e9ec',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  botaoRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  botaoNeutro: {
    backgroundColor: '#eef2f5',
  },
  botaoPrimario: {
    flex: 1,
    backgroundColor: '#1c3d5a',
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  botaoRodapeTexto: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 13,
  },
  botaoRodapePrimarioTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
