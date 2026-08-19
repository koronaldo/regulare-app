import { getDb } from './client';
import { registrarLog } from './logs';

export interface LegendaVideo {
  id_legendaf: number;
  nm_legendaf: string;
  tipo_leg: string;
}

/** Porta de MontaTabelaLegEXEC (capturavideo_def_screen.js), restrita a legendas de vídeo (forma_leg='V'). */
export async function listarLegendas(idSinistro: number): Promise<LegendaVideo[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id_causa_abe: number | null }>(
    'select id_causa_abe from sinimob where id_sinistro = ?',
    [idSinistro],
  );
  const idCausa = row?.id_causa_abe ?? 0;

  const linhas = await db.getAllAsync<{ id_legendaf: number; nm_legendaf: string; tipo_leg: string }>(
    `select lc.id_legendaf, lg.nm_legendaf, lg.tipo_leg
     from legendafcausa lc
     inner join legendaf lg on lc.id_legendaf = lg.id_legendaf
     where lg.forma_leg = 'V' and lc.id_causa = ?
     order by lg.ordem_leg`,
    [idCausa],
  );
  return linhas;
}

export interface VideoResumo {
  id_video: number;
  arquivo: string;
  legenda: string;
  situacao: string;
  ordem: number;
}

/** Porta de mostrarVideos/CarregaVideos (capturavideo_def_screen.js). */
export async function listarVideos(idSinistro: number): Promise<VideoResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_video: number;
    arquivo: string | null;
    legenda: string | null;
    situacao: string | null;
    ordem: number | string | null;
  }>('select id_video, arquivo, legenda, situacao, ordem from sinivideoapp where id_sinistro = ? order by ordem', [
    idSinistro,
  ]);
  return linhas.map((l) => ({
    id_video: l.id_video,
    arquivo: l.arquivo ?? '',
    legenda: l.legenda ?? '',
    situacao: l.situacao ?? 'P',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  }));
}

async function proximaOrdem(idSinistro: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    'select count(*) as total from sinivideoapp where id_sinistro = ?',
    [idSinistro],
  );
  return (row?.total ?? 0) + 1;
}

export interface NovoVideo {
  arquivo: string;
  legenda: string;
}

/** Porta de InserenoBDArquivo (capturavideo_def_screen.js). */
export async function inserirVideo(idSinistro: number, dados: NovoVideo): Promise<void> {
  const db = await getDb();
  const ordem = await proximaOrdem(idSinistro);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `insert into sinivideoapp (id_sinistro, arquivo, legenda, situacao, posicao, ordem, ordleg)
       values (?, ?, ?, 'P', 'R', ?, ?)`,
      [idSinistro, dados.arquivo, dados.legenda, ordem, ordem],
    );
    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'videos'", [
      idSinistro,
    ]);
  });
  await registrarLog(idSinistro, 'Vídeo/Áudio inserido');
}

/** Porta de AlteraLegenda (capturavideo_def_screen.js, dentro de RenomeiaVideo). */
export async function renomearVideo(idVideo: number, novaLegenda: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinivideoapp set legenda = ? where id_video = ?', [novaLegenda, idVideo]);
  const linha = await db.getFirstAsync<{ id_sinistro: number }>('select id_sinistro from sinivideoapp where id_video = ?', [
    idVideo,
  ]);
  if (linha) await registrarLog(linha.id_sinistro, 'Vídeo/Áudio alterado');
}

/** Porta de RemoveVideoX (capturavideo_def_screen.js). */
export async function excluirVideo(idVideo: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinivideoapp where id_video = ?', [idVideo]);
}

/** Vídeos ainda não confirmados no servidor (situacao <> 'E'), na ordem em que devem ser enviados. */
export async function listarVideosParaTransferencia(idSinistro: number): Promise<VideoResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_video: number;
    arquivo: string | null;
    legenda: string | null;
    situacao: string | null;
    ordem: number | string | null;
  }>(
    `select id_video, arquivo, legenda, situacao, ordem from sinivideoapp
     where id_sinistro = ? and (situacao is null or situacao <> 'E')
     order by ordem`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_video: l.id_video,
    arquivo: l.arquivo ?? '',
    legenda: l.legenda ?? '',
    situacao: l.situacao ?? 'P',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  }));
}

/** Busca um único vídeo (por id_video), pra transmitir individualmente. */
export async function buscarVideoParaTransferencia(idVideo: number): Promise<VideoResumo | null> {
  const db = await getDb();
  const l = await db.getFirstAsync<{
    id_video: number;
    arquivo: string | null;
    legenda: string | null;
    situacao: string | null;
    ordem: number | string | null;
  }>('select id_video, arquivo, legenda, situacao, ordem from sinivideoapp where id_video = ?', [idVideo]);
  if (!l) return null;
  return {
    id_video: l.id_video,
    arquivo: l.arquivo ?? '',
    legenda: l.legenda ?? '',
    situacao: l.situacao ?? 'P',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  };
}

/** Porta de onUploadSuccessVideo (envia_fotos_servidor.js): marca o vídeo como transferido com sucesso. */
export async function marcarVideoEnviado(idVideo: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("update sinivideoapp set situacao = 'E' where id_video = ?", [idVideo]);
}
