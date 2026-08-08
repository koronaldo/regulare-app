function apiOrigin(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_URL não configurada. Defina-a em um arquivo .env na raiz do projeto (veja .env.example).',
    );
  }
  return new URL(url).origin;
}

export interface ArquivoServidor {
  nomeArquivo: string;
  nmFoto: string;
  semAcento: string;
  pathDocs: string;
}

/**
 * Porta de ComecaDownload (download_file_def.js): consulta quais arquivos de apólice/condições
 * gerais/aviso de sinistro já estão anexados a este sinistro. Usa confere_download.php dentro de
 * mobile-auth-v2/ (mesma pasta da API de login), versão padronizada (query parametrizada) do
 * endpoint legado que vivia em phonegap/uteis/ — pasta que será desativada.
 */
export async function buscarArquivosParaDownload(idSinistro: number): Promise<ArquivoServidor[]> {
  const url = `${apiOrigin()}/news/mobile-auth-v2/confere_download.php`;
  const body = new URLSearchParams({ acao: 'DownloadFile', idsini: String(idSinistro) }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=ISO-8859-1' },
      body,
    });
  } catch {
    throw new Error('Sem conexão com servidor!!!');
  }

  if (!response.ok) {
    throw new Error('Sem conexão com servidor!!!');
  }

  const json = await response.json();
  if (json?.result_download !== true || !Array.isArray(json.file_download)) {
    return [];
  }

  return json.file_download.map((f: Record<string, string>) => ({
    nomeArquivo: f.nome_arquivo ?? '',
    nmFoto: f.nm_foto ?? '',
    semAcento: (f.semacento ?? '').replace(/ /g, '_'),
    pathDocs: f.path_docs ?? '',
  }));
}

/** Porta da montagem de path_server (download_file_def.js). */
export function montarUrlArquivo(arquivo: ArquivoServidor): string {
  return `${apiOrigin()}/news/${arquivo.pathDocs}documentos/${encodeURIComponent(arquivo.nomeArquivo)}`;
}
