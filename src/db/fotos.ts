import { getDb } from './client';
import { registrarLog } from './logs';

/** tipo_leg vem do servidor sem tratamento (espaços, minúsculas, nulo): normaliza antes de comparar. */
export function normalizarTipoLegenda(tipo: string | null | undefined): string {
  return (tipo ?? '').trim().toUpperCase();
}

/**
 * Só FC (Fixa + Complemento) e SC (Só Complemento) pedem texto complementar. Qualquer outro valor
 * — FX, vazio ou desconhecido — é tratado como legenda fixa e gravado direto, sem perguntar nada.
 */
export function legendaPedeComplemento(tipo: string | null | undefined): boolean {
  const t = normalizarTipoLegenda(tipo);
  return t === 'FC' || t === 'SC';
}

export interface LegendaFoto {
  id_legendaf: number;
  nm_legendaf: string;
  tipo_leg: string;
}

/**
 * Porta de MontaTabelaLegEXEC (tirarfotos_def_screen.js): legendas cadastráveis pra causa do
 * sinistro. tipo_leg define o comportamento ao capturar:
 *  - 'FX' (Fixa): grava a legenda com o texto da opção, sem pedir complemento.
 *  - 'FC' (Fixa + Complemento): pede um texto complementar e grava "label - complemento".
 *  - 'SC' (Só Complemento): pede um texto complementar e grava só ele, sem o label.
 * tipo_leg vem do servidor sem tratamento (pode ter espaço ou minúsculas), por isso é normalizado
 * com upper(trim()) na consulta antes de ser comparado com 'FX'/'FC'/'SC'.
 */
export async function listarLegendas(idSinistro: number): Promise<LegendaFoto[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id_causa_abe: number | null }>(
    'select id_causa_abe from sinimob where id_sinistro = ?',
    [idSinistro],
  );
  const idCausa = row?.id_causa_abe ?? 0;

  const linhas = await db.getAllAsync<{ id_legendaf: number; nm_legendaf: string; tipo_leg: string }>(
    `select lc.id_legendaf, lg.nm_legendaf, upper(trim(lg.tipo_leg)) as tipo_leg
     from legendafcausa lc
     inner join legendaf lg on lc.id_legendaf = lg.id_legendaf
     where lg.forma_leg = 'F' and lc.id_causa = ?
     order by lg.ordem_leg`,
    [idCausa],
  );
  return linhas;
}

export interface FotoResumo {
  id_foto: number;
  arquivo: string;
  legenda: string;
  situacao: string;
  posicao: string;
  ordem: number;
}

/** Porta de mostrarFotos/CarregaFotos (tirarfotos_def_screen.js). */
export async function listarFotos(idSinistro: number): Promise<FotoResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_foto: number;
    arquivo: string | null;
    legenda: string | null;
    situacao: string | null;
    posicao: string | null;
    ordem: number | string | null;
  }>('select id_foto, arquivo, legenda, situacao, posicao, ordem from sinifotoapp where id_sinistro = ? order by ordem', [
    idSinistro,
  ]);
  return linhas.map((l) => ({
    id_foto: l.id_foto,
    arquivo: l.arquivo ?? '',
    legenda: l.legenda ?? '',
    situacao: l.situacao ?? 'P',
    posicao: l.posicao ?? 'R',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  }));
}

/** Porta de UltimaFoto (tirarfotos_def_screen.js). */
async function proximaOrdem(idSinistro: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>('select count(*) as total from sinifotoapp where id_sinistro = ?', [
    idSinistro,
  ]);
  return (row?.total ?? 0) + 1;
}

export interface NovaFoto {
  arquivo: string;
  legenda: string;
  posicao: 'R' | 'P';
}

