import { File, UploadType } from 'expo-file-system';

import {
  buscarReciboParaTransferencia,
  listarRecibosParaTransferencia,
  marcarReciboEnviado,
  type ReciboParaTransferencia,
} from '../db/despesas';
import { gerarPdfDePaginas } from '../utils/documentoPdf';
import { lerCredenciais } from './credenciais';
import { requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_recibo_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_RECIBO_URL = new URL('atualiza_recibo_sinistro.php', requireApiUrl()).toString();

async function enviarRecibo(
  idSinistro: number,
  recibo: ReciboParaTransferencia,
  usuario: string,
  senha: string,
  token: string | undefined,
): Promise<{ sucesso: boolean; mensagem: string }> {
  let pdfGerado: string | null = null;
  try {
    pdfGerado = await gerarPdfDePaginas([{ arquivo: recibo.nome_recibo, formato: '4' }]);

    const arquivo = new File(pdfGerado);
    const resultado = await arquivo.upload(ATUALIZA_RECIBO_URL, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'application/pdf',
      parameters: {
        usuario,
        senha,
        ...(token ? { token } : {}),
        id_sinistro: String(idSinistro),
        id_sinidesp: String(recibo.id_sinidesp),
        nm_despesa: recibo.nm_despesa,
        comple: recibo.comple,
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
    return { sucesso: false, mensagem: erro instanceof Error ? erro.message : 'falha ao gerar PDF' };
  } finally {
    if (pdfGerado) {
      try {
        const temporario = new File(pdfGerado);
        if (temporario.exists) temporario.delete();
      } catch {
        // best-effort: limpeza do PDF gerado, não é crítico se falhar
      }
    }
  }
}

/**
 * Porta segura de ConferindoRecibosDigitalizados/uploadRecibosPDF (transfere_sinistro_def_screen.js
 * / envia_fotos_servidor.js / transfere_recibo_pdf-2.0.php): transforma a foto do comprovante em
 * PDF (mesmo formato de Documentos — uma página A4 por imagem) e envia pra
 * atualiza_recibo_sinistro.php, na mesma pasta "documentos/" usada pelos documentos anexados
 * (igual ao legado). O endpoint marca
 * o documento "Despesas" do catálogo (id_documento=338) como solicitado/entregue (sinidoc), monta
 * o nome "real" do comprovante (numeração de anexo + nome do documento + nome da despesa — nunca
 * usado como nome físico do arquivo, só em sinifoto.nm_foto) e grava vinculado a esse documento.
 */
export async function transferirRecibos(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const recibos = await listarRecibosParaTransferencia(idSinistro);
  if (recibos.length === 0) {
    return { sucesso: true, mensagem: 'Nenhum comprovante para transferir.' };
  }

  let enviados = 0;
  const falhas: string[] = [];

  for (const recibo of recibos) {
    const resultado = await enviarRecibo(idSinistro, recibo, credenciais.usuario, credenciais.senhaEnvio, credenciais.token);
    if (resultado.sucesso) {
      enviados++;
      await marcarReciboEnviado(recibo.id_sinidesp);
    } else {
      falhas.push(`${recibo.nm_despesa}: ${resultado.mensagem}`);
    }
  }

  if (falhas.length === 0) {
    return { sucesso: true, mensagem: `${enviados} comprovante(s) enviado(s) com sucesso.` };
  }

  return {
    sucesso: false,
    mensagem: `${enviados} enviado(s), ${falhas.length} com erro:\n${falhas.join('\n')}`,
  };
}

/** Transmite individualmente um único comprovante — botão "Enviar" na tela de Despesas. */
export async function transferirReciboUnico(idSinistro: number, idSinidesp: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const recibo = await buscarReciboParaTransferencia(idSinidesp);
  if (!recibo || !recibo.nome_recibo) {
    return { sucesso: false, mensagem: 'Comprovante não encontrado.' };
  }

  const resultado = await enviarRecibo(idSinistro, recibo, credenciais.usuario, credenciais.senhaEnvio, credenciais.token);
  if (resultado.sucesso) {
    await marcarReciboEnviado(recibo.id_sinidesp);
    return { sucesso: true, mensagem: 'Comprovante enviado com sucesso.' };
  }
  return { sucesso: false, mensagem: resultado.mensagem };
}
