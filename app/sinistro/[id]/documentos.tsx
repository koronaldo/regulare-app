import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Campo } from '../../../src/components/form/Campo';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import {
  excluirArquivo,
  inserirArquivo,
  inserirPagina,
  listarDocumentos,
  marcarSolicitado,
  proximoGrupoPag,
  removerSolicitacao,
  salvarComplemento,
  type ArquivoDocumento,
  type DocumentoResumo,
  type FiltroDocumento,
  type GrupoDocumentos,
  type InstanciaDocumento,
} from '../../../src/db/documentos';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { transferirArquivoUnico, transferirInstanciaUnica } from '../../../src/services/transferenciaDocumentos';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { abrirDocumento } from '../../../src/utils/abrirDocumento';
import { reduzImagem } from '../../../src/utils/imagem';

const OPCOES_FILTRO: OpcaoSelecao[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'solicitados', label: 'Solicitados' },
  { valor: 'nao_solicitados', label: 'Não solicitados' },
];

function diretorioPaginas(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'DocPag');
}

function diretorioArquivos(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'Docs');
}

/**
 * O que aparece na relação: o nome descritivo (ex.: "Ata de Vistoria", igual à tela de Atas e
 * Termos) quando existe, senão o nome do arquivo. O caminho físico continua intacto em
 * nome_arquivo — é ele que abre o arquivo e vai pro servidor na transferência.
 */
function nomeExibicaoArquivo(arquivo: ArquivoDocumento): string {
  return arquivo.nome_descritivo.trim() || (arquivo.nome_arquivo.split('/').pop() ?? '');
}

