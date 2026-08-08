import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraxProvider, SortableContainer, SortableItem, useSortableList } from 'react-native-drax';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import {
  definirFormatoPagina,
  excluirPagina,
  inserirPagina,
  listarPaginas,
  reordenarPaginas,
  type PaginaDocumento,
} from '../../../../src/db/documentos';
import { buscarSinistroPorId } from '../../../../src/db/sinistros';
import { mostrarAlerta } from '../../../../src/utils/alerta';
import { reduzImagem } from '../../../../src/utils/imagem';

const NUM_COLUNAS_GRADE = 3;
const TAMANHOS: { valor: '1' | '2' | '3' | '4'; label: string }[] = [
  { valor: '1', label: '1/4 · 25%' },
  { valor: '2', label: '2/4 · 50%' },
  { valor: '3', label: '3/4 · 75%' },
  { valor: '4', label: '4/4 · 100%' },
];
const ESCALA_POR_FORMATO: Record<string, number> = { '1': 0.25, '2': 0.5, '3': 0.75, '4': 1 };

function diretorioPaginas(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'DocPag');
}

export default function DocumentoPaginasScreen() {
  const { id, idDocumento, nome, grupopag } = useLocalSearchParams<{
    id: string;
    idDocumento: string;
    nome?: string;
    grupopag: string;
  }>();
  const idSinistro = Number(id);
  const idDoc = Number(idDocumento);
  const { width: larguraTela } = useWindowDimensions();
  const larguraPagina = larguraTela - 32;
  const tamanhoMiniatura = (larguraTela - 10 * 2) / NUM_COLUNAS_GRADE - 8;

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [paginas, setPaginas] = useState<PaginaDocumento[]>([]);
  const [modo, setModo] = useState<'slide' | 'grade'>('slide');
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [processando, setProcessando] = useState(false);

  const listaGradeRef = useRef<FlatList<PaginaDocumento>>(null);
  const listaSlideRef = useRef<FlatList<PaginaDocumento>>(null);

  const sortable = useSortableList({
    data: paginas,
    numColumns: NUM_COLUNAS_GRADE,
    keyExtractor: (item) => String(item.id_docpag),
    onReorder: ({ data }) => salvarNovaOrdem(data),
  });

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro || !idDoc || grupopag === undefined) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, listaPaginas] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            listarPaginas(idSinistro, idDoc, grupopag),
          ]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setPaginas(listaPaginas);
          setIndiceAtual((atual) => Math.min(atual, Math.max(0, listaPaginas.length - 1)));
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      carregar();
      return () => {
        cancelado = true;
      };
    }, [idSinistro, idDoc, grupopag]),
  );

  async function recarregar() {
    const lista = await listarPaginas(idSinistro, idDoc, grupopag);
    setPaginas(lista);
    return lista;
  }

  async function capturarPagina() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      mostrarAlerta('Permissão necessária', 'Autorize o uso da câmera para digitalizar documentos.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];

    setProcessando(true);
    try {
      const arquivo = await reduzImagem(asset.uri, asset.width, asset.height, diretorioPaginas(idSinistro), 'pag');
      await inserirPagina(idSinistro, idDoc, grupopag, arquivo);
      const lista = await recarregar();
      setIndiceAtual(Math.max(0, lista.length - 1));
      setModo('slide');
    } catch {
      mostrarAlerta('Erro', 'Erro ao salvar a página.');
    } finally {
      setProcessando(false);
    }

    mostrarAlerta('Página adicionada', 'Deseja digitalizar mais uma página para este documento?', [
      { text: 'Não' },
      { text: 'Sim', onPress: capturarPagina },
    ]);
  }

  async function salvarNovaOrdem(novaLista: PaginaDocumento[]) {
    setPaginas(novaLista);
    await reordenarPaginas(novaLista.map((p) => p.id_docpag));
  }

  async function definirTamanho(pagina: PaginaDocumento, formato: '1' | '2' | '3' | '4') {
    await definirFormatoPagina(pagina.id_docpag, formato);
    setPaginas((atual) => atual.map((p) => (p.id_docpag === pagina.id_docpag ? { ...p, formato } : p)));
  }

  function confirmarExclusaoPagina(pagina: PaginaDocumento) {
    mostrarAlerta('Remover página do documento?', '', [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            const arquivo = new File(pagina.nome_arquivo);
            if (arquivo.exists) arquivo.delete();
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirPagina(pagina.id_docpag);
          const lista = await recarregar();
          if (lista.length === 0) {
            router.back();
            return;
          }
          setIndiceAtual((atual) => Math.max(0, Math.min(atual, lista.length - 1)));
        },
      },
    ]);
  }

  function navegar(delta: number) {
    setIndiceAtual((atual) => {
      const novo = atual + delta;
      if (novo < 0) {
        mostrarAlerta('Documento', 'Início do documento');
        return atual;
      }
      if (novo >= paginas.length) {
        mostrarAlerta('Documento', 'Final do documento');
        return atual;
      }
      return novo;
    });
  }

  function aoRolarSlide(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    const indice = Math.round(evento.nativeEvent.contentOffset.x / larguraPagina);
    if (indice >= 0 && indice < paginas.length && indice !== indiceAtual) {
      setIndiceAtual(indice);
    }
  }

  useEffect(() => {
    if (modo === 'slide' && paginas.length > 0) {
      listaSlideRef.current?.scrollToIndex({ index: indiceAtual, animated: true });
    }
  }, [indiceAtual, modo, paginas.length, larguraPagina]);

  function abrirNaSlide(pagina: PaginaDocumento) {
    const indice = paginas.findIndex((p) => p.id_docpag === pagina.id_docpag);
    if (indice >= 0) setIndiceAtual(indice);
    setModo('slide');
  }

  function voltar() {
    router.back();
  }

  const paginaAtual = paginas[indiceAtual] ?? null;

  if (carregando) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#1c3d5a" />
        <Pressable onPress={voltar} style={styles.botaoVoltarCarregando}>
          <Text style={styles.botaoVoltarCarregandoTexto}>Voltar</Text>
        </Pressable>
      </View>
    );
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
            <Text style={styles.headerTitulo} numberOfLines={1}>
              {nome || 'Documento'}
            </Text>
            <Text style={styles.headerSubtitulo} numberOfLines={1}>
              {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
            </Text>
          </View>
        </View>

        {paginas.length > 0 && (
          <View style={styles.segmentado}>
            <Pressable
              style={[styles.segmentoBotao, modo === 'slide' && styles.segmentoBotaoAtivo]}
              onPress={() => setModo('slide')}
            >
              <Ionicons name="document-text-outline" size={16} color={modo === 'slide' ? '#fff' : '#1c3d5a'} />
              <Text style={[styles.segmentoTexto, modo === 'slide' && styles.segmentoTextoAtivo]}>Ver Páginas</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentoBotao, modo === 'grade' && styles.segmentoBotaoAtivo]}
              onPress={() => setModo('grade')}
            >
              <Ionicons name="grid-outline" size={16} color={modo === 'grade' ? '#fff' : '#1c3d5a'} />
              <Text style={[styles.segmentoTexto, modo === 'grade' && styles.segmentoTextoAtivo]}>Reordenar</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.botaoInserir, processando && styles.botaoDesabilitado]}
          onPress={capturarPagina}
          disabled={processando}
        >
          {processando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.botaoInserirTexto}>Digitalizar página</Text>
            </>
          )}
        </Pressable>

        {paginas.length > 0 && modo === 'grade' && (
          <SortableContainer sortable={sortable} scrollRef={listaGradeRef} style={styles.container}>
            <FlatList
              ref={listaGradeRef}
              data={sortable.data}
              numColumns={NUM_COLUNAS_GRADE}
              keyExtractor={sortable.stableKeyExtractor}
              onScroll={sortable.onScroll}
              onContentSizeChange={sortable.onContentSizeChange}
              scrollEventThrottle={16}
              contentContainerStyle={styles.conteudo}
              ListHeaderComponent={
                <Text style={styles.dicaGrade}>Toque e segure numa página para arrastar e mudar a ordem.</Text>
              }
              renderItem={({ item, index }) => (
                <SortableItem
                  sortable={sortable}
                  index={index}
                  style={[styles.celulaGrade, { width: tamanhoMiniatura, height: tamanhoMiniatura * 1.3 }]}
                >
                  <Pressable style={styles.celulaGradeConteudo} onPress={() => abrirNaSlide(item)}>
                    <Image source={{ uri: item.nome_arquivo }} style={styles.miniatura} />
                    <Text style={styles.miniaturaLegenda}>
                      {TAMANHOS.find((t) => t.valor === item.formato)?.label ?? '4/4'}
                    </Text>
                  </Pressable>
                </SortableItem>
              )}
            />
          </SortableContainer>
        )}

        {(modo === 'slide' || paginas.length === 0) && (
          <View style={styles.areaSlide}>
            {paginas.length === 0 && <Text style={styles.vazioTexto}>Nenhuma página digitalizada ainda.</Text>}

            {paginas.length > 0 && (
              <View style={styles.slideContainer}>
                <Text style={styles.contador}>
                  {indiceAtual + 1}/{paginas.length}
                </Text>
                <FlatList
                  ref={listaSlideRef}
                  data={paginas}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => String(item.id_docpag)}
                  style={styles.listaSlide}
                  getItemLayout={(_, index) => ({ length: larguraPagina, offset: larguraPagina * index, index })}
                  initialScrollIndex={indiceAtual}
                  onMomentumScrollEnd={aoRolarSlide}
                  onScrollToIndexFailed={(info) =>
                    listaSlideRef.current?.scrollToOffset({
                      offset: info.averageItemLength * info.index,
                      animated: false,
                    })
                  }
                  renderItem={({ item }) => {
                    const escala = ESCALA_POR_FORMATO[item.formato] ?? 1;
                    return (
                      <View style={{ width: larguraPagina }}>
                        <View style={styles.paginaPreview}>
                          <Image
                            source={{ uri: item.nome_arquivo }}
                            style={[styles.imagemSlide, { width: `${escala * 100}%`, height: `${escala * 100}%` }]}
                            resizeMode="contain"
                          />
                        </View>
                      </View>
                    );
                  }}
                />

                {paginaAtual && (
                  <>
                    <Text style={styles.painelLabel}>Tamanho da página no PDF</Text>
                    <View style={styles.linhaTamanhos}>
                      {TAMANHOS.map((t) => (
                        <Pressable
                          key={t.valor}
                          style={[styles.botaoTamanho, paginaAtual.formato === t.valor && styles.botaoTamanhoAtivo]}
                          onPress={() => definirTamanho(paginaAtual, t.valor)}
                        >
                          <Text
                            style={[
                              styles.botaoTamanhoTexto,
                              paginaAtual.formato === t.valor && styles.botaoTamanhoTextoAtivo,
                            ]}
                          >
                            {t.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.acoesSlide}>
                      <Pressable style={styles.botaoIcone} onPress={() => navegar(-1)} disabled={indiceAtual <= 0}>
                        <Ionicons
                          name="chevron-back-circle-outline"
                          size={32}
                          color={indiceAtual <= 0 ? '#c2ccd6' : '#1c3d5a'}
                        />
                      </Pressable>
                      <Pressable style={styles.botaoIcone} onPress={() => confirmarExclusaoPagina(paginaAtual)}>
                        <Ionicons name="trash-outline" size={26} color="#d32f2f" />
                      </Pressable>
                      <Pressable
                        style={styles.botaoIcone}
                        onPress={() => navegar(1)}
                        disabled={indiceAtual >= paginas.length - 1}
                      >
                        <Ionicons
                          name="chevron-forward-circle-outline"
                          size={32}
                          color={indiceAtual >= paginas.length - 1 ? '#c2ccd6' : '#1c3d5a'}
                        />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </DraxProvider>
    </GestureHandlerRootView>
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
    gap: 16,
  },
  botaoVoltarCarregando: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1c3d5a',
    borderRadius: 8,
  },
  botaoVoltarCarregandoTexto: {
    color: '#fff',
    fontWeight: '600',
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
  botaoInserir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 12,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  botaoInserirTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  conteudo: {
    padding: 16,
    paddingBottom: 24,
  },
  areaSlide: {
    flex: 1,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
    marginHorizontal: 16,
  },
  dicaGrade: {
    fontSize: 12,
    color: '#8a97a3',
    marginBottom: 10,
  },
  celulaGrade: {
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  celulaGradeConteudo: {
    flex: 1,
  },
  miniatura: {
    width: '100%',
    flex: 1,
    backgroundColor: '#e6e9ec',
  },
  miniaturaLegenda: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1c3d5a',
    textAlign: 'center',
    paddingVertical: 4,
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
  paginaPreview: {
    flex: 1,
    width: '100%',
    backgroundColor: '#e4e7ea',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagemSlide: {
    backgroundColor: '#000',
    borderRadius: 4,
  },
  painelLabel: {
    fontSize: 12,
    color: '#5a6672',
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  linhaTamanhos: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  botaoTamanho: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#eef2f5',
    alignItems: 'center',
  },
  botaoTamanhoAtivo: {
    backgroundColor: '#1c3d5a',
  },
  botaoTamanhoTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  botaoTamanhoTextoAtivo: {
    color: '#fff',
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
});
