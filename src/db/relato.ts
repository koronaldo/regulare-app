import { getDb } from './client';
import { registrarLog } from './logs';

export interface SubtextoRelato {
  id_mobile: number;
  nm_mobile: string;
  ordem: number | null;
  resposta: string;
}

export interface RelatoInfo {
  idTexto: number;
  titulo: string;
  subtextos: SubtextoRelato[];
}

/** Porta de VerCausas (relsegurado_def.js): prefere id_causa (do regulador), cai pra id_causa_abe (do segurado). */
async function buscarCausaFiltro(idSinistro: number): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id_causa: number | null; id_causa_abe: number | null }>(
    'select id_causa, id_causa_abe from sinimob where id_sinistro = ?',
    [idSinistro],
  );
  if (!row) return null;
  return row.id_causa ?? row.id_causa_abe ?? null;
}

interface LinhaTextomob {
  id_mobile: number;
  nm_mobile: string;
  ordem: number | null;
  resposta_def: string | null;
  resposta: string | null;
}

/**
 * Porta de CarregaEstruturaRelato + CarregaEstruturaRelatoInstrucoes (relsegurado_def.js):
 * busca o título do texto (relato=4, parecer=5) e os subtextos padrão, filtrados pela causa
 * do sinistro; se nenhum subtexto for específico daquela causa, cai para a lista genérica do id_texto.
 * Cada subtexto vem preenchido com a resposta já salva (sinitextomob) ou, se ainda não houver,
 * com o texto padrão (resposta_def).
 */
export async function buscarRelato(idSinistro: number, idTexto: number): Promise<RelatoInfo> {
  const db = await getDb();

  const textoRow = await db.getFirstAsync<{ nm_texto: string }>('select nm_texto from textos where id_texto = ?', [
    idTexto,
  ]);

  const idCausa = await buscarCausaFiltro(idSinistro);

  let linhas: LinhaTextomob[] = [];

  if (idCausa != null) {
    linhas = await db.getAllAsync<LinhaTextomob>(
      `select tm.id_mobile, tm.nm_mobile, tm.ordem, tm.resposta_def, sm.resposta
       from textomob tm
       inner join textomob_causa tc on tm.id_texto = tc.id_texto and tm.id_mobile = tc.id_mobile
       left join sinitextomob sm on tm.id_texto = sm.id_texto and tm.id_mobile = sm.id_mobile and sm.id_sinistro = ?
       where tc.id_causa = ? and tm.id_texto = ?
       order by tm.ordem`,
      [idSinistro, idCausa, idTexto],
    );
  }

  if (linhas.length === 0) {
    linhas = await db.getAllAsync<LinhaTextomob>(
      `select tm.id_mobile, tm.nm_mobile, tm.ordem, tm.resposta_def, sm.resposta
       from textomob tm
       left join sinitextomob sm on tm.id_texto = sm.id_texto and tm.id_mobile = sm.id_mobile and sm.id_sinistro = ?
       where tm.id_texto = ?
       order by tm.ordem`,
      [idSinistro, idTexto],
    );
  }

  return {
    idTexto,
    titulo: textoRow?.nm_texto ?? '',
    subtextos: linhas.map((linha) => ({
      id_mobile: linha.id_mobile,
      nm_mobile: linha.nm_mobile,
      ordem: linha.ordem,
      resposta: linha.resposta ?? linha.resposta_def ?? '',
    })),
  };
}

/**
 * Porta de CarregaDadosConstatacoes/CarregaDadosTextos (transfere_sinistro_def_screen.js):
 * aglutina os subtextos salvos (sinitextomob, na ordem do catálogo) num único texto, separados
 * por linha em branco — é essa string única que vai para sinitexto.resposta no servidor.
 * Diferente do legado, ignora subtextos vazios em ambos os casos (lá só o relato-4 fazia isso;
 * pra constatações-5 o efeito prático era deixar parágrafos em branco no meio do texto).
 */
export async function montarTextoConcatenado(idSinistro: number, idTexto: number): Promise<string> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ resposta: string | null }>(
    `select sm.resposta
     from sinitextomob sm
     left join textomob tm on tm.id_texto = sm.id_texto and tm.id_mobile = sm.id_mobile
     where sm.id_sinistro = ? and sm.id_texto = ?
     order by tm.ordem`,
    [idSinistro, idTexto],
  );

  return linhas
    .map((linha) => linha.resposta?.trim() ?? '')
    .filter((resposta) => resposta !== '')
    .map((resposta) => resposta + '\n\n')
    .join('');
}

const BOTAO_POR_TEXTO: Record<number, string> = { 4: 'relato', 5: 'parecer' };

/**
 * Porta de AtualizaInstrucoes (relsegurado_def.js): substitui as respostas salvas (apaga e
 * reinsere, um registro por subtexto — a "aglutinação" num relato único acontece depois, na
 * geração do PDF/ata, não aqui) e libera o botão correspondente (relato ou parecer).
 */
export async function salvarRelato(
  idSinistro: number,
  idTexto: number,
  respostas: { id_mobile: number; resposta: string }[],
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sinitextomob where id_sinistro = ? and id_texto = ?', [idSinistro, idTexto]);

    for (const r of respostas) {
      await db.runAsync('insert into sinitextomob (id_sinistro, id_texto, id_mobile, resposta) values (?, ?, ?, ?)', [
        idSinistro,
        idTexto,
        r.id_mobile,
        r.resposta,
      ]);
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);

    const botao = BOTAO_POR_TEXTO[idTexto];
    if (botao) {
      await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = ?", [
        idSinistro,
        botao,
      ]);
    }

    // Constatações (5) é o passo anterior a Informações Gerais no fluxo guiado — libera o botão junto.
    if (idTexto === 5) {
      await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'informacoes'", [
        idSinistro,
      ]);
    }
  });

  await registrarLog(idSinistro, idTexto === 5 ? 'Constatações do Regulador alterado' : 'Relato do Segurado alterado');
}
