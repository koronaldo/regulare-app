import { getDb } from './client';

export interface DownloadResumo {
  id_download: number;
  path: string;
  fisico: string;
  file: string;
  labelFoto: string;
}

/** Porta de CarregaDownloadsInseridos (download_file_def.js). */
export async function listarDownloads(idSinistro: number): Promise<DownloadResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_download: number;
    path: string | null;
    fisico: string | null;
    file: string | null;
    label_foto: string | null;
  }>('select id_download, path, fisico, file, label_foto from sini_download where id_sinistro = ? order by id_download', [
    idSinistro,
  ]);
  return linhas.map((l) => ({
    id_download: l.id_download,
    path: l.path ?? '',
    fisico: l.fisico ?? '',
    file: l.file ?? '',
    labelFoto: l.label_foto ?? '',
  }));
}

export interface NovoDownload {
  path: string;
  fisico: string;
  file: string;
  labelFoto: string;
}

/** Porta de RegistraArquivoInserido (download_file_def.js): substitui um download anterior do mesmo arquivo. */
export async function inserirDownload(idSinistro: number, dados: NovoDownload): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sini_download where id_sinistro = ? and file = ?', [idSinistro, dados.file]);
    await db.runAsync(
      'insert into sini_download (id_sinistro, path, file, fisico, label_foto) values (?, ?, ?, ?, ?)',
      [idSinistro, dados.path, dados.file, dados.fisico, dados.labelFoto],
    );
  });
}

/** Porta de RemoveDoctoX (download_file_def.js, dentro de RemoveDownload). */
export async function excluirDownload(idDownload: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sini_download where id_download = ?', [idDownload]);
}
