import { getDb } from './client';

export interface ResumoBancoLocal {
  tabelas: number;
  linhasTotal: number;
  porTabela: { tabela: string; linhas: number }[];
}

/** Usado só para confirmar visualmente (tela/console) que o schema e a importação rodaram. */
export async function resumoBancoLocal(): Promise<ResumoBancoLocal> {
  const db = await getDb();

  const nomes = await db.getAllAsync<{ name: string }>(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name",
  );

  const porTabela: { tabela: string; linhas: number }[] = [];
  let linhasTotal = 0;

  for (const { name } of nomes) {
    const row = await db.getFirstAsync<{ count: number }>(`select count(*) as count from "${name}"`);
    const linhas = row?.count ?? 0;
    porTabela.push({ tabela: name, linhas });
    linhasTotal += linhas;
  }

  return { tabelas: nomes.length, linhasTotal, porTabela };
}
