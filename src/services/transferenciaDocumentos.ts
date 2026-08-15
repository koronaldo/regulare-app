import { File, UploadType } from 'expo-file-system';

import {
  listarArquivosParaTransferencia,
  listarAtasParaTransferencia,
  listarInstanciasParaTransferencia,
  marcarArquivoEnviado,
  marcarInstanciaEnviada,
  type ArquivoParaTransferencia,
} from '../db/documentos';
import { gerarPdfDePaginas } from '../utils/documentoPdf';
import { lerCredenciais } from './credenciais';
import { requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_documento_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_DOCUMENTO_URL = new URL('atualiza_documento_sinistro.php', requireApiUrl()).toString();

interface EnvioDocumento {
  uri: string;
  idDocumento: number;
  chaveLocal: string;
  nomeExibicao: string;
  complemento: string;
}

async function enviarPdf(
  idSinistro: number,
  envio: EnvioDocumento,
  usuario: string,
  senha: string,
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    const arquivo = new File(envio.uri);
    const resultado = await arquivo.upload(ATUALIZA_DOCUMENTO_URL, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'application/pdf',
      parameters: {
        usuario,
        senha,
        id_sinistro: String(idSinistro),
        id_documento: String(envio.idDocumento),
        chave_local: envio.chaveLocal,
        nome_exibicao: envio.nomeExibicao,
        complemento: envio.complemento,
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
  }
}

/** Envia uma lista de arquivos já prontos (sinidocpdf) — usado tanto por Documentos quanto por Atas/Termos. */
async function enviarArquivosProntos(
  idSinistro: number,
  arquivos: ArquivoParaTransferencia[],
  usuario: string,
  senha: string,
): Promise<{ enviados: number; falhas: string[] }> {
  let enviados = 0;
  const falhas: string[] = [];

  for (const arquivo of arquivos) {
    const resultado = await enviarPdf(
      idSinistro,
      {
        uri: arquivo.nome_arquivo,
        idDocumento: arquivo.id_documento,
        chaveLocal: `PDF${arquivo.id_docpdf}`,
        nomeExibicao: arquivo.complemento ? `${arquivo.nm_documento} - ${arquivo.complemento}` : arquivo.nm_documento,
        complemento: arquivo.complemento,
      },
      usuario,
      senha,
    );
    if (resultado.sucesso) {
      enviados++;
      await marcarArquivoEnviado(arquivo.id_docpdf);
    } else {
      falhas.push(`${arquivo.nm_documento}: ${resultado.mensagem}`);
    }
  }

  return { enviados, falhas };
}

/**
 * Porta segura de ConferindoDocumentosDigitalizados/ConferindoDocumentosPDFs + uploadFilePDF/
 * uploadDocumentosPDF (transfere_sinistro_def_screen.js / envia_fotos_servidor.js /
 * transfere_pdf-2.0.php / transfere_recibo_pdf-2.0.php): cobre os dois tipos de documento —
 * páginas fotografadas (sinidocpag, agrupadas por grupopag) que precisam virar um PDF só antes
 * do envio, e arquivos já prontos (sinidocpdf) que já são enviados como estão. O PDF de cada
 * instância fotografada é gerado na hora da transferência (não fica salvo localmente, diferente
 * do legado, que mantinha o PDF mesclado sincronizado a cada alteração de página) — assim reflete
 * sempre a ordem/páginas atuais, mesmo se o usuário reordenou ou excluiu páginas depois da
 * última tentativa de envio. Atas/Termos assinadas também viram sinidocpdf (assinar.tsx usa o
 * mesmo inserirArquivo), mas têm opção própria (transferirAtas) — listarArquivosParaTransferencia
 * já exclui esses casos.
 */
export async function transferirDocumentos(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const [instancias, arquivos] = await Promise.all([
    listarInstanciasParaTransferencia(idSinistro),
    listarArquivosParaTransferencia(idSinistro),
  ]);

  if (instancias.length === 0 && arquivos.length === 0) {
    return { sucesso: true, mensagem: 'Nenhum documento para transferir.' };
  }

  let enviados = 0;
  const falhas: string[] = [];

  for (const instancia of instancias) {
    let pdfGerado: string | null = null;
    try {
      pdfGerado = await gerarPdfDePaginas(instancia.paginas);
      const resultado = await enviarPdf(
        idSinistro,
        {
          uri: pdfGerado,
          idDocumento: instancia.id_documento,
          chaveLocal: instancia.grupopag,
          nomeExibicao: instancia.complemento ? `${instancia.nm_documento} - ${instancia.complemento}` : instancia.nm_documento,
          complemento: instancia.complemento,
        },
        credenciais.usuario,
        credenciais.senhaEnvio,
      );
      if (resultado.sucesso) {
        enviados++;
        await marcarInstanciaEnviada(idSinistro, instancia.id_documento, instancia.grupopag);
      } else {
        falhas.push(`${instancia.nm_documento} (${instancia.grupopag}): ${resultado.mensagem}`);
      }
    } catch (erro) {
      falhas.push(`${instancia.nm_documento} (${instancia.grupopag}): ${erro instanceof Error ? erro.message : 'falha ao gerar PDF'}`);
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

  const resultadoArquivos = await enviarArquivosProntos(idSinistro, arquivos, credenciais.usuario, credenciais.senhaEnvio);
  enviados += resultadoArquivos.enviados;
  falhas.push(...resultadoArquivos.falhas);

  if (falhas.length === 0) {
    return { sucesso: true, mensagem: `${enviados} documento(s) enviado(s) com sucesso.` };
  }

  return {
    sucesso: false,
    mensagem: `${enviados} enviado(s), ${falhas.length} com erro:\n${falhas.join('\n')}`,
  };
}

/**
 * Porta segura de ConferindoAtasTermos + uploadFileATA (transfere_sinistro_def_screen.js /
 * envia_fotos_servidor.js), usando o mesmo atualiza_documento_sinistro.php: transfere as Atas/
 * Termos assinadas (sinidocpdf, identificadas via ataseg_doc) separadamente de "Documentos" —
 * opção própria na tela de transferência.
 */
export async function transferirAtas(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const atas = await listarAtasParaTransferencia(idSinistro);
  if (atas.length === 0) {
    return { sucesso: true, mensagem: 'Nenhuma ata/termo para transferir.' };
  }

  const { enviados, falhas } = await enviarArquivosProntos(idSinistro, atas, credenciais.usuario, credenciais.senhaEnvio);

  if (falhas.length === 0) {
    return { sucesso: true, mensagem: `${enviados} ata(s)/termo(s) enviado(s) com sucesso.` };
  }

  return {
    sucesso: false,
    mensagem: `${enviados} enviado(s), ${falhas.length} com erro:\n${falhas.join('\n')}`,
  };
}
