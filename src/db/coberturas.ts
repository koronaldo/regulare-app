import { getDb } from './client';
import { registrarLog } from './logs';
import type { OpcaoLista } from './sinistros';

export const OPCOES_TIPO_COBERTURA: OpcaoLista[] = [
  { valor: 'PRE', label: 'PRÉDIO' },
  { valor: 'MMU', label: 'MMU' },
  { valor: 'MMP', label: 'MMP' },
  { valor: 'VAL', label: 'VALOR' },
  { valor: 'VER', label: 'VERBA ÚNICA' },
];

/** Porta de BuscaCoberturas (cadcobertura_def.js): coberturas cadastráveis, filtradas por tipo. */
export async function listarCoberturasPorTipo(tipoCob: string): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_cobertura: number; nm_cobertura: string }>(
    'select id_cobertura, nm_cobertura from cobertura where tipo_cob = ? order by nm_cobertura',
    [tipoCob],
  );
  return linhas.map((l) => ({ valor: l.id_cobertura, label: l.nm_cobertura }));
}

export interface CoberturaResumo {
  id_sinicob: number;
  id_cobertura: number;
  nm_cobertura: string;
  tipo_cob: string;
  verba_unica: boolean;
  porteira: boolean;
  perc_predio: string;
  perc_conteudo: string;
  item_apolice: string;
  nro_cob: string;
  complemento: string;
  vlr_cobertura: string;
  perc_franquia: string;
  vlr_franquia: string;
  vlr_cob_estima: string;
  reclamado: string;
}

/** Porta de CarregaCobertura (cadcobertura_def.js). */
export async function listarCoberturas(idSinistro: number): Promise<CoberturaResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<Record<string, unknown>>(
    `select sb.*, cb.tipo_cob, cb.nm_cobertura
     from sinimobcob sb
     inner join cobertura cb on sb.id_cobertura = cb.id_cobertura
     where sb.id_sinistro = ?
     order by sb.id_cobertura`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_sinicob: Number(l.id_sinicob),
    id_cobertura: Number(l.id_cobertura),
    nm_cobertura: String(l.nm_cobertura ?? ''),
    tipo_cob: String(l.tipo_cob ?? ''),
    verba_unica: !!l.verba_unica,
    porteira: !!l.porteira,
    perc_predio: l.perc_predio != null ? String(l.perc_predio) : '',
    perc_conteudo: l.perc_conteudo != null ? String(l.perc_conteudo) : '',
    item_apolice: l.item_apolice != null ? String(l.item_apolice) : '',
    nro_cob: l.nro_cob != null ? String(l.nro_cob) : '',
    complemento: l.complemento != null ? String(l.complemento) : '',
    vlr_cobertura: l.vlr_cobertura != null ? String(l.vlr_cobertura) : '',
    perc_franquia: l.perc_franquia != null ? String(l.perc_franquia) : '',
    vlr_franquia: l.vlr_franquia != null ? String(l.vlr_franquia) : '',
    vlr_cob_estima: l.vlr_cob_estima != null ? String(l.vlr_cob_estima) : '',
    reclamado: l.reclamado != null ? String(l.reclamado) : '',
  }));
}

export interface DadosCobertura {
  id_cobertura: number;
  destino_lmi: 'VER' | 'POR' | '';
  perc_predio: string;
  perc_conteudo: string;
  item_apolice: string;
  nro_cob: string;
  complemento: string;
  vlr_cobertura: string;
  perc_franquia: string;
  vlr_franquia: string;
  vlr_cob_estima: string;
  reclamado: string;
}

const TABELAS_CASCATA_COBERTURA = ['sinicobbeni', 'sinimobcob_outro', 'planilha_apuracao', 'sinibenfe'];

