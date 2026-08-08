import { getDb } from './client';
import type { OpcaoLista } from './sinistros';

const BOTOES_LIBERADOS = ['outro', 'fotos', 'docs', 'despesas', 'videos', 'preliminar', 'apolice', 'questionario'];

/** Porta de CampoSeguradora (cadoutroseg_def.js). */
export async function buscarSituacaoOutrosSeguros(idSinistro: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ outro_seguro: string | null }>(
    'select outro_seguro from sinimob where id_sinistro = ?',
    [idSinistro],
  );
  return row?.outro_seguro === 'S';
}

/** Porta de BuscaListaSeguradoras (cadoutroseg_def.js): todas as seguradoras, sem restrição. */
export async function listarSeguradoras(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_seguradora: number; nm_seguradora: string }>(
    'select id_seguradora, nm_seguradora from seguradora order by nm_seguradora',
  );
  return linhas.map((l) => ({ valor: l.id_seguradora, label: l.nm_seguradora }));
}

/** Porta de BuscaCoberturaDefault (cadoutroseg_def.js): sugestão de tipo/cobertura pra um novo registro. */
export async function buscarCoberturaDefault(idSinistro: number): Promise<{ tipoCob: string; idCobertura: number } | null> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ tipo_cob: string; id_cobertura: number }>(
    `select cb.tipo_cob, sc.id_cobertura
     from sinimobcob sc
     inner join cobertura cb on sc.id_cobertura = cb.id_cobertura
     where sc.id_sinistro = ?`,
    [idSinistro],
  );
  if (linhas.length === 0) return null;
  const ultima = linhas[linhas.length - 1];
  return { tipoCob: ultima.tipo_cob, idCobertura: ultima.id_cobertura };
}

export interface OutroSeguroResumo {
  id_outro: number;
  id_cobertura: number;
  tipo_cob: string;
  id_seguradora: number;
  apelido: string;
  data_ini_vig: string;
  data_fim_vig: string;
  apolice: string;
  vlr_lmi: string;
  vlr_franquia: string;
  perc_franquia: string;
}

/** Porta de BuscaListaOutrosCad (cadoutroseg_def.js). */
export async function listarOutrosSeguros(idSinistro: number): Promise<OutroSeguroResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<Record<string, unknown>>(
    `select so.*, se.apelido, cb.tipo_cob
     from sinimobcob_outro so
     inner join seguradora se on se.id_seguradora = so.id_seguradora
     inner join cobertura cb on cb.id_cobertura = so.id_cobertura
     where so.id_sinistro = ?
     order by so.data_ini_vig`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_outro: Number(l.id_outro),
    id_cobertura: Number(l.id_cobertura),
    tipo_cob: String(l.tipo_cob ?? ''),
    id_seguradora: Number(l.id_seguradora),
    apelido: String(l.apelido ?? ''),
    data_ini_vig: l.data_ini_vig != null ? String(l.data_ini_vig) : '',
    data_fim_vig: l.data_fim_vig != null ? String(l.data_fim_vig) : '',
    apolice: l.apolice != null ? String(l.apolice) : '',
    vlr_lmi: l.vlr_lmi != null ? String(l.vlr_lmi) : '',
    vlr_franquia: l.vlr_franquia != null ? String(l.vlr_franquia) : '',
    perc_franquia: l.perc_franquia != null ? String(l.perc_franquia) : '',
  }));
}

export interface DadosOutroSeguro {
  id_cobertura: number;
  id_seguradora: number;
  data_ini_vig: string | null;
  data_fim_vig: string | null;
  apolice: string;
  vlr_lmi: string;
  vlr_franquia: string;
  perc_franquia: string;
}

/** Porta de PermissaoBotaoZ (cadoutroseg_def.js). */
async function liberarBotoes(idSinistro: number): Promise<void> {
  const db = await getDb();
  for (const botao of BOTOES_LIBERADOS) {
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = ?", [
      idSinistro,
      botao,
    ]);
  }
}

/**
 * Porta de DetalhaOutrosSegX + ZeraOutrosSeguros (cadoutroseg_def.js): alterna a resposta
 * "Possui outros seguros?". Ao marcar Não, zera sinimob.outro_seguro e apaga os registros já
 * cadastrados (mesmo comportamento do legado). Ao marcar Sim, apenas libera os botões — o
 * outro_seguro='S' só é persistido de fato quando o primeiro item é salvo (AtualizaOutrosSeguros).
 */
export async function definirPossuiOutrosSeguros(idSinistro: number, possui: boolean): Promise<void> {
  const db = await getDb();
  if (!possui) {
    await db.withTransactionAsync(async () => {
      await db.runAsync("update sinimob set outro_seguro = 'N' where id_sinistro = ?", [idSinistro]);
      await db.runAsync('delete from sinimobcob_outro where id_sinistro = ?', [idSinistro]);
    });
  }
  await liberarBotoes(idSinistro);
}

/** Porta de AtualizaOutrosSeguros (cadoutroseg_def.js). */
export async function salvarOutroSeguro(idSinistro: number, idOutro: number | null, dados: DadosOutroSeguro): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync("update sinimob set novo_sini = 'N', outro_seguro = 'S' where id_sinistro = ?", [idSinistro]);

    if (!idOutro) {
      await db.runAsync(
        `insert into sinimobcob_outro
           (id_sinistro, id_cobertura, id_seguradora, data_ini_vig, data_fim_vig, apolice, vlr_lmi, vlr_franquia, perc_franquia)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idSinistro,
          dados.id_cobertura,
          dados.id_seguradora,
          dados.data_ini_vig,
          dados.data_fim_vig,
          dados.apolice,
          dados.vlr_lmi,
          dados.vlr_franquia,
          dados.perc_franquia,
        ],
      );
    } else {
      await db.runAsync(
        `update sinimobcob_outro set
           data_ini_vig = ?, data_fim_vig = ?, id_seguradora = ?, apolice = ?, vlr_lmi = ?, vlr_franquia = ?, perc_franquia = ?
         where id_sinistro = ? and id_cobertura = ? and id_outro = ?`,
        [
          dados.data_ini_vig,
          dados.data_fim_vig,
          dados.id_seguradora,
          dados.apolice,
          dados.vlr_lmi,
          dados.vlr_franquia,
          dados.perc_franquia,
          idSinistro,
          dados.id_cobertura,
          idOutro,
        ],
      );
    }
  });

  await liberarBotoes(idSinistro);
}

/** Porta de RemovendoRegistro (cadoutroseg_def.js). */
export async function excluirOutroSeguro(idSinistro: number, idCobertura: number, idOutro: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinimobcob_outro where id_sinistro = ? and id_cobertura = ? and id_outro = ?', [
    idSinistro,
    idCobertura,
    idOutro,
  ]);
}
