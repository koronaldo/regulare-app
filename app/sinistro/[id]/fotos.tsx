import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraxProvider, SortableContainer, SortableItem, useSortableList } from 'react-native-drax';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

import { Campo } from '../../../src/components/form/Campo';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao } from '../../../src/components/form/Selecao';
import {
  atualizarArquivoFoto,
  excluirFoto,
  inserirFoto,
  listarFotos,
  listarLegendas,
  reordenarFotos,
  renomearFoto,
  type FotoResumo,
  type LegendaFoto,
  legendaPedeComplemento,
  normalizarTipoLegenda,
} from '../../../src/db/fotos';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { transferirFotoUnica } from '../../../src/services/transferenciaFotos';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { reduzImagem } from '../../../src/utils/imagem';
import {
  lerFotoPendente,
  limparFotoPendente,
  salvarFotoPendente,
} from '../../../src/services/fotoPendente';

const NUM_COLUNAS_GRADE = 4;

function diretorioFotos(idSinistro: number): Directory {
  const dir = new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'Fotos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Reduz e comprime a foto antes de gravar no app. Delega pro reduzImagem compartilhado (que usa
 * react-native-compressor): esta tela tinha uma cópia própria baseada em expo-image-manipulator,
 * que decodificava o bitmap inteiro e estourava o heap do aparelho com fotos de câmera — era o
 * que fechava o app ao salvar a foto.
 */
async function processarImagem(
  uri: string,
  idSinistro: number,
  largura: number,
  altura: number,
): Promise<string> {
  return reduzImagem(uri, largura, altura, diretorioFotos(idSinistro), 'foto');
}

interface EstadoComplemento {
  legenda: LegendaFoto;
  uri: string;
  largura: number;
  altura: number;
  texto: string;
}