/** Porta de AtualizaCobertura (cadcobertura_def.js). */
export async function salvarCobertura(
  idSinistro: number,
  idSinicob: number | null,
  idCoberturaAnterior: number | null,
  dados: DadosCobertura,
): Promise<void> {
  const db = await getDb();
  const verbaUnica = dados.destino_lmi === 'VER' ? 1 : 0;
  const porteira = dados.destino_lmi === 'POR' ? 1 : 0;

  await db.withTransactionAsync(async () => {
    if (!idSinicob) {
      await db.runAsync(
        `insert into sinimobcob
           (id_sinistro, id_cobertura, verba_unica, porteira, perc_predio, perc_conteudo, item_apolice,
            nro_cob, complemento, vlr_cobertura, perc_franquia, vlr_franquia, vlr_cob_estima, reclamado)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idSinistro,
          dados.id_cobertura,
          verbaUnica,
          porteira,
          dados.perc_predio,
          dados.perc_conteudo,
          dados.item_apolice,
          dados.nro_cob,
          dados.complemento,
          dados.vlr_cobertura,
          dados.perc_franquia,
          dados.vlr_franquia,
          dados.vlr_cob_estima,
          dados.reclamado,
        ],
      );
    } else {
      await db.runAsync(
        `update sinimobcob set
           id_cobertura = ?, verba_unica = ?, porteira = ?, perc_predio = ?, perc_conteudo = ?,
           item_apolice = ?, nro_cob = ?, complemento = ?, vlr_cobertura = ?, perc_franquia = ?,
           vlr_franquia = ?, vlr_cob_estima = ?, reclamado = ?
         where id_sinicob = ? and id_sinistro = ?`,
        [
          dados.id_cobertura,
          verbaUnica,
          porteira,
          dados.perc_predio,
          dados.perc_conteudo,
          dados.item_apolice,
          dados.nro_cob,
          dados.complemento,
          dados.vlr_cobertura,
          dados.perc_franquia,
          dados.vlr_franquia,
          dados.vlr_cob_estima,
          dados.reclamado,
          idSinicob,
          idSinistro,
        ],
      );
    }

    // Reassocia registros que ainda apontavam pra cobertura anterior (ou sem cobertura definida)
    // pra nova cobertura escolhida — mesmo comportamento do legado ao trocar o tipo/cobertura de um item já salvo.
    for (const tabela of TABELAS_CASCATA_COBERTURA) {
      await db.runAsync(
        `update ${tabela} set id_cobertura = ?
         where id_sinistro = ? and (id_cobertura = ? or id_cobertura is null or id_cobertura = 0)`,
        [dados.id_cobertura, idSinistro, idCoberturaAnterior ?? 0],
      );
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'coberturas'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, idSinicob ? 'Cobertura alterada' : 'Cobertura inserida');
}

const LABEL_PENDENCIA: Record<string, string> = {
  sinimobcob_outro: 'OUTROS SEGUROS',
  sinicobbeni: 'BENEFICIÁRIOS',
  planilha_apuracao: 'PLANILHA DE APURAÇÃO',
  sinibenfe: 'BENFEITORIAS OU MÁQUINAS',
};

/** Porta de VerificaPendencias (cadcobertura_def.js): impede excluir cobertura já usada em outro cadastro. */
export async function verificarPendenciasCobertura(idSinistro: number, idCobertura: number): Promise<string[]> {
  const db = await getDb();
  const pendencias: string[] = [];

  for (const tabela of TABELAS_CASCATA_COBERTURA) {
    const row = await db.getFirstAsync<{ total: number }>(
      `select count(*) as total from ${tabela} where id_sinistro = ? and id_cobertura = ?`,
      [idSinistro, idCobertura],
    );
    if ((row?.total ?? 0) > 0) pendencias.push(LABEL_PENDENCIA[tabela]);
  }

  return pendencias;
}

/** Porta de RemovendoRegistro (cadcobertura_def.js). */
export async function excluirCobertura(idSinistro: number, idSinicob: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinimobcob where id_sinistro = ? and id_sinicob = ?', [idSinistro, idSinicob]);
}

export interface CoberturaTransferencia {
  id_cobertura: number;
  verba_unica: number | null;
  porteira: number | null;
  perc_predio: string | number | null;
  perc_conteudo: string | number | null;
  item_apolice: string | null;
  nro_cob: string | null;
  complemento: string | null;
  vlr_cobertura: string | number | null;
  perc_franquia: string | number | null;
  vlr_franquia: string | number | null;
  vlr_cob_estima: string | number | null;
  reclamado: string | null;
  texto_cg: string | null;
}

/** Porta de ConferindoDuplicidadeCobertura/CarregaDadosCobertura (transfere_sinistro_def_screen.js). */
export async function listarCoberturasParaTransferencia(idSinistro: number): Promise<CoberturaTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<CoberturaTransferencia>(
    `select id_cobertura, verba_unica, porteira, perc_predio, perc_conteudo, item_apolice, nro_cob,
       complemento, vlr_cobertura, perc_franquia, vlr_franquia, vlr_cob_estima, reclamado, texto_cg
     from sinimobcob where id_sinistro = ?`,
    [idSinistro],
  );
}
