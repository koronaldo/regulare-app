import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';

import { excluirDownload, inserirDownload, listarDownloads, type DownloadResumo } from '../../../src/db/downloads';
import { buscarArquivosParaDownload, montarUrlArquivo } from '../../../src/services/downloads';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function adivinharMimeType(nomeArquivo: string): string {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase();
  return (ext && MIME_POR_EXTENSAO[ext]) || 'application/pdf';
}

function diretorioDownloads(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'CG_Atas');
}

export default function ApoliceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [downloads, setDownloads] = useState<DownloadResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [status, setStatus] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, lista] = await Promise.all([buscarSinistroPorId(idSinistro), listarDownloads(idSinistro)]);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setDownloads(lista);
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
    const lista = await listarDownloads(idSinistro);
    setDownloads(lista);
    return lista;
  }

  function iniciarBusca() {
    mostrarAlerta('Download Arquivos', 'Fazer o download da apólice e/ou da Condição geral?', [
      { text: 'Não' },
      { text: 'Sim', onPress: buscarEBaixar },
    ]);
  }

  async function buscarEBaixar() {
    setBuscando(true);
    setStatus('Verificando aguarde...');
    try {
      const arquivos = await buscarArquivosParaDownload(idSinistro);
      if (arquivos.length === 0) {
        setStatus('Nenhum registro encontrado!!!');
        return;
      }

      const dir = diretorioDownloads(idSinistro);
      if (!dir.exists) dir.create({ intermediates: true });

      for (let i = 0; i < arquivos.length; i++) {
        const arquivo = arquivos[i];
        setStatus(`Baixando ${i + 1}/${arquivos.length}...`);
        try {
          const url = montarUrlArquivo(arquivo);
          const destino = new File(dir, arquivo.semAcento);
          await File.downloadFileAsync(url, destino);
          await inserirDownload(idSinistro, {
            path: dir.uri,
            fisico: arquivo.semAcento,
            file: arquivo.nomeArquivo,
            labelFoto: arquivo.nmFoto,
          });
        } catch {
          // segue tentando baixar os demais arquivos mesmo se um falhar
        }
      }

      await recarregar();
      setStatus('Atualizado com sucesso!!!');
    } catch (erro) {
      setStatus(erro instanceof Error ? erro.message : 'Sem conexão com servidor!!!');
    } finally {
      setBuscando(false);
    }
  }

  async function abrirArquivo(download: DownloadResumo) {
    try {
      const arquivo = new File(download.path, download.fisico);
      if (!arquivo.exists) {
        mostrarAlerta('Arquivo não encontrado', 'O arquivo pode ter sido removido do dispositivo.');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        mostrarAlerta('Indisponível', 'Não é possível abrir arquivos neste dispositivo.');
        return;
      }
      await Sharing.shareAsync(arquivo.uri, { mimeType: adivinharMimeType(download.fisico) });
    } catch {
      mostrarAlerta('Erro', 'Erro ao abrir o arquivo.');
    }
  }

  function confirmarExclusao(download: DownloadResumo) {
    mostrarAlerta('Remover Documento?', download.labelFoto || download.fisico, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            const arquivo = new File(download.path, download.fisico);
            if (arquivo.exists) arquivo.delete();
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirDownload(download.id_download);
          await recarregar();
        },
      },
    ]);
  }

  function voltar() {
    router.back();
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

      <View style={styles.header}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo}>Apólice & Cond. Geral</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        {downloads.length === 0 && <Text style={styles.vazioTexto}>Nenhum arquivo encontrado!!!</Text>}

        {downloads.map((download) => (
          <View key={download.id_download} style={styles.itemDownload}>
            <Pressable style={styles.itemToque} onPress={() => abrirArquivo(download)}>
              <Ionicons name="document-text-outline" size={24} color="#1c3d5a" />
              <Text style={styles.itemTexto} numberOfLines={2}>
                {download.labelFoto || download.fisico}
              </Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => confirmarExclusao(download)}>
              <Ionicons name="trash-outline" size={20} color="#d32f2f" />
            </Pressable>
          </View>
        ))}

        {!!status && <Text style={styles.textoStatus}>{status}</Text>}

        <Pressable style={[styles.botaoBuscar, buscando && styles.botaoDesabilitado]} onPress={iniciarBusca} disabled={buscando}>
          {buscando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={20} color="#fff" />
              <Text style={styles.botaoBuscarTexto}>Download</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
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
  conteudo: {
    padding: 16,
    paddingBottom: 24,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 12,
  },
  itemDownload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  itemToque: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
  },
  textoStatus: {
    textAlign: 'center',
    color: '#2a88ad',
    fontWeight: '600',
    fontSize: 13,
    marginVertical: 8,
  },
  botaoBuscar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 10,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  botaoBuscarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
