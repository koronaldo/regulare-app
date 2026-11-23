import { getDb } from './client';
import { registrarLog } from './logs';
import type { OpcaoLista } from './sinistros';

export interface ConfiguracaoDespesa {
  obrigaIdentificacao: boolean;
  idSeguradora: number | null;
  idSucursal: number | null;
}

/** Porta de SituacaoDespesa + BuscaSucursal (caddespesa_def_screen.js). */
export async function buscarConfiguracaoDespesa(idSinistro: number): Promise<ConfiguracaoDespesa> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    obriga_ident_despesa: number | boolean | null;
    id_seguradora: number | null;
    id_sucursal: number | null;
  }>(
    `select se.obriga_ident_despesa, sm.id_seguradora, sm.id_sucursal
     from sinimob sm
     left join seguradora se on se.id_seguradora = sm.id_seguradora
     where sm.id_sinistro = ?`,
    [idSinistro],
  );
  return {
    obrigaIdentificacao: !!row?.obriga_ident_despesa,
    idSeguradora: row?.id_seguradora ?? null,
    idSucursal: row?.id_sucursal ?? null,
  };
}

/** Porta de BuscaDespesa (caddespesa_def_screen.js): tipos de despesa cadastráveis. */
export async function listarDespesasDisponiveis(idSinistro: number, excluirJaLancadas: boolean): Promise<OpcaoLista[]> {
  const db = await getDb();
  const condicao = excluirJaLancadas
    ? 'and de.id_despesa not in (select id_despesa from sinidesp_iti where id_sinistro = ?)'
    : '';
  const params = excluirJaLancadas ? [idSinistro] : [];
  const linhas = await db.getAllAsync<{ id_despesa: number; nm_despesa: string }>(
    `select id_despesa, nm_despesa from despesa de where de.tipo = 'D' ${condicao} order by nm_despesa`,
    params,
  );
  return linhas.map((l) => ({ valor: l.id_despesa, label: l.nm_despesa }));
}

export interface LimiteDespesa {
  limiteIni: string;
  limiteFim: string;
  qtdeIni: string;
  qtdeFim: string;
}

const LIMITE_PADRAO: LimiteDespesa = { limiteIni: '0', limiteFim: '999999999', qtdeIni: '1', qtdeFim: '999999' };

/**
 * Porta de VerLimites (caddespesa_def_screen.js): busca em cascata — primeiro a config específica
 * da seguradora+sucursal, depois só a seguradora, depois o limite geral (sem seguradora definida).
 */
export async function buscarLimiteDespesa(
  idDespesa: number,
  idSeguradora: number | null,
  idSucursal: number | null,
): Promise<LimiteDespesa> {
  const db = await getDb();

  if (idSeguradora != null && idSucursal != null) {
    const porSucursal = await db.getFirstAsync<{
      limite_ini: string | number;
      limite_fim: string | number;
      qtde_ini: string | number;
      qtde_fim: string | number;
    }>(
      'select limite_ini, limite_fim, qtde_ini, qtde_fim from despesa_reg where id_despesa = ? and id_seguradora = ? and id_sucursal = ?',
      [idDespesa, idSeguradora, idSucursal],
    );
    if (porSucursal) {
      return {
        limiteIni: String(porSucursal.limite_ini),
        limiteFim: String(porSucursal.limite_fim),
        qtdeIni: String(porSucursal.qtde_ini),
        qtdeFim: String(porSucursal.qtde_fim),
      };
    }
  }

  if (idSeguradora != null) {
    const porSeguradora = await db.getFirstAsync<{
      limite_ini: string | number;
      limite_fim: string | number;
      qtde_ini: string | number;
      qtde_fim: string | number;
    }>('select limite_ini, limite_fim, qtde_ini, qtde_fim from despesa_reg where id_despesa = ? and id_seguradora = ?', [
      idDespesa,
      idSeguradora,
    ]);
    if (porSeguradora) {
      return {
        limiteIni: String(porSeguradora.limite_ini),
        limiteFim: String(porSeguradora.limite_fim),
        qtdeIni: String(porSeguradora.qtde_ini),
        qtdeFim: String(porSeguradora.qtde_fim),
      };
    }
  }

  const geral = await db.getFirstAsync<{
    limite_ini: string | number;
    limite_fim: string | number;
    qtde_ini: string | number;
    qtde_fim: string | number;
  }>('select limite_ini, limite_fim, qtde_ini, qtde_fim from despesa_reg where id_despesa = ? and id_seguradora is null', [
    idDespesa,
  ]);
  if (geral) {
    return {
      limiteIni: String(geral.limite_ini),
      limiteFim: String(geral.limite_fim),
      qtdeIni: String(geral.qtde_ini),
      qtdeFim: String(geral.qtde_fim),
    };
  }

  return LIMITE_PADRAO;
}

