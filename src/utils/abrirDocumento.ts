import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';

/** Intent.ACTION_VIEW do Android. */
const ACTION_VIEW = 'android.intent.action.VIEW';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION: deixa o app leitor ler o arquivo privado do Regulare. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

export function mimeTypeDoArquivo(nomeArquivo: string, padrao = 'application/octet-stream'): string {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase();
  return (ext && MIME_POR_EXTENSAO[ext]) || padrao;
}

/**
 * Abre o documento direto no visualizador do aparelho (ex.: leitor de PDF), em vez da tela de
 * "compartilhar" que sugere aplicativos.
 *
 * - Android: dispara ACTION_VIEW com o content:// do arquivo. Se o usuário já tem um leitor
 *   padrão pra esse tipo, abre direto; se nenhum app souber abrir, cai no compartilhamento.
 * - iOS: não existe "abrir com app padrão" para arquivo local; usa a pré-visualização do sistema
 *   (folha do expo-sharing, que mostra o documento).
 */
export async function abrirDocumento(uri: string, mimeType?: string): Promise<void> {
  const arquivo = new File(uri);
  if (!arquivo.exists) {
    throw new Error('Arquivo não encontrado no dispositivo.');
  }
  const tipo = mimeType ?? mimeTypeDoArquivo(arquivo.name);

  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(ACTION_VIEW, {
        data: arquivo.contentUri,
        type: tipo,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return;
    } catch {
      // Nenhum app instalado abre esse tipo de arquivo: oferece o compartilhamento como alternativa.
    }
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Não é possível abrir arquivos neste dispositivo.');
  }
  await Sharing.shareAsync(arquivo.uri, { mimeType: tipo });
}
