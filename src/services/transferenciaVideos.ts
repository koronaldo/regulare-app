import { File, UploadType } from 'expo-file-system';
import { Video } from 'react-native-compressor';

import { buscarVideoParaTransferencia, listarVideosParaTransferencia, marcarVideoEnviado, type VideoResumo } from '../db/videos';
import { lerCredenciais } from './credenciais';
import { requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_video_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_VIDEO_URL = new URL('atualiza_video_sinistro.php', requireApiUrl()).toString();

/** Vídeos já saem comprimidos da captura (ver processarVideo em videos.tsx); isso aqui é só uma rede de segurança pra arquivos importados da galeria ou que ainda assim ficaram grandes. */
const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024;

interface ArquivoParaEnvio {
  uri: string;
  temporario: boolean;
}

async function prepararArquivoParaEnvio(uri: string): Promise<ArquivoParaEnvio> {
  const original = new File(uri);
  if ((original.size ?? 0) <= TAMANHO_MAXIMO_BYTES) {
    return { uri, temporario: false };
  }

  const comprimidoPath = await Video.compress(uri, { compressionMethod: 'auto' });
  const comprimidoUri = comprimidoPath.startsWith('file://') ? comprimidoPath : `file://${comprimidoPath}`;
  return { uri: comprimidoUri, temporario: true };
}

async function enviarVideo(
  idSinistro: number,
  video: VideoResumo,
  usuario: string,
  senha: string,
): Promise<{ sucesso: boolean; mensagem: string }> {
  let arquivoEnvio: ArquivoParaEnvio | null = null;
  try {
    arquivoEnvio = await prepararArquivoParaEnvio(video.arquivo);
    const arquivo = new File(arquivoEnvio.uri);
    const extensao = arquivo.extension.replace(/^\./, '') || 'mp4';

    const resultado = await arquivo.upload(ATUALIZA_VIDEO_URL, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: `video/${extensao}`,
      parameters: {
        usuario,
        senha,
        id_sinistro: String(idSinistro),
        id_video: String(video.id_video),
        legenda: video.legenda,
        extensao,
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
        // best-effort: limpeza da cópia recompactada, não é crítico se falhar
      }
    }
  }
}

/**
 * Porta segura de ConferindoVideos/uploadFileVideos (transfere_sinistro_def_screen.js /
 * envia_fotos_servidor.js / transfere_videos_new.php): envia cada vídeo pendente (situacao <>
 * 'E') na ordem local, um por vez. Vídeos maiores que 20MB são recompactados antes do envio
 * (mesma função Video.compress já usada na captura), numa cópia à parte — o arquivo original
 * local não é alterado.
 */
export async function transferirVideos(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const videos = await listarVideosParaTransferencia(idSinistro);
  if (videos.length === 0) {
    return { sucesso: true, mensagem: 'Nenhum vídeo para transferir.' };
  }

  let enviados = 0;
  const falhas: string[] = [];

  for (const video of videos) {
    const resultado = await enviarVideo(idSinistro, video, credenciais.usuario, credenciais.senhaEnvio);
    if (resultado.sucesso) {
      enviados++;
      await marcarVideoEnviado(video.id_video);
    } else {
      falhas.push(`Vídeo ${video.ordem}: ${resultado.mensagem}`);
    }
  }

  if (falhas.length === 0) {
    return { sucesso: true, mensagem: `${enviados} vídeo(s) enviado(s) com sucesso.` };
  }

  return {
    sucesso: false,
    mensagem: `${enviados} enviado(s), ${falhas.length} com erro:\n${falhas.join('\n')}`,
  };
}

/** Transmite individualmente um único vídeo — botão "Enviar" na tela de Vídeos e Áudios. */
export async function transferirVideoUnico(idSinistro: number, idVideo: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const video = await buscarVideoParaTransferencia(idVideo);
  if (!video) {
    return { sucesso: false, mensagem: 'Vídeo não encontrado.' };
  }

  const resultado = await enviarVideo(idSinistro, video, credenciais.usuario, credenciais.senhaEnvio);
  if (resultado.sucesso) {
    await marcarVideoEnviado(video.id_video);
    return { sucesso: true, mensagem: 'Vídeo enviado com sucesso.' };
  }
  return { sucesso: false, mensagem: resultado.mensagem };
}
