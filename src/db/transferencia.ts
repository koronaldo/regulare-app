import { getDb } from './client';

export interface ItemTransferencia {
  id_tipotrans: number;
  nm_tipotrans: string;
  status_trans: 'S' | 'E' | 'N' | null;
  data_trans: string | null;
  hora_trans: string | null;
}

/** id_tipotrans de "Informações Gerais" no legado: exige que todos os itens da apólice estejam conferidos antes de liberar a transferência. */
const ID_TIPOTRANS_INFORMACOES = 4;

/**
 * Porta de SituacaoInformacoes (transfere_sinistro_def_screen.js): compara quantos itens da
 * apólice existem contra quantos já foram conferidos neste sinistro (sinistro_apolice).
 */
export async function informacoesCompletas(idSinistro: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ totseg: number; totsin: number }>(
    `select count(ai.id_item) as totseg, count(sa.id_item) as totsin
     from apolice_item ai
     left join sinistro_apolice sa on sa.id_item = ai.id_item and sa.id_sinistro = ?`,
    [idSinistro],
  );
  if (!row) return true;
  return row.totseg <= row.totsin;
}

/**
 * Porta de InicializaBotoes/VerificandoTopicos (transfere_sinistro_def_screen.js): garante uma
 * linha de status por tipo de transferência (criando como pendente as que faltarem) e devolve a
 * lista completa, na ordem cadastrada.
 */
export async function listarStatusTransferencia(idSinistro: number): Promise<ItemTransferencia[]> {
  const db = await getDb();

  const tipos = await db.getAllAsync<{ id_tipotrans: number }>('select id_tipotrans from tipo_trans');
  const existentes = await db.getAllAsync<{ id_tipotrans: number }>(
    'select id_tipotrans from sini_trans where id_sinistro = ?',
    [idSinistro],
  );
  const idsExistentes = new Set(existentes.map((e) => e.id_tipotrans));
  const faltando = tipos.filter((t) => !idsExistentes.has(t.id_tipotrans));

  if (faltando.length > 0) {
    await db.withTransactionAsync(async () => {
      for (const tipo of faltando) {
        await db.runAsync('insert into sini_trans (id_sinistro, id_tipotrans, status_trans) values (?, ?, ?)', [
          idSinistro,
          tipo.id_tipotrans,
          'N',
        ]);
      }
    });
  }

  return db.getAllAsync<ItemTransferencia>(
    `select tt.id_tipotrans, tt.nm_tipotrans, st.status_trans, st.data_trans, st.hora_trans
     from tipo_trans tt
     inner join sini_trans st on st.id_tipotrans = tt.id_tipotrans and st.id_sinistro = ?
     order by tt.ordem`,
    [idSinistro],
  );
}

export { ID_TIPOTRANS_INFORMACOES };
