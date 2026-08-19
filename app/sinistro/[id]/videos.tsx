import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'react-native-compressor';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Directory, File, Paths } from 'expo-file-system';

import { Campo } from '../../../src/components/form/Campo';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao } from '../../../src/components/form/Selecao';
import {
  excluirVideo,
  inserirVideo,
  listarLegendas,
  listarVideos,
  renomearVideo,
  type LegendaVideo,
  type VideoResumo,
} from '../../../src/db/videos';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { transferirVideoUnico } from '../../../src/services/transferenciaVideos';
import { mostrarAlerta } from '../../../src/utils/alerta';

function diretorioVideos(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'Videos');
}

/** Porta de CompactaVideo (capturavideo_def_cam.js): comprime o vídeo antes de gravar no app. */
async function processarVideo(uri: string, idSinistro: number, aoProgredir: (p: number) => void): Promise<string> {
  const comprimidoPath = await Video.compress(
    uri,
    { compressionMethod: 'auto' },
    (progresso) => aoProgredir(Math.round(progresso * 100)),
  );
  const comprimidoUri = comprimidoPath.startsWith('file://') ? comprimidoPath : `file://${comprimidoPath}`;

  const dir = diretorioVideos(idSinistro);
  if (!dir.exists) dir.create({ intermediates: true });
  const destino = new File(dir, `video_${Date.now()}.mp4`);
  await new File(comprimidoUri).move(destino);
  return destino.uri;
}

interface EstadoComplemento {
  legenda: LegendaVideo;
  uri: string;
  texto: string;
}