export default function DocumentosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [grupos, setGrupos] = useState<GrupoDocumentos[]>([]);
  const [filtro, setFiltro] = useState<FiltroDocumento>('solicitados');
  const [pesquisa, setPesquisa] = useState('');
  const [processando, setProcessando] = useState(false);
  const [enviandoChave, setEnviandoChave] = useState<string | null>(null);

  const carregar = useCallback(
    async (filtroAtual: FiltroDocumento, pesquisaAtual: string) => {
      if (!idSinistro) return;
      const lista = await listarDocumentos(idSinistro, filtroAtual, pesquisaAtual);
      setGrupos(lista);
    },
    [idSinistro],
  );

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function iniciar() {
        setCarregando(true);
        try {
          const sinistro = await buscarSinistroPorId(idSinistro);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          await carregar(filtro, pesquisa);
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      iniciar();
      return () => {
        cancelado = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idSinistro]),
  );

  function mudarFiltro(valor: string) {
    const novoFiltro = valor as FiltroDocumento;
    setFiltro(novoFiltro);
    carregar(novoFiltro, pesquisa);
  }

  function mudarPesquisa(valor: string) {
    setPesquisa(valor);
    carregar(filtro, valor);
  }

  async function alternarSolicitado(doc: DocumentoResumo, valor: boolean) {
    if (!valor && (doc.instancias.length > 0 || doc.arquivos.length > 0)) {
      mostrarAlerta(
        'Não é possível desmarcar',
        'Este documento já tem arquivos anexados. Remova-os antes de desmarcar como solicitado.',
      );
      return;
    }
    if (valor) {
      await marcarSolicitado(idSinistro, doc.id_documento);
    } else {
      await removerSolicitacao(idSinistro, doc.id_documento);
    }
    await carregar(filtro, pesquisa);
  }

  async function atualizarComplemento(idDocumento: number, texto: string) {
    setGrupos((atual) =>
      atual.map((g) => ({
        ...g,
        documentos: g.documentos.map((d) => (d.id_documento === idDocumento ? { ...d, complemento: texto } : d)),
      })),
    );
  }

  async function confirmarComplemento(idDocumento: number, texto: string) {
    await salvarComplemento(idSinistro, idDocumento, texto);
  }

  function validarDescritivo(doc: DocumentoResumo): boolean {
    if (doc.descritivo && !doc.complemento.trim()) {
      mostrarAlerta('Campo obrigatório', 'Preencha o campo da descrição antes de inserir documentos.');
      return false;
    }
    return true;
  }

  async function novoDocumento(doc: DocumentoResumo) {
    if (!validarDescritivo(doc)) return;

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
      const grupopag = await proximoGrupoPag(idSinistro, doc.id_documento);
      await inserirPagina(idSinistro, doc.id_documento, grupopag, arquivo);
      await carregar(filtro, pesquisa);
      router.push({
        pathname: '/sinistro/[id]/documento/[idDocumento]',
        params: { id: String(idSinistro), idDocumento: String(doc.id_documento), nome: doc.nm_documento, grupopag },
      });
    } catch {
      mostrarAlerta('Erro', 'Erro ao salvar a página.');
    } finally {
      setProcessando(false);
    }
  }

  async function anexarArquivo(doc: DocumentoResumo) {
    if (!validarDescritivo(doc)) return;

    const resultado = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];

    setProcessando(true);
    try {
      const dir = diretorioArquivos(idSinistro);
      if (!dir.exists) dir.create({ intermediates: true });
      const destino = new File(dir, `${Date.now()}_${asset.name}`);
      await new File(asset.uri).copy(destino);
      await inserirArquivo(idSinistro, doc.id_documento, destino.uri);
      await carregar(filtro, pesquisa);
    } catch {
      mostrarAlerta('Erro', 'Erro ao anexar o arquivo.');
    } finally {
      setProcessando(false);
    }
  }

  function abrirInstancia(doc: DocumentoResumo, instancia: InstanciaDocumento) {
    router.push({
      pathname: '/sinistro/[id]/documento/[idDocumento]',
      params: {
        id: String(idSinistro),
        idDocumento: String(doc.id_documento),
        nome: doc.nm_documento,
        grupopag: instancia.grupopag,
      },
    });
  }

  async function abrirArquivo(arquivo: ArquivoDocumento) {
    try {
      await abrirDocumento(arquivo.nome_arquivo);
    } catch (error) {
      mostrarAlerta('Erro ao abrir o arquivo', error instanceof Error ? error.message : undefined);
    }
  }

  function confirmarExclusaoArquivo(arquivo: ArquivoDocumento) {
    mostrarAlerta('Remover arquivo anexado?', nomeExibicaoArquivo(arquivo), [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            const arq = new File(arquivo.nome_arquivo);
            if (arq.exists) arq.delete();
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirArquivo(arquivo.id_docpdf);
          await carregar(filtro, pesquisa);
        },
      },
    ]);
  }

  function enviarArquivoIndividual(arquivo: ArquivoDocumento) {
    if (arquivo.enviado) {
      mostrarAlerta('Documento já enviado', 'Este documento já foi enviado ao servidor antes. Deseja enviar novamente?', [
        { text: 'Cancelar' },
        { text: 'Enviar novamente', onPress: () => executarEnvioArquivo(arquivo) },
      ]);
      return;
    }
    executarEnvioArquivo(arquivo);
  }

  async function executarEnvioArquivo(arquivo: ArquivoDocumento) {
    const chave = `arquivo-${arquivo.id_docpdf}`;
    setEnviandoChave(chave);
    try {
      const resultado = await transferirArquivoUnico(idSinistro, arquivo.id_docpdf);
      mostrarAlerta(resultado.sucesso ? 'Sucesso' : 'Erro ao enviar', resultado.mensagem);
      if (resultado.sucesso) await carregar(filtro, pesquisa);
    } finally {
      setEnviandoChave(null);
    }
  }

  function enviarInstanciaIndividual(doc: DocumentoResumo, instancia: InstanciaDocumento) {
    if (instancia.enviado) {
      mostrarAlerta('Documento já enviado', 'Este documento já foi enviado ao servidor antes. Deseja enviar novamente?', [
        { text: 'Cancelar' },
        { text: 'Enviar novamente', onPress: () => executarEnvioInstancia(doc, instancia) },
      ]);
      return;
    }
    executarEnvioInstancia(doc, instancia);
  }

  async function executarEnvioInstancia(doc: DocumentoResumo, instancia: InstanciaDocumento) {
    const chave = `instancia-${doc.id_documento}-${instancia.grupopag}`;
    setEnviandoChave(chave);
    try {
      const resultado = await transferirInstanciaUnica(idSinistro, doc.id_documento, instancia.grupopag);
      mostrarAlerta(resultado.sucesso ? 'Sucesso' : 'Erro ao enviar', resultado.mensagem);
      if (resultado.sucesso) await carregar(filtro, pesquisa);
    } finally {
      setEnviandoChave(null);
    }
  }

  function voltar() {
    router.back();
  }

  function irParaControle() {
    router.push({ pathname: '/sinistro/[id]', params: { id: String(idSinistro) } });
  }

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

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo}>Relação de Documentos</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
        <Pressable onPress={irParaControle} hitSlop={10} style={styles.botaoControle}>
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]/transferencia', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoControle}
        >
          <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.barraFiltro}>
        <View style={styles.campoPesquisa}>
          <Campo label="Pesquisar" value={pesquisa} onChangeText={mudarPesquisa} placeholder="Nome do documento" />
        </View>
        <View style={styles.campoFiltro}>
          <Selecao label="Situação" valor={filtro} opcoes={OPCOES_FILTRO} onChange={mudarFiltro} />
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        {grupos.length === 0 && <Text style={styles.vazioTexto}>Nenhum documento encontrado.</Text>}

        {grupos.map((grupo) => (
          <View key={grupo.id_docgrupo} style={styles.grupoBloco}>
            <View style={styles.grupoCabecalho}>
              <Text style={styles.grupoTitulo}>{grupo.nm_docgrupo}</Text>
            </View>

            {grupo.documentos.map((doc) => (
              <View key={doc.id_documento} style={styles.cardDocumento}>
                <View style={styles.linhaTopo}>
                  <Text style={styles.nomeDocumento} numberOfLines={2}>
                    {doc.nm_documento}
                  </Text>
                  <Switch
                    value={doc.solicitado}
                    onValueChange={(v) => alternarSolicitado(doc, v)}
                    trackColor={{ true: '#1c3d5a' }}
                  />
                </View>

                {doc.descritivo && (
                  <Campo
                    label="Descrição"
                    obrigatorio
                    value={doc.complemento}
                    onChangeText={(v) => atualizarComplemento(doc.id_documento, v)}
                    onBlur={() => confirmarComplemento(doc.id_documento, doc.complemento)}
                  />
                )}

                {doc.instancias.map((instancia, indice) => {
                  const chaveEnvio = `instancia-${doc.id_documento}-${instancia.grupopag}`;
                  const enviandoEsta = enviandoChave === chaveEnvio;
                  return (
                    <View key={instancia.grupopag} style={styles.itemInstancia}>
                      <Pressable style={styles.itemInstanciaToque} onPress={() => abrirInstancia(doc, instancia)}>
                        <Ionicons name="document-text" size={18} color="#c0392b" />
                        <Text style={styles.itemInstanciaTexto}>
                          Documento {indice + 1} · {instancia.totalPaginas} página(s)
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color="#8a97a3" />
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        disabled={enviandoChave !== null}
                        onPress={() => enviarInstanciaIndividual(doc, instancia)}
                      >
                        {enviandoEsta ? (
                          <ActivityIndicator size="small" color="#1c3d5a" />
                        ) : (
                          <Ionicons name="cloud-upload-outline" size={18} color="#1c3d5a" />
                        )}
                      </Pressable>
                    </View>
                  );
                })}

                {doc.arquivos.map((arquivo) => {
                  const chaveEnvio = `arquivo-${arquivo.id_docpdf}`;
                  const enviandoEste = enviandoChave === chaveEnvio;
                  return (
                    <View key={arquivo.id_docpdf} style={styles.itemArquivo}>
                      <Pressable style={styles.itemArquivoToque} onPress={() => abrirArquivo(arquivo)}>
                        <Ionicons name="document-outline" size={18} color="#1c3d5a" />
                        <Text style={styles.itemArquivoTexto} numberOfLines={1}>
                          {nomeExibicaoArquivo(arquivo)}
                        </Text>
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        disabled={enviandoChave !== null}
                        onPress={() => enviarArquivoIndividual(arquivo)}
                      >
                        {enviandoEste ? (
                          <ActivityIndicator size="small" color="#1c3d5a" />
                        ) : (
                          <Ionicons name="cloud-upload-outline" size={18} color="#1c3d5a" />
                        )}
                      </Pressable>
                      <Pressable hitSlop={10} onPress={() => confirmarExclusaoArquivo(arquivo)}>
                        <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                      </Pressable>
                    </View>
                  );
                })}

                <View style={styles.linhaAcoes}>
                  <Pressable
                    style={[styles.botaoAcao, processando && styles.botaoDesabilitado]}
                    onPress={() => novoDocumento(doc)}
                    disabled={processando}
                  >
                    <Ionicons name="camera-outline" size={16} color="#1c3d5a" />
                    <Text style={styles.botaoAcaoTexto}>Novo Documento</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.botaoAcao, processando && styles.botaoDesabilitado]}
                    onPress={() => anexarArquivo(doc)}
                    disabled={processando}
                  >
                    <Ionicons name="attach-outline" size={16} color="#1c3d5a" />
                    <Text style={styles.botaoAcaoTexto}>Anexar Arquivo</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  barraFiltro: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  campoPesquisa: {
    flex: 1.4,
  },
  campoFiltro: {
    flex: 1,
  },
  conteudo: {
    padding: 16,
    paddingBottom: 24,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  grupoBloco: {
    marginBottom: 16,
  },
  grupoCabecalho: {
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  grupoTitulo: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cardDocumento: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  linhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  nomeDocumento: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
  },
  itemInstancia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fdecea',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  itemInstanciaToque: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemInstanciaTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 13,
  },
  itemArquivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2f5',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  itemArquivoToque: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemArquivoTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 13,
  },
  linhaAcoes: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  botaoAcao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eef2f5',
    borderRadius: 8,
    paddingVertical: 10,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  botaoAcaoTexto: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 12,
  },
  botaoControle: {
    marginTop: 2,
  },
});
