import { getDb } from './client';

/**
 * "Ação" do log é texto livre (não um enum fechado): além dos 3 eventos fixos (import, vistoria,
 * transferência), cada tela grava "<Entidade> inserido/alterado" a cada movimentação — ver
 * registrarInsercaoOuAlteracao().
 */
export type AcaoLog = string;

function dataHoraAtual(): string {
  const agora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())} ` +
    `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}`
  );
}

export async function registrarLog(idSinistro: number, acao: AcaoLog): Promise<void> {
  const db = await getDb();
  await db.runAsync('insert into sinistro_log (id_sinistro, data_hora, acao) values (?, ?, ?)', [
    idSinistro,
    dataHoraAtual(),
    acao,
  ]);
}

/**
 * Grava a mesma ação para vários processos de uma vez (ex.: import de login), com o mesmo carimbo
 * de data/hora. Sem transação própria — quem chama (importSinistros) já roda dentro de uma
 * transação maior (importarDadosLogin), e o SQLite não aceita transação aninhada.
 */
export async function registrarLogEmLote(idsSinistro: number[], acao: AcaoLog): Promise<void> {
  if (idsSinistro.length === 0) return;
  const db = await getDb();
  const dataHora = dataHoraAtual();
  for (const idSinistro of idsSinistro) {
    await db.runAsync('insert into sinistro_log (id_sinistro, data_hora, acao) values (?, ?, ?)', [
      idSinistro,
      dataHora,
      acao,
    ]);
  }
}

export interface LogRegistro {
  id_log: number;
  id_sinistro: number;
  nro_sinistro: string;
  nm_segurado: string;
  data_hora: string;
  acao: string;
}

/** Porta da tela "Consultar Logs": busca por número do processo ou nome do segurado (vazio = tudo). */
export async function buscarLogs(termo: string): Promise<LogRegistro[]> {
  const db = await getDb();
  const termoLimpo = termo.trim();

  if (!termoLimpo) {
    return db.getAllAsync<LogRegistro>(
      `select l.id_log, l.id_sinistro, m.nro_sinistro, m.nm_segurado, l.data_hora, l.acao
       from sinistro_log l
       inner join sinimob m on m.id_sinistro = l.id_sinistro
       order by l.data_hora desc, l.id_log desc`,
    );
  }

  const like = `%${termoLimpo}%`;
  return db.getAllAsync<LogRegistro>(
    `select l.id_log, l.id_sinistro, m.nro_sinistro, m.nm_segurado, l.data_hora, l.acao
     from sinistro_log l
     inner join sinimob m on m.id_sinistro = l.id_sinistro
     where m.nro_sinistro like ? or m.nm_segurado like ?
     order by l.data_hora desc, l.id_log desc`,
    [like, like],
  );
}