export default function FotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();
  const { width: larguraTela } = useWindowDimensions();
  const larguraPagina = larguraTela - 32;
  const tamanhoMiniatura = (larguraTela - 10 * 2) / NUM_COLUNAS_GRADE - 8;
  const listaSlideRef = useRef<FlatList<FotoResumo>>(null);
  const listaGradeRef = useRef<FlatList<FotoResumo>>(null);

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [legendas, setLegendas] = useState<LegendaFoto[]>([]);
  const [idLegendaSelecionada, setIdLegendaSelecionada] = useState('');
  const [fotos, setFotos] = useState<FotoResumo[]>([]);
  const [modo, setModo] = useState<'grade' | 'slide'>('slide');
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [processando, setProcessando] = useState(false);
  const [complemento, setComplemento] = useState<EstadoComplemento | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  /** Garante que a recuperação da foto pendente seja tentada uma vez só por montagem da tela. */
  const recuperacaoTentada = useRef(false);

  const sortable = useSortableList({
    data: fotos,
    numColumns: NUM_COLUNAS_GRADE,
    keyExtractor: (item) => String(item.id_foto),
    onReorder: ({ data }) => salvarNovaOrdem(data),
  });

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, listaLegendas, listaFotos] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            listarLegendas(idSinistro),
            listarFotos(idSinistro),
          ]);
          if (cancelado) return;

          if (sinistro)
            setCabecalho({
              segurado: sinistro.nm_segurado ?? '',
              sinistro: sinistro.nro_sinistro ?? '',
            });
          setLegendas(listaLegendas);
          setFotos(listaFotos);
          setIndiceAtual((atual) => Math.min(atual, Math.max(0, listaFotos.length - 1)));
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

  async function recarregarFotos() {
    const lista = await listarFotos(idSinistro);
    setFotos(lista);
    return lista;
  }

  async function capturarDaCamera() {
    if (!idLegendaSelecionada) {
      mostrarAlerta('Atenção', 'Informe a legenda antes de tirar a foto.');
      return;
    }
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      mostrarAlerta('Permissão necessária', 'Autorize o uso da câmera para tirar fotos.');
      return;
    }
    // O Android pode destruir esta tela enquanto a câmera está aberta: a legenda escolhida fica
    // guardada fora da memória do processo pra foto não se perder na volta.
    await salvarFotoPendente({ idSinistro, idLegenda: idLegendaSelecionada });
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    await limparFotoPendente();
    await processarResultadoPicker(resultado);
  }

  async function escolherDaGaleria() {
    if (!idLegendaSelecionada) {
      mostrarAlerta('Atenção', 'Informe a legenda antes de escolher a foto.');
      return;
    }
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      mostrarAlerta('Permissão necessária', 'Autorize o acesso às fotos.');
      return;
    }
    await salvarFotoPendente({ idSinistro, idLegenda: idLegendaSelecionada });
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.9,
    });
    await limparFotoPendente();
    await processarResultadoPicker(resultado);
  }

  async function processarResultadoPicker(
    resultado: ImagePicker.ImagePickerResult,
    legendaForcada?: LegendaFoto,
  ) {
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];
    const legenda =
      legendaForcada ?? legendas.find((l) => String(l.id_legendaf) === idLegendaSelecionada);
    if (!legenda) return;

    if (!legendaPedeComplemento(legenda.tipo_leg)) {
      // Legenda fixa (FX, ou qualquer valor que não seja FC/SC): grava direto com o nome dela.
      await finalizarFoto(asset.uri, asset.width, asset.height, legenda.nm_legendaf);
    } else {
      setComplemento({
        legenda,
        uri: asset.uri,
        largura: asset.width,
        altura: asset.height,
        texto: '',
      });
    }
  }

  /**
   * Se o Android destruiu esta tela enquanto a câmera estava aberta (acontece por pressão de
   * memória), a foto tirada não volta pelo launchCameraAsync() original — que nunca retorna — e
   * sim por getPendingResultAsync() na remontagem. Sem isso a foto é perdida, e pro usuário
   * parece que "o app fechou e sumiu tudo". Ver a nota sobre MainActivity na doc do expo-image-picker.
   */
  useEffect(() => {
    if (legendas.length === 0 || recuperacaoTentada.current) return;
    recuperacaoTentada.current = true;

    async function recuperarFotoPendente() {
      const pendente = await lerFotoPendente();
      if (!pendente || pendente.idSinistro !== idSinistro) return;
      await limparFotoPendente();

      const resultado = await ImagePicker.getPendingResultAsync();
      if (!resultado || 'code' in resultado) return;

      const legenda = legendas.find((l) => String(l.id_legendaf) === pendente.idLegenda);
      if (!legenda) return;

      setIdLegendaSelecionada(pendente.idLegenda);
      await processarResultadoPicker(resultado, legenda);
    }

    recuperarFotoPendente();
    // processarResultadoPicker fica de fora de propósito: ela é recriada a cada render, e a ref
    // acima já garante que a recuperação roda uma única vez por montagem da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legendas, idSinistro]);

  async function confirmarComplemento() {
    if (!complemento) return;
    if (!complemento.texto.trim()) {
      mostrarAlerta('Campo obrigatório', 'Informe o complemento da legenda.');
      return;
    }
    const legendaFinal =
      normalizarTipoLegenda(complemento.legenda.tipo_leg) === 'FC'
        ? `${complemento.legenda.nm_legendaf} - ${complemento.texto.trim()}`
        : complemento.texto.trim();
    const { uri, largura, altura } = complemento;
    setComplemento(null);
    await finalizarFoto(uri, largura, altura, legendaFinal);
  }

  async function finalizarFoto(uri: string, largura: number, altura: number, legendaFinal: string) {
    setProcessando(true);
    try {
      const posicao: 'R' | 'P' = largura <= altura ? 'R' : 'P';
      const arquivoFinal = await processarImagem(uri, idSinistro, largura, altura);
      await inserirFoto(idSinistro, { arquivo: arquivoFinal, legenda: legendaFinal, posicao });
      const lista = await recarregarFotos();
      setIndiceAtual(Math.max(0, lista.length - 1));
      setModo('slide');
    } catch {
      mostrarAlerta('Erro', 'Erro ao salvar a foto.');
    } finally {
      setProcessando(false);
    }
  }

  async function girarFoto(foto: FotoResumo) {
    setProcessando(true);
    try {
      const renderizada = await ImageManipulator.manipulate(foto.arquivo).rotate(90).renderAsync();
      const resultado = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      const dir = diretorioFotos(idSinistro);
      const destino = new File(dir, `foto_${Date.now()}.jpg`);
      await new File(resultado.uri).move(destino);

      const novaPosicao: 'R' | 'P' = resultado.width <= resultado.height ? 'R' : 'P';
      await atualizarArquivoFoto(foto.id_foto, destino.uri, novaPosicao);
      try {
        const antigo = new File(foto.arquivo);
        if (antigo.exists) antigo.delete();
      } catch {
        // best-effort: se o arquivo antigo já não existir, ignora
      }
      await recarregarFotos();
    } catch {
      mostrarAlerta('Erro', 'Erro ao girar a foto.');
    } finally {
      setProcessando(false);
    }
  }

  function enviarFotoIndividual(foto: FotoResumo) {
    if (foto.situacao === 'E') {
      mostrarAlerta(
        'Foto já enviada',
        'Esta foto já foi enviada ao servidor antes. Deseja enviar novamente?',
        [
          { text: 'Cancelar' },
          { text: 'Enviar novamente', onPress: () => executarEnvioFoto(foto) },
        ],
      );
      return;
    }
    executarEnvioFoto(foto);
  }

  async function executarEnvioFoto(foto: FotoResumo) {
    setEnviandoFoto(true);
    try {
      const resultado = await transferirFotoUnica(idSinistro, foto.id_foto);
      mostrarAlerta(resultado.sucesso ? 'Sucesso' : 'Erro ao enviar', resultado.mensagem);
      if (resultado.sucesso) await recarregarFotos();
    } finally {
      setEnviandoFoto(false);
    }
  }

  function navegar(delta: number) {
    setIndiceAtual((atual) => {
      const novo = atual + delta;
      if (novo < 0) {
        mostrarAlerta('Álbum', 'Início do Álbum');
        return atual;
      }
      if (novo >= fotos.length) {
        mostrarAlerta('Álbum', 'Final do Álbum');
        return atual;
      }
      return novo;
    });
  }

  function aoRolarSlide(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    const indice = Math.round(evento.nativeEvent.contentOffset.x / larguraPagina);
    if (indice >= 0 && indice < fotos.length && indice !== indiceAtual) {
      setIndiceAtual(indice);
    }
  }

  // Mantém o slide (arrasto com o dedo) sincronizado quando o índice muda pelos botões,
  // pela grade de reordenar ou após excluir/girar uma foto.
  useEffect(() => {
    if (modo === 'slide' && fotos.length > 0) {
      listaSlideRef.current?.scrollToIndex({ index: indiceAtual, animated: true });
    }
  }, [indiceAtual, modo, fotos.length, larguraPagina]);

  async function confirmarRenomear() {
    const fotoAtual = fotos[indiceAtual];
    if (renomeando === null || !fotoAtual) return;
    await renomearFoto(fotoAtual.id_foto, renomeando.trim());
    await recarregarFotos();
    setRenomeando(null);
  }

  function confirmarExclusaoFoto(foto: FotoResumo) {
    mostrarAlerta('Remover foto do dispositivo?', foto.legenda || 'Foto sem legenda', [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            const arquivo = new File(foto.arquivo);
            if (arquivo.exists) arquivo.delete();
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirFoto(foto.id_foto);
          const lista = await recarregarFotos();
          setIndiceAtual((atual) => Math.max(0, Math.min(atual, lista.length - 1)));
        },
      },
    ]);
  }

  async function salvarNovaOrdem(novaLista: FotoResumo[]) {
    setFotos(novaLista);
    await reordenarFotos(
      idSinistro,
      novaLista.map((f) => f.id_foto),
    );
  }

  function abrirNaGrade(foto: FotoResumo) {
    const indice = fotos.findIndex((f) => f.id_foto === foto.id_foto);
    if (indice >= 0) setIndiceAtual(indice);
    setModo('slide');
  }

  function voltar() {
    router.back();
  }

  function irParaControle() {
    router.push({ pathname: '/sinistro/[id]', params: { id: String(idSinistro) } });
  }

  const opcoesLegenda = legendas.map((l) => ({
    valor: String(l.id_legendaf),
    label: l.nm_legendaf,
  }));
  const fotoAtual = fotos[indiceAtual] ?? null;

  if (carregando) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#1c3d5a" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <DraxProvider>
        <StatusBar style="light" />

        <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
          <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitulo}>Álbum de Fotos</Text>
            <Text style={styles.headerSubtitulo} numberOfLines={1}>
              {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
            </Text>
          </View>
          <Pressable onPress={irParaControle} hitSlop={10} style={styles.botaoControle}>
            <Ionicons name="grid-outline" size={22} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/sinistro/[id]/transferencia',
                params: { id: String(idSinistro) },
              })
            }
            hitSlop={10}
            style={styles.botaoControle}
          >
            <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.segmentado}>
            <Pressable
              style={[styles.segmentoBotao, modo === 'slide' && styles.segmentoBotaoAtivo]}
              onPress={() => setModo('slide')}
            >
              <Ionicons
                name="images-outline"
                size={16}
                color={modo === 'slide' ? '#fff' : '#1c3d5a'}
              />
              <Text style={[styles.segmentoTexto, modo === 'slide' && styles.segmentoTextoAtivo]}>
                Ver Fotos
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentoBotao, modo === 'grade' && styles.segmentoBotaoAtivo]}
              onPress={() => setModo('grade')}
            >
              <Ionicons
                name="grid-outline"
                size={16}
                color={modo === 'grade' ? '#fff' : '#1c3d5a'}
              />
              <Text style={[styles.segmentoTexto, modo === 'grade' && styles.segmentoTextoAtivo]}>
                Reordenar
              </Text>
            </Pressable>
          </View>

          <View style={styles.barraLegenda}>
            <View style={styles.campoLegenda}>
              <Selecao
                label="Legenda"
                valor={idLegendaSelecionada}
                opcoes={opcoesLegenda}
                onChange={setIdLegendaSelecionada}
                obrigatorio
              />
            </View>
            <Pressable
              style={[styles.botaoCapturar, processando && styles.botaoDesabilitado]}
              onPress={capturarDaCamera}
              disabled={processando}
            >
              {processando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="camera" size={22} color="#fff" />
              )}
            </Pressable>
            <Pressable
              style={[styles.botaoCapturar, processando && styles.botaoDesabilitado]}
              onPress={escolherDaGaleria}
              disabled={processando}
            >
              {processando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="images" size={22} color="#fff" />
              )}
            </Pressable>
          </View>

          {complemento && (
            <Secao titulo="Complemento da legenda" style={styles.secaoComplemento}>
              <Campo
                label={complemento.legenda.nm_legendaf}
                obrigatorio
                value={complemento.texto}
                onChangeText={(v) =>
                  setComplemento((atual) => (atual ? { ...atual, texto: v } : atual))
                }
              />
              <View style={styles.linhaBotoesForm}>
                <Pressable style={styles.botaoCancelar} onPress={() => setComplemento(null)}>
                  <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.botaoSalvar, styles.botaoSalvarForm]}
                  onPress={confirmarComplemento}
                >
                  <Text style={styles.botaoSalvarTexto}>Confirmar</Text>
                </Pressable>
              </View>
            </Secao>
          )}

          {!complemento && modo === 'grade' && (
            <>
              {fotos.length > 0 && (
                <Text style={styles.dicaGrade}>
                  Toque e segure numa foto para arrastar e soltar em qualquer posição.
                </Text>
              )}
              <SortableContainer
                sortable={sortable}
                scrollRef={listaGradeRef}
                style={styles.gradeContainer}
              >
                <FlatList
                  ref={listaGradeRef}
                  data={sortable.data}
                  numColumns={NUM_COLUNAS_GRADE}
                  keyExtractor={sortable.stableKeyExtractor}
                  onScroll={sortable.onScroll}
                  onContentSizeChange={sortable.onContentSizeChange}
                  scrollEventThrottle={16}
                  contentContainerStyle={styles.gradeConteudo}
                  ListEmptyComponent={
                    <Text style={styles.vazioTexto}>Nenhuma foto registrada!!!</Text>
                  }
                  renderItem={({ item, index }) => (
                    <SortableItem
                      sortable={sortable}
                      index={index}
                      style={[
                        styles.celulaGrade,
                        { width: tamanhoMiniatura, height: tamanhoMiniatura + 24 },
                      ]}
                      hoverDraggingStyle={styles.celulaGradeArrastando}
                      renderHoverContent={({ dimensions }) => (
                        // Cópia da foto que acompanha o dedo durante o arraste: tamanho explícito
                        // (senão a miniatura com width '100%' pode colapsar e sumir) e borda de destaque.
                        <View
                          style={[
                            styles.celulaGrade,
                            styles.celulaGradeHover,
                            {
                              width: dimensions?.width ?? tamanhoMiniatura,
                              height: dimensions?.height ?? tamanhoMiniatura + 24,
                              margin: 0,
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: item.arquivo }}
                            style={{ width: '100%', height: tamanhoMiniatura - 6 }}
                            resizeMode="cover"
                          />
                          <Text style={styles.miniaturaLegenda} numberOfLines={1}>
                            {item.legenda || '...'}
                          </Text>
                        </View>
                      )}
                    >
                      <Pressable
                        style={styles.celulaGradeConteudo}
                        onPress={() => abrirNaGrade(item)}
                      >
                        <Image
                          source={{ uri: item.arquivo }}
                          style={[styles.miniatura, { height: tamanhoMiniatura }]}
                        />
                        <Text style={styles.miniaturaLegenda} numberOfLines={1}>
                          {item.legenda || '...'}
                        </Text>
                      </Pressable>
                    </SortableItem>
                  )}
                />
              </SortableContainer>
            </>
          )}

          {!complemento && modo === 'slide' && (
            <View style={styles.slideContainer}>
              {fotoAtual ? (
                <>
                  <Text style={styles.contador}>
                    {indiceAtual + 1}/{fotos.length} ·{' '}
                    {fotoAtual.situacao === 'E' ? 'Enviada' : 'Não enviada'}
                  </Text>
                  <FlatList
                    ref={listaSlideRef}
                    data={fotos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => String(item.id_foto)}
                    style={styles.listaSlide}
                    getItemLayout={(_, index) => ({
                      length: larguraPagina,
                      offset: larguraPagina * index,
                      index,
                    })}
                    initialScrollIndex={indiceAtual}
                    onMomentumScrollEnd={aoRolarSlide}
                    onScrollToIndexFailed={(info) =>
                      listaSlideRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: false,
                      })
                    }
                    renderItem={({ item }) => (
                      <View style={{ width: larguraPagina, flex: 1 }}>
                        <Image
                          source={{ uri: item.arquivo }}
                          style={styles.imagemSlide}
                          resizeMode="contain"
                        />
                      </View>
                    )}
                  />

                  {renomeando !== null ? (
                    <View style={styles.linhaRenomear}>
                      <Campo label="Legenda" value={renomeando} onChangeText={setRenomeando} />
                      <View style={styles.linhaBotoesForm}>
                        <Pressable style={styles.botaoCancelar} onPress={() => setRenomeando(null)}>
                          <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.botaoSalvar, styles.botaoSalvarForm]}
                          onPress={confirmarRenomear}
                        >
                          <Text style={styles.botaoSalvarTexto}>Salvar Legenda</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setRenomeando(fotoAtual.legenda)}>
                      <Text style={styles.legendaTexto}>{fotoAtual.legenda || '...'}</Text>
                    </Pressable>
                  )}

                  <View style={styles.acoesSlide}>
                    <Pressable
                      style={styles.botaoIcone}
                      onPress={() => navegar(-1)}
                      disabled={indiceAtual <= 0}
                    >
                      <Ionicons
                        name="chevron-back-circle-outline"
                        size={32}
                        color={indiceAtual <= 0 ? '#c2ccd6' : '#1c3d5a'}
                      />
                    </Pressable>
                    <Pressable
                      style={styles.botaoIcone}
                      onPress={() => girarFoto(fotoAtual)}
                      disabled={processando}
                    >
                      <Ionicons name="refresh-outline" size={28} color="#1c3d5a" />
                    </Pressable>
                    <Pressable
                      style={styles.botaoIcone}
                      onPress={() => enviarFotoIndividual(fotoAtual)}
                      disabled={enviandoFoto}
                    >
                      {enviandoFoto ? (
                        <ActivityIndicator size="small" color="#1c3d5a" />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={26} color="#1c3d5a" />
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.botaoIcone}
                      onPress={() => confirmarExclusaoFoto(fotoAtual)}
                    >
                      <Ionicons name="trash-outline" size={26} color="#d32f2f" />
                    </Pressable>
                    <Pressable
                      style={styles.botaoIcone}
                      onPress={() => navegar(1)}
                      disabled={indiceAtual >= fotos.length - 1}
                    >
                      <Ionicons
                        name="chevron-forward-circle-outline"
                        size={32}
                        color={indiceAtual >= fotos.length - 1 ? '#c2ccd6' : '#1c3d5a'}
                      />
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.vazioTexto}>Nenhuma foto registrada!!!</Text>
              )}
            </View>
          )}

          <View style={{ paddingBottom: Math.max(insets.bottom, 10) }} />
        </KeyboardAvoidingView>
      </DraxProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
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
  dicaGrade: {
    fontSize: 12,
    color: '#8a97a3',
    textAlign: 'center',
    marginTop: 10,
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
  secaoComplemento: {
    marginHorizontal: 16,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  gradeContainer: {
    flex: 1,
  },
  gradeConteudo: {
    padding: 10,
  },
  celulaGrade: {
    margin: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  celulaGradeArrastando: {
    transform: [{ scale: 1.06 }],
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  celulaGradeHover: {
    borderWidth: 3,
    borderColor: '#e8b93a',
    backgroundColor: '#fffbeb',
  },
  celulaGradeConteudo: {
    flex: 1,
  },
  miniatura: {
    width: '100%',
    backgroundColor: '#e6e9ec',
  },
  miniaturaLegenda: {
    fontSize: 9,
    color: '#1c3d5a',
    padding: 3,
    textAlign: 'center',
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
  listaSlide: {
    width: '100%',
    flex: 1,
  },
  imagemSlide: {
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
  botaoControle: {
    marginTop: 2,
  },
});
