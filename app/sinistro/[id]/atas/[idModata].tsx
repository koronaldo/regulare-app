import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  existeLayoutAta,
  gerarHtmlAta,
  limparAssinaturaAta,
  listarAtasDisponiveis,
  type AtaDisponivel,
} from '../../../../src/db/atas';
import { excluirArquivo, listarArquivos } from '../../../../src/db/documentos';
import { mostrarAlerta } from '../../../../src/utils/alerta';
import { calcularTamanhoPagina } from '../../../../src/utils/atasTemplate';

export default function AtaDetalheScreen() {
  const { id, idModata, nome } = useLocalSearchParams<{ id: string; idModata: string; nome: string }>();
  const idSinistro = Number(id);
  const idModataNum = Number(idModata);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [ata, setAta] = useState<AtaDisponivel | null>(null);
  const [temLayout, setTemLayout] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, existeLayout] = await Promise.all([
        listarAtasDisponiveis(idSinistro),
        existeLayoutAta(idSinistro, idModataNum),
      ]);
      setAta(lista.find((a) => a.id_modata === idModataNum) ?? null);
      setTemLayout(existeLayout);
    } finally {
      setCarregando(false);
    }
  }, [idSinistro, idModataNum]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function abrirPdf(uri: string) {
    if (!(await Sharing.isAvailableAsync())) {
      mostrarAlerta('Indisponível', 'Não é possível abrir arquivos neste dispositivo.');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  }

  async function visualizarSemAssinatura() {
    setProcessando(true);
    try {
      const html = await gerarHtmlAta(idSinistro, idModataNum, '');
      if (!html) {
        mostrarAlerta('Modelo não configurado', 'Não há layout de ata cadastrado para esta seguradora/produto.');
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false, ...calcularTamanhoPagina(html, idModataNum) });
      await abrirPdf(uri);
    } catch {
      mostrarAlerta('Erro', 'Erro ao gerar o PDF da ata.');
    } finally {
      setProcessando(false);
    }
  }

  async function visualizarAssinada() {
    if (!ata?.id_documento) return;
    setProcessando(true);
    try {
      const arquivos = await listarArquivos(idSinistro, ata.id_documento);
      const ultimo = arquivos[arquivos.length - 1];
      if (!ultimo) {
        mostrarAlerta('Não encontrado', 'O arquivo assinado não foi encontrado.');
        return;
      }
      await abrirPdf(ultimo.nome_arquivo);
    } finally {
      setProcessando(false);
    }
  }

  function irParaAssinatura() {
    if (!temLayout) {
      mostrarAlerta('Layout não cadastrado', 'Não há layout de ata cadastrado para esta seguradora/produto.');
      return;
    }
    router.push({
      pathname: '/sinistro/[id]/atas/assinar',
      params: { id: String(idSinistro), idModata: String(idModataNum), nome: nome ?? ata?.nome ?? '' },
    });
  }

  function apagarERegerar() {
    if (!ata?.id_documento) return;
    mostrarAlerta('Apagar ata assinada?', 'A ata será removida e poderá ser gerada e assinada novamente.', [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          setProcessando(true);
          try {
            const idDocumento = ata.id_documento as number;
            const arquivos = await listarArquivos(idSinistro, idDocumento);
            for (const arquivo of arquivos) {
              try {
                const arq = new File(arquivo.nome_arquivo);
                if (arq.exists) arq.delete();
              } catch {
                // best-effort: se o arquivo já não existir, ignora
              }
              await excluirArquivo(arquivo.id_docpdf);
            }
            await limparAssinaturaAta(idSinistro, idDocumento);
            await carregar();
          } finally {
            setProcessando(false);
          }
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

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo} numberOfLines={2}>
            {ata?.nome ?? nome}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoVoltar}
        >
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        {ata?.assinada ? (
          <>
            <View style={styles.avisoAssinada}>
              <Ionicons name="checkmark-circle" size={20} color="#2e7d32" />
              <Text style={styles.avisoAssinadaTexto}>Esta ata já foi assinada e não pode ser alterada.</Text>
            </View>

            <Pressable
              style={[styles.botao, styles.botaoPrimario, processando && styles.botaoDesabilitado]}
              onPress={visualizarAssinada}
              disabled={processando}
            >
              <Ionicons name="document-text-outline" size={18} color="#fff" />
              <Text style={styles.botaoPrimarioTexto}>Visualizar com assinatura</Text>
            </Pressable>

            <Pressable
              style={[styles.botao, styles.botaoSecundario, processando && styles.botaoDesabilitado]}
              onPress={visualizarSemAssinatura}
              disabled={processando}
            >
              <Ionicons name="eye-outline" size={18} color="#1c3d5a" />
              <Text style={styles.botaoSecundarioTexto}>Visualizar sem assinatura</Text>
            </Pressable>

            <Pressable
              style={[styles.botao, styles.botaoPerigo, processando && styles.botaoDesabilitado]}
              onPress={apagarERegerar}
              disabled={processando}
            >
              <Ionicons name="trash-outline" size={18} color="#d32f2f" />
              <Text style={styles.botaoPerigoTexto}>Apagar e gerar novamente</Text>
            </Pressable>
          </>
        ) : !temLayout ? (
          <View style={styles.avisoSemLayout}>
            <Ionicons name="alert-circle-outline" size={20} color="#8a6d3b" />
            <Text style={styles.avisoSemLayoutTexto}>
              Não há layout cadastrado para esta ata nesta seguradora/produto. Não é possível gerar nem assinar.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              style={[styles.botao, styles.botaoSecundario, processando && styles.botaoDesabilitado]}
              onPress={visualizarSemAssinatura}
              disabled={processando}
            >
              <Ionicons name="eye-outline" size={18} color="#1c3d5a" />
              <Text style={styles.botaoSecundarioTexto}>Visualizar sem assinatura</Text>
            </Pressable>

            <Pressable
              style={[styles.botao, styles.botaoPrimario, processando && styles.botaoDesabilitado]}
              onPress={irParaAssinatura}
              disabled={processando}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.botaoPrimarioTexto}>Assinar</Text>
            </Pressable>
          </>
        )}

        {processando && <ActivityIndicator color="#1c3d5a" style={styles.spinner} />}
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
  conteudo: {
    padding: 16,
    paddingBottom: 24,
  },
  avisoAssinada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  avisoAssinadaTexto: {
    flex: 1,
    color: '#2e7d32',
    fontWeight: '600',
    fontSize: 13,
  },
  avisoSemLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fdf3e3',
    borderRadius: 10,
    padding: 12,
  },
  avisoSemLayoutTexto: {
    flex: 1,
    color: '#8a6d3b',
    fontWeight: '600',
    fontSize: 13,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 10,
  },
  botaoPrimario: {
    backgroundColor: '#1c3d5a',
  },
  botaoPrimarioTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  botaoSecundario: {
    backgroundColor: '#eef2f5',
  },
  botaoSecundarioTexto: {
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 14,
  },
  botaoPerigo: {
    backgroundColor: '#fdecea',
  },
  botaoPerigoTexto: {
    color: '#d32f2f',
    fontWeight: '700',
    fontSize: 14,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  spinner: {
    marginTop: 8,
  },
});