export interface DespesaResumo {
  id_sinidesp: number;
  id_despesa: number;
  nm_despesa: string;
  qtde: string;
  vlr_uni: string;
  vlr_tot: string;
  comple: string;
  nro_despesa: string;
  data_desp: string;
  nome_recibo: string;
  reciboEnviado: boolean;
}

/** Porta de CarregaDespesa (caddespesa_def_screen.js). */
export async function listarDespesasLancadas(idSinistro: number): Promise<DespesaResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<Record<string, unknown>>(
    `select sd.*, nm_despesa from sinidesp_iti sd
     inner join despesa de on sd.id_despesa = de.id_despesa
     where de.tipo = 'D' and sd.id_sinistro = ?
     order by sd.id_sinidesp`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_sinidesp: Number(l.id_sinidesp),
    id_despesa: Number(l.id_despesa),
    nm_despesa: String(l.nm_despesa ?? ''),
    qtde: l.qtde != null ? String(l.qtde) : '',
    vlr_uni: l.vlr_uni != null ? String(l.vlr_uni) : '',
    vlr_tot: l.vlr_tot != null ? String(l.vlr_tot) : '',
    comple: String(l.comple ?? ''),
    nro_despesa: String(l.nro_despesa ?? ''),
    data_desp: String(l.data_desp ?? ''),
    nome_recibo: String(l.nome_recibo ?? ''),
    reciboEnviado: !!l.id_despeweb,
  }));
}

export interface DadosDespesa {
  id_despesa: number;
  qtde: string;
  vlr_uni: string;
  vlr_tot: string;
  comple: string;
  nro_despesa: string;
  data_desp: string | null;
}

/** Porta de AtualizaDespesa (caddespesa_def_screen.js). */
export async function salvarDespesa(idSinistro: number, idSinidesp: number | null, dados: DadosDespesa): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (!idSinidesp) {
      await db.runAsync(
        `insert into sinidesp_iti (id_despeweb, id_sinistro, id_despesa, qtde, vlr_uni, vlr_tot, comple, formato, nro_despesa, data_desp)
         values (0, ?, ?, ?, ?, ?, ?, 'A2', ?, ?)`,
        [idSinistro, dados.id_despesa, dados.qtde, dados.vlr_uni, dados.vlr_tot, dados.comple, dados.nro_despesa, dados.data_desp],
      );
    } else {
      await db.runAsync(
        `update sinidesp_iti set vlr_uni = ?, qtde = ?, vlr_tot = ?, comple = ?, nro_despesa = ?, data_desp = ?
         where id_sinistro = ? and id_sinidesp = ?`,
        [dados.vlr_uni, dados.qtde, dados.vlr_tot, dados.comple, dados.nro_despesa, dados.data_desp, idSinistro, idSinidesp],
      );
    }
    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'despesas'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, idSinidesp ? 'Despesa alterada' : 'Despesa inserida');
}

/** Porta de RemovendoRegistro (caddespesa_def_screen.js). */
export async function excluirDespesa(idSinistro: number, idSinidesp: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinidesp_iti where id_sinistro = ? and id_sinidesp = ?', [idSinistro, idSinidesp]);
}

/** Porta de populateDB (caddespesa_def_screen.js): grava o comprovante fotografado da despesa. */
export async function salvarRecibo(idSinistro: number, idSinidesp: number, arquivo: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('update sinidesp_iti set nome_recibo = ? where id_sinistro = ? and id_sinidesp = ?', [
      arquivo,
      idSinistro,
      idSinidesp,
    ]);
    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
  });
}

/** Porta de RemoveReciboX (caddespesa_def_screen.js). */
export async function excluirRecibo(idSinistro: number, idSinidesp: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'update sinidesp_iti set nome_recibo = null, recibo_pdf = null where id_sinistro = ? and id_sinidesp = ?',
    [idSinistro, idSinidesp],
  );
}

