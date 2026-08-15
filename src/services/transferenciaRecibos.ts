import { File, UploadType } from 'expo-file-system';

import { listarRecibosParaTransferencia, marcarReciboEnviado } from '../db/despesas';
import { gerarPdfDePaginas } from '../utils/documentoPdf';
import { lerCredenciais } from './credenciais';
import { requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_recibo_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_RECIBO_URL = new URL('atualiza_recibo_sinistro.php', requireApiUrl()).toString();

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
    let pdfGerado: string | null = null;
    try {
      pdfGerado = await gerarPdfDePaginas([{ arquivo: recibo.nome_recibo, formato: '4' }]);

      const arquivo = new File(pdfGerado);
      const resultado = await arquivo.upload(ATUALIZA_RECIBO_URL, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'application/pdf',
        parameters: {
          usuario: credenciais.usuario,
          senha: credenciais.senhaEnvio,
          id_sinistro: String(idSinistro),
          id_sinidesp: String(recibo.id_sinidesp),
          nm_despesa: recibo.nm_despesa,
          comple: recibo.comple,
        },
      });

      if (resultado.status !== 200) {
        falhas.push(`${recibo.nm_despesa}: HTTP ${resultado.status}`);
        continue;
      }

      let json: any;
      try {
        json = JSON.parse(resultado.body);
      } catch {
        const trecho = resultado.body.trim().slice(0, 300) || '(resposta vazia)';
        falhas.push(`${recibo.nm_despesa}: Resposta inválida do servidor: ${trecho}`);
        continue;
      }

      if (json?.result === true) {
        enviados++;
        await marcarReciboEnviado(recibo.id_sinidesp);
      } else {
        falhas.push(`${recibo.nm_despesa}: ${json?.msg ?? 'Erro desconhecido.'}`);
      }
    } catch (erro) {
      falhas.push(`${recibo.nm_despesa}: ${erro instanceof Error ? erro.message : 'falha ao gerar PDF'}`);
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

  if (falhas.length === 0) {
    return { sucesso: true, mensagem: `${enviados} comprovante(s) enviado(s) com sucesso.` };
  }

  return {
    sucesso: false,
    mensagem: `${enviados} enviado(s), ${falhas.length} com erro:\n${falhas.join('\n')}`,
  };
}
