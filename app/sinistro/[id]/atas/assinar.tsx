import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import { Directory, File, Paths } from 'expo-file-system';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureView, { type SignatureViewRef } from 'react-native-signature-canvas';

import { gerarHtmlAta, resolverDocumentoDaAta, salvarAssinaturaAta } from '../../../../src/db/atas';
import { inserirArquivo } from '../../../../src/db/documentos';
import { mostrarAlerta } from '../../../../src/utils/alerta';
import { calcularTamanhoPagina } from '../../../../src/utils/atasTemplate';

function diretorioAtas(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'Atas');
}

export default function AssinarAtaScreen() {
  const { id, idModata, nome } = useLocalSearchParams<{ id: string; idModata: string; nome: string }>();
  const idSinistro = Number(id);
  const idModataNum = Number(idModata);
  const insets = useSafeAreaInsets();

  const [salvando, setSalvando] = useState(false);
  const [areaDisponivel, setAreaDisponivel] = useState({ width: 0, height: 0 });
  const assinaturaRef = useRef<SignatureViewRef>(null);
  const { width: larguraTela, height: alturaTela } = useWindowDimensions();
  const paisagem = larguraTela > alturaTela;

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  function medirArea(evento: LayoutChangeEvent) {
    const { width, height } = evento.nativeEvent.layout;
    setAreaDisponivel({ width, height });
  }

  const proporcaoAssinatura = 418 / 188;
  let larguraArea = areaDisponivel.width;
  let alturaArea = larguraArea / proporcaoAssinatura;
  if (alturaArea > areaDisponivel.height && areaDisponivel.height > 0) {
    alturaArea = areaDisponivel.height;
    larguraArea = alturaArea * proporcaoAssinatura;
  }

  async function confirmarAssinatura(assinaturaBase64: string) {
    setSalvando(true);
    try {
      const idDocumento = await resolverDocumentoDaAta(idSinistro, idModataNum);
      if (!idDocumento) {
        mostrarAlerta('Erro', 'Não foi possível localizar o documento vinculado a esta ata.');
        return;
      }

      const html = await gerarHtmlAta(idSinistro, idModataNum, assinaturaBase64);
      if (!html) {
        mostrarAlerta('Erro', 'Não foi possível gerar o layout da ata.');
        return;
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false, ...calcularTamanhoPagina(html, idModataNum) });

      const dir = diretorioAtas(idSinistro);
      if (!dir.exists) dir.create({ intermediates: true });
      const destino = new File(dir, `${idModataNum}_${Date.now()}.pdf`);
      await new File(uri).copy(destino);

      // O nome exibido na relação de documentos é o mesmo da tela de Atas e Termos.
      await inserirArquivo(idSinistro, idDocumento, destino.uri, nome ?? '');
      await salvarAssinaturaAta(idSinistro, idDocumento, assinaturaBase64);

      mostrarAlerta('Ata assinada', 'A ata foi assinada e inserida na relação de documentos.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      mostrarAlerta('Erro', 'Erro ao gerar e salvar a ata assinada.');
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    router.back();
  }

  function confirmar() {
    assinaturaRef.current?.readSignature();
  }

  function limpar() {
    assinaturaRef.current?.clearSignature();
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
        <Pressable onPress={cancelar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo} numberOfLines={2}>
            Assinar · {nome}
          </Text>
        </View>
      </View>

      <View style={[styles.corpo, paisagem && styles.corpoPaisagem]}>
        <View style={[styles.painelAcoes, paisagem && styles.painelAcoesPaisagem]}>
          <View style={[styles.linhaAcoes, paisagem && styles.linhaAcoesPaisagem]}>
            <Pressable
              style={[styles.botao, styles.botaoPrimario, paisagem && styles.botaoPaisagem, salvando && styles.botaoDesabilitado]}
              onPress={confirmar}
              disabled={salvando}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.botaoPrimarioTexto}>Confirmar Assinatura</Text>
            </Pressable>
            <Pressable
              style={[styles.botao, styles.botaoSecundario, paisagem && styles.botaoPaisagem, salvando && styles.botaoDesabilitado]}
              onPress={limpar}
              disabled={salvando}
            >
              <Ionicons name="brush-outline" size={18} color="#1c3d5a" />
              <Text style={styles.botaoSecundarioTexto}>Limpar</Text>
            </Pressable>
          </View>

          <Text style={styles.instrucao}>Assine no espaço abaixo</Text>
        </View>

        <View style={styles.areaWrapper} onLayout={medirArea}>
          {areaDisponivel.width > 0 && (
            <View style={[styles.area, { width: larguraArea, height: alturaArea }]}>
              <SignatureView
                ref={assinaturaRef}
                onOK={confirmarAssinatura}
                onEmpty={() => mostrarAlerta('Assinatura vazia', 'Desenhe a assinatura antes de confirmar.')}
                autoClear={false}
                imageType="image/png"
                webStyle=".m-signature-pad--footer { display: none; } .m-signature-pad--body { border: none; }"
              />
            </View>
          )}
        </View>
      </View>

      {salvando && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.overlayTexto}>Gerando PDF assinado...</Text>
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
    fontSize: 16,
    fontWeight: '700',
  },
  corpo: {
    flex: 1,
  },
  corpoPaisagem: {
    flexDirection: 'row',
  },
  painelAcoes: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  painelAcoesPaisagem: {
    width: 160,
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  linhaAcoes: {
    flexDirection: 'row',
    gap: 10,
  },
  linhaAcoesPaisagem: {
    flexDirection: 'column',
  },
  botao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 13,
  },
  botaoPaisagem: {
    flex: 0,
    marginBottom: 8,
  },
  botaoPrimario: {
    backgroundColor: '#1c3d5a',
  },
  botaoPrimarioTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  botaoSecundario: {
    backgroundColor: '#eef2f5',
  },
  botaoSecundarioTexto: {
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 13,
  },
  botaoDesabilitado: {
    opacity: 0.6,
  },
  instrucao: {
    color: '#8a97a3',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  areaWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  area: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e6ea',
    borderRadius: 10,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  overlayTexto: {
    color: '#fff',
    fontWeight: '600',
  },
});