export interface ReciboParaTransferencia {
  id_sinidesp: number;
  nome_recibo: string;
  nm_despesa: string;
  comple: string;
  /** Dados da despesa — o servidor grava em sinifoto pra despesa aparecer no itinerário. */
  id_despesa: number;
  qtde: string;
  vlr_uni: string;
  vlr_tot: string;
  nro_despesa: string;
  data_desp: string;
}

interface LinhaRecibo {
  id_sinidesp: number;
  nome_recibo: string | null;
  nm_despesa: string;
  comple: string | null;
  id_despesa: number;
  qtde: string | number | null;
  vlr_uni: string | number | null;
  vlr_tot: string | number | null;
  nro_despesa: string | null;
  data_desp: string | null;
}

const SELECT_RECIBO = `select sd.id_sinidesp, sd.nome_recibo, de.nm_despesa, sd.comple, sd.id_despesa,
       sd.qtde, sd.vlr_uni, sd.vlr_tot, sd.nro_despesa, sd.data_desp
     from sinidesp_iti sd
     inner join despesa de on de.id_despesa = sd.id_despesa`;

function paraRecibo(l: LinhaRecibo): ReciboParaTransferencia {
  return {
    id_sinidesp: l.id_sinidesp,
    nome_recibo: l.nome_recibo ?? '',
    nm_despesa: l.nm_despesa,
    comple: l.comple ?? '',
    id_despesa: l.id_despesa,
    qtde: l.qtde != null ? String(l.qtde) : '',
    vlr_uni: l.vlr_uni != null ? String(l.vlr_uni) : '',
    vlr_tot: l.vlr_tot != null ? String(l.vlr_tot) : '',
    nro_despesa: l.nro_despesa ?? '',
    data_desp: l.data_desp ?? '',
  };
}

/**
 * Comprovantes fotografados (sinidesp_iti.nome_recibo) ainda não confirmados no servidor.
 * id_despeweb não tem nenhum uso local hoje além deste — reaproveitado como flag de "já enviado"
 * (0/null = pendente), igual ao "chave_rec" que o legado devolvia e gravava de volta. O nome
 * "real"/legível do arquivo (com numeração de anexo etc.) é montado no servidor, não aqui — só
 * manda nm_despesa e complemento.
 */
export async function listarRecibosParaTransferencia(idSinistro: number): Promise<ReciboParaTransferencia[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<LinhaRecibo>(
    `${SELECT_RECIBO}
     where sd.id_sinistro = ? and sd.nome_recibo is not null and sd.nome_recibo <> ''
       and (sd.id_despeweb is null or sd.id_despeweb = 0)`,
    [idSinistro],
  );
  return linhas.map(paraRecibo);
}

/** Busca um único comprovante (por id_sinidesp), pra transmitir individualmente — não filtra por já enviado, pra permitir reenvio. */
export async function buscarReciboParaTransferencia(idSinidesp: number): Promise<ReciboParaTransferencia | null> {
  const db = await getDb();
  const l = await db.getFirstAsync<LinhaRecibo>(`${SELECT_RECIBO} where sd.id_sinidesp = ?`, [idSinidesp]);
  return l ? paraRecibo(l) : null;
}

export async function marcarReciboEnviado(idSinidesp: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinidesp_iti set id_despeweb = 1 where id_sinidesp = ?', [idSinidesp]);
}

export interface Deslocamento {
  kmInicial: string;
  kmFinal: string;
}

/** Porta de MontaCorpoDesloca (caddespesa_def_screen.js). */
export async function buscarDeslocamento(idSinistro: number): Promise<Deslocamento> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ km_inicial: string | number | null; km_final: string | number | null }>(
    'select km_inicial, km_final from sinimob where id_sinistro = ?',
    [idSinistro],
  );
  return {
    kmInicial: row?.km_inicial != null ? String(row.km_inicial) : '',
    kmFinal: row?.km_final != null ? String(row.km_final) : '',
  };
}

/** Porta de GravandoDeslocamento (caddespesa_def_screen.js). */
export async function salvarDeslocamento(idSinistro: number, kmInicial: string, kmFinal: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinimob set km_inicial = ?, km_final = ? where id_sinistro = ?', [
    kmInicial,
    kmFinal,
    idSinistro,
  ]);
}
