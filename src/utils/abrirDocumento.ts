import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';

/** Intent.ACTION_VIEW do Android. */
const ACTION_VIEW = 'android.intent.action.VIEW';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION: deixa o app leitor ler o arquivo privado do Regulare. */
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
/**
 * Intent.FLAG_ACTIVITY_NEW_TASK: o leitor abre na tarefa dele, fora da pilha do Regulare. Sem isso
 * o leitor ficava "dentro" do app (startActivityForResult do expo-intent-launcher) e a promessa só
 * resolvia quando o leitor fechava — telas com "processando" ficavam travadas e não dava pra
 * alternar entre o PDF e o app. Com NEW_TASK o Android devolve na hora e a promessa resolve.
 */
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;
/** Intent.FLAG_ACTIVITY_NEW_DOCUMENT: cada arquivo aparece como janela própria nos recentes. */
const FLAG_ACTIVITY_NEW_DOCUMENT = 0x00080000;

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
 * - Android: dispara ACTION_VIEW com o content:// do arquivo, numa tarefa separada (o usuário
 *   alterna entre o arquivo e o app pelos recentes). Se o usuário já tem um leitor padrão pra
 *   esse tipo, abre direto; se nenhum app souber abrir, cai no compartilhamento.
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
        flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_NEW_DOCUMENT,
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
