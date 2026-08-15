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

/** id_tipotrans de "Dados cadastrais" no legado (ação DadosSinistro em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_CADASTRO = 1;

/** id_tipotrans de "Relato Segurado" e "Constatações Regulador" no legado — cada um mapeia pra um id_texto (sinitexto/sinitextomob). */
const ID_TIPOTRANS_RELATO = 2;
const ID_TIPOTRANS_CONSTATACOES = 3;
const ID_TEXTO_POR_TIPOTRANS: Record<number, number> = {
  [ID_TIPOTRANS_RELATO]: 4,
  [ID_TIPOTRANS_CONSTATACOES]: 5,
};

/** id_tipotrans de "Benfeitorias-Máquinas" no legado (ação DadosBenfeitoria em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_BENFEITORIAS = 13;

/** id_tipotrans de "Questionários" no legado (ação DadosQuestionario em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_QUESTIONARIO = 14;

/** id_tipotrans de "Coberturas" no legado (ação DadosCobertura em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_COBERTURAS = 5;

/** id_tipotrans de "Beneficiários" no legado (ação DadosBeneficiario em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_BENEFICIARIOS = 6;

/** id_tipotrans de "Planilha apuração" no legado (ação DadosPlanilha em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_PLANILHA = 7;

/** id_tipotrans de "Outros Seguros" no legado (ação DadosOutroSeg em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_OUTROSEG = 8;

/** id_tipotrans de "Album de fotografia" no legado (ação FotosSinistro em sicroniza_sinistro_new.php). */
const ID_TIPOTRANS_FOTOS = 9;

/** id_tipotrans de "Documentos digitalizados" no legado (transfere_pdf-2.0.php / transfere_recibo_pdf-2.0.php). */
const ID_TIPOTRANS_DOCUMENTOS = 10;

/** id_tipotrans de "Atas e termos" no legado (ConferindoAtasTermos/uploadFileATA) — separado de Documentos. */
const ID_TIPOTRANS_ATAS = 11;

/** id_tipotrans de "Vídeos & Áudios" no legado (ConferindoVideos/uploadFileVideos). */
const ID_TIPOTRANS_VIDEOS = 12;

/** id_tipotrans de "Comprovantes e Recibos" no legado (ConferindoRecibosDigitalizados/uploadRecibosPDF). */
const ID_TIPOTRANS_RECIBOS = 15;

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

/**
 * Grava o resultado de uma transferência (sucesso ou erro) no mesmo padrão do legado:
 * status_trans 'S'/'E' + data/hora do envio.
 */
export async function atualizarStatusTransferencia(
  idSinistro: number,
  idTipotrans: number,
  status: 'S' | 'E',
): Promise<void> {
  const db = await getDb();
  const agora = new Date();
  const data = agora.toISOString().slice(0, 10);
  const hora = agora.toTimeString().slice(0, 8);
  await db.runAsync(
    'update sini_trans set status_trans = ?, data_trans = ?, hora_trans = ? where id_sinistro = ? and id_tipotrans = ?',
    [status, data, hora, idSinistro, idTipotrans],
  );
}

export {
  ID_TIPOTRANS_INFORMACOES,
  ID_TIPOTRANS_CADASTRO,
  ID_TIPOTRANS_RELATO,
  ID_TIPOTRANS_CONSTATACOES,
  ID_TEXTO_POR_TIPOTRANS,
  ID_TIPOTRANS_BENFEITORIAS,
  ID_TIPOTRANS_QUESTIONARIO,
  ID_TIPOTRANS_COBERTURAS,
  ID_TIPOTRANS_BENEFICIARIOS,
  ID_TIPOTRANS_PLANILHA,
  ID_TIPOTRANS_OUTROSEG,
  ID_TIPOTRANS_FOTOS,
  ID_TIPOTRANS_DOCUMENTOS,
  ID_TIPOTRANS_ATAS,
  ID_TIPOTRANS_VIDEOS,
  ID_TIPOTRANS_RECIBOS,
};