/** Porta de InserenoBDArquivo (tirarfotos_def_screen.js). */
export async function inserirFoto(idSinistro: number, dados: NovaFoto): Promise<void> {
  const db = await getDb();
  const ordem = await proximaOrdem(idSinistro);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `insert into sinifotoapp(id_sinistro, arquivo, legenda, situacao, posicao, ordem, ordleg, data_insere, hora_insere)
       values (?, ?, ?, 'P', ?, ?, 0, date('now'), time('now'))`,
      [idSinistro, dados.arquivo, dados.legenda, dados.posicao, ordem],
    );
    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'fotos'", [
      idSinistro,
    ]);
  });
  await registrarLog(idSinistro, 'Foto inserida');
}

/** Porta de AlteraLegenda (tirarfotos_def_screen.js, dentro de RenomeiaFoto). */
export async function renomearFoto(idFoto: number, novaLegenda: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinifotoapp set legenda = ? where id_foto = ?', [novaLegenda, idFoto]);
  const linha = await db.getFirstAsync<{ id_sinistro: number }>('select id_sinistro from sinifotoapp where id_foto = ?', [
    idFoto,
  ]);
  if (linha) await registrarLog(linha.id_sinistro, 'Foto alterada');
}

/** Usado ao girar a foto (funcionalidade nova): troca o arquivo (já rotacionado) e a posição. */
export async function atualizarArquivoFoto(idFoto: number, novoArquivo: string, novaPosicao: 'R' | 'P'): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinifotoapp set arquivo = ?, posicao = ? where id_foto = ?', [
    novoArquivo,
    novaPosicao,
    idFoto,
  ]);
}

/** Porta de RemoveFotoX (tirarfotos_def_screen.js, dentro de RemoveFoto). */
export async function excluirFoto(idFoto: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinifotoapp where id_foto = ?', [idFoto]);
}

/** Fotos ainda não confirmadas no servidor (situacao <> 'E'), na ordem em que devem ser enviadas. */
export async function listarFotosParaTransferencia(idSinistro: number): Promise<FotoResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_foto: number;
    arquivo: string | null;
    legenda: string | null;
    situacao: string | null;
    posicao: string | null;
    ordem: number | string | null;
  }>(
    `select id_foto, arquivo, legenda, situacao, posicao, ordem from sinifotoapp
     where id_sinistro = ? and (situacao is null or situacao <> 'E')
     order by ordem`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_foto: l.id_foto,
    arquivo: l.arquivo ?? '',
    legenda: l.legenda ?? '',
    situacao: l.situacao ?? 'P',
    posicao: l.posicao ?? 'R',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  }));
}

/** Busca uma única foto (por id_foto), pra transmitir individualmente. */
export async function buscarFotoParaTransferencia(idFoto: number): Promise<FotoResumo | null> {
  const db = await getDb();
  const l = await db.getFirstAsync<{
    id_foto: number;
    arquivo: string | null;
    legenda: string | null;
    situacao: string | null;
    posicao: string | null;
    ordem: number | string | null;
  }>('select id_foto, arquivo, legenda, situacao, posicao, ordem from sinifotoapp where id_foto = ?', [idFoto]);
  if (!l) return null;
  return {
    id_foto: l.id_foto,
    arquivo: l.arquivo ?? '',
    legenda: l.legenda ?? '',
    situacao: l.situacao ?? 'P',
    posicao: l.posicao ?? 'R',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  };
}

/** Porta de onUploadSuccess (envia_fotos_servidor.js): marca a foto como transferida com sucesso. */
export async function marcarFotoEnviada(idFoto: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("update sinifotoapp set situacao = 'E' where id_foto = ?", [idFoto]);
}

/** Porta de AtualizaTodas (tirarfotos_def_screen.js): renumera ordem sequencialmente após arrastar. */
export async function reordenarFotos(idSinistro: number, idsEmOrdem: number[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < idsEmOrdem.length; i++) {
      await db.runAsync('update sinifotoapp set ordem = ? where id_sinistro = ? and id_foto = ?', [
        i + 1,
        idSinistro,
        idsEmOrdem[i],
      ]);
    }
  });
}
