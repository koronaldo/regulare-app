import { getDb } from './client';
import { registrarLog } from './logs';

export interface SubItemPlanilha {
  id_planilha: number;
  nm_planilha: string;
  qtde: string;
  vlr_uni_apr: string;
  vlr_tot_apr: string;
}

export interface ItemPlanilha {
  grupoitem: string;
  nm_planilha_item: string;
  subitens: SubItemPlanilha[];
  total: number;
}

/**
 * vlr_tot_apr é salvo no formato brasileiro (ex.: "12,50" ou "1.234,56"), então Number(...)
 * direto sempre vira NaN na vírgula. Também aceita number puro (coluna numeric com valor
 * "redondo" volta como number do SQLite) e string sem separador.
 */
function paraNumeroSeguro(valor: string | number | null | undefined): number {
  if (typeof valor === 'number') return Number.isNaN(valor) ? 0 : valor;
  if (!valor) return 0;
  const normalizado = valor.replace(/\./g, '').replace(',', '.');
  const n = Number(normalizado);
  return Number.isNaN(n) ? 0 : n;
}

/** Porta de CarregaPlanilha (cadplanilha_def.js), já agrupada por item (grupoitem). */
export async function listarItensPlanilha(idSinistro: number, idCobertura: number): Promise<ItemPlanilha[]> {
  const db = await getDb();
  // Colunas numeric(12,4): se o valor salvo "parece" um número puro (sem vírgula), o SQLite
  // guarda como INTEGER/REAL de verdade e devolve number, não string — por isso o String(...) abaixo.
  const linhas = await db.getAllAsync<{
    id_planilha: number;
    nm_planilha: string;
    qtde: string | number | null;
    vlr_uni_apr: string | number | null;
    vlr_tot_apr: string | number | null;
    grupoitem: string | null;
    nm_planilha_item: string | null;
  }>(
    `select id_planilha, nm_planilha, qtde, vlr_uni_apr, vlr_tot_apr, grupoitem, nm_planilha_item
     from planilha_apuracao
     where id_sinistro = ? and id_cobertura = ?
     order by grupoitem, nm_planilha`,
    [idSinistro, idCobertura],
  );

  const grupos = new Map<string, ItemPlanilha>();
  for (const l of linhas) {
    const grupoitem = l.grupoitem ?? 'GRU001';
    let grupo = grupos.get(grupoitem);
    if (!grupo) {
      grupo = { grupoitem, nm_planilha_item: l.nm_planilha_item ?? '', subitens: [], total: 0 };
      grupos.set(grupoitem, grupo);
    }
    const total = paraNumeroSeguro(l.vlr_tot_apr);
    grupo.subitens.push({
      id_planilha: l.id_planilha,
      nm_planilha: l.nm_planilha,
      qtde: l.qtde != null ? String(l.qtde) : '',
      vlr_uni_apr: l.vlr_uni_apr != null ? String(l.vlr_uni_apr) : '',
      vlr_tot_apr: l.vlr_tot_apr != null ? String(l.vlr_tot_apr) : '',
    });
    grupo.total += total;
  }

  return Array.from(grupos.values());
}

/** Porta de CarregaIndice (cadplanilha_def.js), simplificada: próximo código de grupo (GRU001, GRU002, ...). */
export async function proximoGrupo(idSinistro: number, idCobertura: number): Promise<string> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ grupoitem: string | null }>(
    'select distinct grupoitem from planilha_apuracao where id_sinistro = ? and id_cobertura = ?',
    [idSinistro, idCobertura],
  );

  let maior = 0;
  for (const l of linhas) {
    const numero = Number((l.grupoitem ?? '').replace('GRU', ''));
    if (!Number.isNaN(numero) && numero > maior) maior = numero;
  }

  return 'GRU' + String(maior + 1).padStart(3, '0');
}

export interface DadosSubItem {
  grupoitem: string;
  nm_planilha_item: string;
  nm_planilha: string;
  qtde: string;
  vlr_uni_apr: string;
  vlr_tot_apr: string;
}

/** Porta de AtualizaPlanilha (cadplanilha_def.js). */
export async function salvarSubItem(
  idSinistro: number,
  idCobertura: number,
  idPlanilha: number | null,
  dados: DadosSubItem,
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    if (!idPlanilha) {
      await db.runAsync(
        `insert into planilha_apuracao
           (id_sinistro, id_cobertura, nm_planilha, vlr_uni_apr, vlr_uni_rec, qtde, vlr_tot_apr, vlr_tot_rec, grupoitem, nm_planilha_item)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idSinistro,
          idCobertura,
          dados.nm_planilha,
          dados.vlr_uni_apr,
          dados.vlr_uni_apr,
          dados.qtde,
          dados.vlr_tot_apr,
          dados.vlr_tot_apr,
          dados.grupoitem,
          dados.nm_planilha_item,
        ],
      );
    } else {
      await db.runAsync(
        `update planilha_apuracao set
           nm_planilha = ?, vlr_uni_apr = ?, vlr_uni_rec = ?, qtde = ?, grupoitem = ?, nm_planilha_item = ?,
           vlr_tot_apr = ?, vlr_tot_rec = ?
         where id_planilha = ?`,
        [
          dados.nm_planilha,
          dados.vlr_uni_apr,
          dados.vlr_uni_apr,
          dados.qtde,
          dados.grupoitem,
          dados.nm_planilha_item,
          dados.vlr_tot_apr,
          dados.vlr_tot_apr,
          idPlanilha,
        ],
      );
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'planilha'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, idPlanilha ? 'Item de Planilha alterado' : 'Item de Planilha inserido');
}

/** Porta de AlteraNomeItem (cadplanilha_def.js): renomeia o item pai pra todos os subitens do grupo. */
export async function renomearItem(idSinistro: number, idCobertura: number, grupoitem: string, novoNome: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'update planilha_apuracao set nm_planilha_item = ? where id_sinistro = ? and id_cobertura = ? and grupoitem = ?',
    [novoNome, idSinistro, idCobertura, grupoitem],
  );
}

/** Porta de RemovendoRegistro (cadplanilha_def.js). */
export async function excluirSubItem(idSinistro: number, idCobertura: number, idPlanilha: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from planilha_apuracao where id_sinistro = ? and id_cobertura = ? and id_planilha = ?', [
    idSinistro,
    idCobertura,
    idPlanilha,
  ]);
}

export interface ItemPlanilhaTransferencia {
  id_cobertura: number;
  id_plaweb: number | null;
  grupoitem: string | null;
  nm_planilha: string | null;
  qtde: string | number | null;
  vlr_uni_apr: string | number | null;
  vlr_tot_apr: string | number | null;
  nm_planilha_item: string | null;
}

/** Porta de ConferindoPlanilhaApuracao/CarregaDadosPlanilha (transfere_sinistro_def_screen.js). */
export async function listarItensPlanilhaParaTransferencia(idSinistro: number): Promise<ItemPlanilhaTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<ItemPlanilhaTransferencia>(
    `select id_cobertura, id_plaweb, grupoitem, nm_planilha, qtde, vlr_uni_apr, vlr_tot_apr, nm_planilha_item
     from planilha_apuracao where id_sinistro = ?`,
    [idSinistro],
  );
}

/** Exclui o item inteiro (todos os subitens do grupo) — conveniência sobre o legado, que só excluía subitem a subitem. */
export async function excluirItem(idSinistro: number, idCobertura: number, grupoitem: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from planilha_apuracao where id_sinistro = ? and id_cobertura = ? and grupoitem = ?', [
    idSinistro,
    idCobertura,
    grupoitem,
  ]);
}
