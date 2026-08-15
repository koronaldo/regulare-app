import { File, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { listarFotosParaTransferencia, marcarFotoEnviada, type FotoResumo } from '../db/fotos';
import { lerCredenciais } from './credenciais';
import { requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_foto_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_FOTO_URL = new URL('atualiza_foto_sinistro.php', requireApiUrl()).toString();

const TAMANHO_MAXIMO_BYTES = 1024 * 1024;
const LARGURA_COMPACTACAO = 1280;
const QUALIDADE_COMPACTACAO = 0.5;

interface ArquivoParaEnvio {
  uri: string;
  temporario: boolean;
}

/**
 * Fotos maiores que 1MB são recompactadas (redimensionadas + qualidade reduzida) antes do envio,
 * numa cópia à parte em cache — o arquivo original salvo localmente não é alterado.
 */
async function prepararArquivoParaEnvio(uri: string): Promise<ArquivoParaEnvio> {
  const original = new File(uri);
  if ((original.size ?? 0) <= TAMANHO_MAXIMO_BYTES) {
    return { uri, temporario: false };
  }

  const renderizada = await ImageManipulator.manipulate(uri).resize({ width: LARGURA_COMPACTACAO }).renderAsync();
  const resultado = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_COMPACTACAO });
  return { uri: resultado.uri, temporario: true };
}

async function enviarFoto(idSinistro: number, foto: FotoResumo, usuario: string, senha: string): Promise<{ sucesso: boolean; mensagem: string }> {
  let arquivoEnvio: ArquivoParaEnvio | null = null;
  try {
    arquivoEnvio = await prepararArquivoParaEnvio(foto.arquivo);
    const arquivo = new File(arquivoEnvio.uri);

    const resultado = await arquivo.upload(ATUALIZA_FOTO_URL, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'image/jpeg',
      parameters: {
        usuario,
        senha,
        id_sinistro: String(idSinistro),
        id_foto: String(foto.id_foto),
        legenda: foto.legenda,
        ordem: String(foto.ordem),
        situacao: foto.situacao,
      },
    });

    if (resultado.status !== 200) {
      return { sucesso: false, mensagem: `HTTP ${resultado.status}` };
    }

    let json: any;
    try {
      json = JSON.parse(resultado.body);
    } catch {
      const trecho = resultado.body.trim().slice(0, 300) || '(resposta vazia)';
      return { sucesso: false, mensagem: `Resposta inválida do servidor: ${trecho}` };
    }

    return { sucesso: json?.result === true, mensagem: json?.msg ?? 'Erro desconhecido.' };
  } catch (erro) {
    return { sucesso: false, mensagem: erro instanceof Error ? erro.message : 'Falha no envio.' };
  } finally {
    if (arquivoEnvio?.temporario) {
      try {
        const temporario = new File(arquivoEnvio.uri);
        if (temporario.exists) temporario.delete();
      } catch {
        // best-effort: limpeza da cópia compactada, não é crítico se falhar
      }
    }
  }
}

/**
 * Porta segura de ConferindoFotos/CarregaFotosSinistros + uploadImage (transfere_sinistro_def_screen.js
 * / envia_fotos_servidor.js / transfere_arquivos-2.0.php): envia cada foto pendente (situacao <>
 * 'E') na ordem local, uma por vez (preserva a ordem de exibição), pra atualiza_foto_sinistro.php.
 * Diferente do legado — que confiava no caminho do servidor mandado pelo próprio app — aqui o
 * servidor resolve o path_docs sozinho a partir do id_sinistro já autorizado.
 */
export async function transferirFotos(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const fotos = await listarFotosParaTransferencia(idSinistro);
  if (fotos.length === 0) {
    return { sucesso: true, mensagem: 'Nenhuma foto para transferir.' };
  }

  let enviadas = 0;
  const falhas: string[] = [];

  for (const foto of fotos) {
    const resultado = await enviarFoto(idSinistro, foto, credenciais.usuario, credenciais.senhaEnvio);
    if (resultado.sucesso) {
      enviadas++;
      await marcarFotoEnviada(foto.id_foto);
    } else {
      falhas.push(`Foto ${foto.ordem}: ${resultado.mensagem}`);
    }
  }

  if (falhas.length === 0) {
    return { sucesso: true, mensagem: `${enviadas} foto(s) enviada(s) com sucesso.` };
  }

  return {
    sucesso: false,
    mensagem: `${enviadas} enviada(s), ${falhas.length} com erro:\n${falhas.join('\n')}`,
  };
}
