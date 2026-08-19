import { Directory, Paths } from 'expo-file-system';

import { getDb } from './client';

/** Todas as tabelas locais que guardam alguma relação com um sinistro. */
const TABELAS_POR_ID_SINISTRO = [
  'sinimob',
  'btn_permissoes',
  'sini_download',
  'sini_outros',
  'sini_trans',
  'sinidocpag',
  'sinidocpdf',
  'sinidoc_exc',
  'sinidoc',
  'sinifotoapp',
  'sinivideoapp',
  'planilha_apuracao',
  'sinimobcob',
  'sinimobcob_outro',
  'sinitexto',
  'comunicador',
  'sinitextomob',
  'sinirisco',
  'sini_prod',
  'sinibenfe',
  'sinistro_maquina',
  'sinistro_apolice',
  'sinicobbeni',
  'sinidesp_iti',
];

/**
 * Apaga um sinistro por completo: registro principal, todas as tabelas relacionadas
 * (documentos, fotos, vídeos, despesas, planilha, coberturas, etc.) e a pasta
 * RegulareFiles/{idSinistro}/ inteira no armazenamento do aparelho (fotos, vídeos,
 * documentos e recibos físicos). Ação local — não afeta o servidor.
 */
export async function excluirSinistroCompleto(idSinistro: number): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    for (const tabela of TABELAS_POR_ID_SINISTRO) {
      await db.runAsync(`delete from ${tabela} where id_sinistro = ?`, [idSinistro]);
    }
  });

  const pasta = new Directory(Paths.document, 'RegulareFiles', String(idSinistro));
  if (pasta.exists) pasta.delete();
}

/**
 * Porta de "Limpar Dispositivo" (menu do dashboard): apaga TODOS os processos e os respectivos
 * logs salvos no aparelho, mas preserva o cadastro do usuário logado (tabelas `usuarioff` e
 * `config`) — a sessão continua ativa depois de limpar. Ação local — não afeta o servidor.
 */
export async function limparTodosOsProcessos(): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    for (const tabela of [...TABELAS_POR_ID_SINISTRO, 'sinistro_log']) {
      await db.runAsync(`delete from ${tabela}`);
    }
  });

  const pasta = new Directory(Paths.document, 'RegulareFiles');
  if (pasta.exists) pasta.delete();
}