export default function VideosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [legendas, setLegendas] = useState<LegendaVideo[]>([]);
  const [idLegendaSelecionada, setIdLegendaSelecionada] = useState('');
  const [videos, setVideos] = useState<VideoResumo[]>([]);
  const [modo, setModo] = useState<'slide' | 'grade'>('slide');
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [complemento, setComplemento] = useState<EstadoComplemento | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [miniaturas, setMiniaturas] = useState<Record<number, string>>({});
  const [enviandoVideo, setEnviandoVideo] = useState(false);

  const videoAtual = videos[indiceAtual] ?? null;
  const player = useVideoPlayer(null);

  useEffect(() => {
    if (modo !== 'grade') return;
    let cancelado = false;

    async function gerarMiniaturas() {
      for (const video of videos) {
        if (cancelado || miniaturas[video.id_video]) continue;
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(video.arquivo, { time: 1000, quality: 0.5 });
          if (!cancelado) setMiniaturas((atual) => ({ ...atual, [video.id_video]: uri }));
        } catch {
          // sem preview disponível pra esse vídeo, mantém o ícone padrão
        }
      }
    }

    gerarMiniaturas();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, videos]);

  useEffect(() => {
    if (videoAtual) {
      player.replaceAsync(videoAtual.arquivo);
    }
  }, [videoAtual?.id_video, player]);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, listaLegendas, listaVideos] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            listarLegendas(idSinistro),
            listarVideos(idSinistro),
          ]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setLegendas(listaLegendas);
          setVideos(listaVideos);
          setIndiceAtual((atual) => Math.min(atual, Math.max(0, listaVideos.length - 1)));
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      carregar();
      return () => {
        cancelado = true;
      };
    }, [idSinistro]),
  );

  async function recarregar() {
    const lista = await listarVideos(idSinistro);
    setVideos(lista);
    return lista;
  }

  function iniciarCaptura() {
    if (!idLegendaSelecionada) {
      mostrarAlerta('Atenção', 'Informe a legenda antes de gravar o vídeo.');
      return;
    }
    mostrarAlerta('Novo vídeo', 'Como deseja obter o vídeo?', [
      { text: 'Cancelar' },
      { text: 'Gravar Vídeo', onPress: gravarVideo },
      { text: 'Escolher da Galeria', onPress: escolherDaGaleria },
    ]);
  }

  async function gravarVideo() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      mostrarAlerta('Permissão necessária', 'Autorize o uso da câmera para gravar vídeos.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: 'videos', videoMaxDuration: 60 });
    processarResultadoPicker(resultado);
  }

  async function escolherDaGaleria() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      mostrarAlerta('Permissão necessária', 'Autorize o acesso aos vídeos.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos' });
    processarResultadoPicker(resultado);
  }

  function processarResultadoPicker(resultado: ImagePicker.ImagePickerResult) {
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];
    const legenda = legendas.find((l) => String(l.id_legendaf) === idLegendaSelecionada);
    if (!legenda) return;

    if (legenda.tipo_leg === 'FX') {
      finalizarVideo(asset.uri, legenda.nm_legendaf);
    } else {
      setComplemento({ legenda, uri: asset.uri, texto: '' });
    }
  }

  async function confirmarComplemento() {
    if (!complemento) return;
    if (!complemento.texto.trim()) {
      mostrarAlerta('Campo obrigatório', 'Informe o complemento da legenda.');
      return;
    }
    const legendaFinal =
      complemento.legenda.tipo_leg === 'FC'
        ? `${complemento.legenda.nm_legendaf} ${complemento.texto.trim()}`
        : complemento.texto.trim();
    const { uri } = complemento;
    setComplemento(null);
    await finalizarVideo(uri, legendaFinal);
  }

  async function finalizarVideo(uri: string, legendaFinal: string) {
    setProcessando(true);
    setProgresso(0);
    try {
      const arquivo = await processarVideo(uri, idSinistro, setProgresso);
      await inserirVideo(idSinistro, { arquivo, legenda: legendaFinal });
      const lista = await recarregar();
      setIndiceAtual(Math.max(0, lista.length - 1));
      setModo('slide');
    } catch {
      mostrarAlerta('Erro', 'Erro ao salvar o vídeo.');
    } finally {
      setProcessando(false);
    }
  }

  function enviarVideoIndividual(video: VideoResumo) {
    if (video.situacao === 'E') {
      mostrarAlerta('Vídeo já enviado', 'Este vídeo já foi enviado ao servidor antes. Deseja enviar novamente?', [
        { text: 'Cancelar' },
        { text: 'Enviar novamente', onPress: () => executarEnvioVideo(video) },
      ]);
      return;
    }
    executarEnvioVideo(video);
  }

  async function executarEnvioVideo(video: VideoResumo) {
    setEnviandoVideo(true);
    try {
      const resultado = await transferirVideoUnico(idSinistro, video.id_video);
      mostrarAlerta(resultado.sucesso ? 'Sucesso' : 'Erro ao enviar', resultado.mensagem);
      if (resultado.sucesso) await recarregar();
    } finally {
      setEnviandoVideo(false);
    }
  }

  function navegar(delta: number) {
    setIndiceAtual((atual) => {
      const novo = atual + delta;
      if (novo < 0) {
        mostrarAlerta('Álbum', 'Início do Álbum');
        return atual;
      }
      if (novo >= videos.length) {
        mostrarAlerta('Álbum', 'Final do Álbum');
        return atual;
      }
      return novo;
    });
  }

  async function confirmarRenomear() {
    if (renomeando === null || !videoAtual) return;
    await renomearVideo(videoAtual.id_video, renomeando.trim());
    await recarregar();
    setRenomeando(null);
  }

  function confirmarExclusao(video: VideoResumo) {
    mostrarAlerta('Remover vídeo do dispositivo?', video.legenda || 'Vídeo sem legenda', [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            const arquivo = new File(video.arquivo);
            if (arquivo.exists) arquivo.delete();
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirVideo(video.id_video);
          const lista = await recarregar();
          setIndiceAtual((atual) => Math.max(0, Math.min(atual, lista.length - 1)));
        },
      },
    ]);
  }

  function abrirNaSlide(indice: number) {
    setIndiceAtual(indice);
    setModo('slide');
  }

  function voltar() {
    router.back();
  }

  const opcoesLegenda = legendas.map((l) => ({ valor: String(l.id_legendaf), label: l.nm_legendaf }));

  if (carregando) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#1c3d5a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo}>Vídeos e Áudios</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoVoltar}
        >
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]/transferencia', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoVoltar}
        >
          <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.segmentado}>
        <Pressable style={[styles.segmentoBotao, modo === 'slide' && styles.segmentoBotaoAtivo]} onPress={() => setModo('slide')}>
          <Ionicons name="play-circle-outline" size={16} color={modo === 'slide' ? '#fff' : '#1c3d5a'} />
          <Text style={[styles.segmentoTexto, modo === 'slide' && styles.segmentoTextoAtivo]}>Ver Vídeos</Text>
        </Pressable>
        <Pressable style={[styles.segmentoBotao, modo === 'grade' && styles.segmentoBotaoAtivo]} onPress={() => setModo('grade')}>
          <Ionicons name="grid-outline" size={16} color={modo === 'grade' ? '#fff' : '#1c3d5a'} />
          <Text style={[styles.segmentoTexto, modo === 'grade' && styles.segmentoTextoAtivo]}>Lista</Text>
        </Pressable>
      </View>

      <View style={styles.barraLegenda}>
        <View style={styles.campoLegenda}>
          <Selecao label="Legenda" valor={idLegendaSelecionada} opcoes={opcoesLegenda} onChange={setIdLegendaSelecionada} obrigatorio />
        </View>
        <Pressable style={[styles.botaoCapturar, processando && styles.botaoDesabilitado]} onPress={iniciarCaptura} disabled={processando}>
          {processando ? <ActivityIndicator color="#fff" /> : <Ionicons name="videocam" size={22} color="#fff" />}
        </Pressable>
      </View>

      {processando && (
        <Text style={styles.textoProgresso}>Compactando vídeo... {progresso}%</Text>
      )}

      {complemento && (
        <Secao titulo="Complemento da legenda" style={styles.secaoComplemento}>
          <Campo
            label={complemento.legenda.nm_legendaf}
            obrigatorio
            value={complemento.texto}
            onChangeText={(v) => setComplemento((atual) => (atual ? { ...atual, texto: v } : atual))}
          />
          <View style={styles.linhaBotoesForm}>
            <Pressable style={styles.botaoCancelar} onPress={() => setComplemento(null)}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.botaoSalvar, styles.botaoSalvarForm]} onPress={confirmarComplemento}>
              <Text style={styles.botaoSalvarTexto}>Confirmar</Text>
            </Pressable>
          </View>
        </Secao>
      )}

      {!complemento && modo === 'grade' && (
        <FlatList
          data={videos}
          numColumns={3}
          keyExtractor={(item) => String(item.id_video)}
          contentContainerStyle={styles.conteudo}
          ListEmptyComponent={<Text style={styles.vazioTexto}>Nenhum vídeo registrado!!!</Text>}
          renderItem={({ item, index }) => (
            <Pressable style={styles.celulaGrade} onPress={() => abrirNaSlide(index)}>
              {miniaturas[item.id_video] ? (
                <Image source={{ uri: miniaturas[item.id_video] }} style={styles.miniaturaImagem} />
              ) : (
                <Ionicons name="videocam" size={32} color="#1c3d5a" />
              )}
              <Text style={styles.miniaturaLegenda} numberOfLines={2}>
                {item.legenda || '...'}
              </Text>
            </Pressable>
          )}
        />
      )}

      {!complemento && modo === 'slide' && (
        <View style={styles.slideContainer}>
          {videoAtual ? (
            <>
              <Text style={styles.contador}>
                {indiceAtual + 1}/{videos.length} · {videoAtual.situacao === 'E' ? 'Enviado' : 'Não enviado'}
              </Text>
              <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />

              {renomeando !== null ? (
                <View style={styles.linhaRenomear}>
                  <Campo label="Legenda" value={renomeando} onChangeText={setRenomeando} />
                  <View style={styles.linhaBotoesForm}>
                    <Pressable style={styles.botaoCancelar} onPress={() => setRenomeando(null)}>
                      <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
                    </Pressable>
                    <Pressable style={[styles.botaoSalvar, styles.botaoSalvarForm]} onPress={confirmarRenomear}>
                      <Text style={styles.botaoSalvarTexto}>Salvar Legenda</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => setRenomeando(videoAtual.legenda)}>
                  <Text style={styles.legendaTexto}>{videoAtual.legenda || '...'}</Text>
                </Pressable>
              )}

              <View style={styles.acoesSlide}>
                <Pressable style={styles.botaoIcone} onPress={() => navegar(-1)} disabled={indiceAtual <= 0}>
                  <Ionicons name="chevron-back-circle-outline" size={32} color={indiceAtual <= 0 ? '#c2ccd6' : '#1c3d5a'} />
                </Pressable>
                <Pressable style={styles.botaoIcone} onPress={() => enviarVideoIndividual(videoAtual)} disabled={enviandoVideo}>
                  {enviandoVideo ? (
                    <ActivityIndicator size="small" color="#1c3d5a" />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={26} color="#1c3d5a" />
                  )}
                </Pressable>
                <Pressable style={styles.botaoIcone} onPress={() => confirmarExclusao(videoAtual)}>
                  <Ionicons name="trash-outline" size={26} color="#d32f2f" />
                </Pressable>
                <Pressable style={styles.botaoIcone} onPress={() => navegar(1)} disabled={indiceAtual >= videos.length - 1}>
                  <Ionicons
                    name="chevron-forward-circle-outline"
                    size={32}
                    color={indiceAtual >= videos.length - 1 ? '#c2ccd6' : '#1c3d5a'}
                  />
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.vazioTexto}>Nenhum vídeo registrado!!!</Text>
          )}
        </View>
      )}
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
  segmentado: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segmentoBotao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#eef2f5',
  },
  segmentoBotaoAtivo: {
    backgroundColor: '#1c3d5a',
  },
  segmentoTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  segmentoTextoAtivo: {
    color: '#fff',
  },
  barraLegenda: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  campoLegenda: {
    flex: 1,
  },
  botaoCapturar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1c3d5a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  textoProgresso: {
    textAlign: 'center',
    color: '#8a97a3',
    fontSize: 12,
    marginTop: 6,
  },
  secaoComplemento: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  conteudo: {
    padding: 10,
  },
  celulaGrade: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  miniaturaImagem: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  miniaturaLegenda: {
    fontSize: 11,
    color: '#1c3d5a',
    textAlign: 'center',
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  slideContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  contador: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2a88ad',
    marginBottom: 8,
  },
  video: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 8,
  },
  legendaTexto: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1c3d5a',
    textAlign: 'center',
    marginVertical: 10,
  },
  linhaRenomear: {
    width: '100%',
    marginTop: 10,
  },
  acoesSlide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 10,
  },
  botaoIcone: {
    padding: 6,
  },
  linhaBotoesForm: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  botaoCancelar: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#eef2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoCancelarTexto: {
    color: '#5a6672',
    fontWeight: '700',
    fontSize: 14,
  },
  botaoSalvar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 14,
  },
  botaoSalvarForm: {
    flex: 1,
  },
  botaoSalvarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
