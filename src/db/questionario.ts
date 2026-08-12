import { getDb } from './client';

export interface OpcaoQuestionario {
  id_prodques: number;
  nm_prodques: string;
}

export interface OpcaoResposta {
  id_resprod: number;
  nm_resprod: string;
}

export interface Pergunta {
  id_perprod: number;
  nm_perprod: string;
  comenta: boolean;
  nomcpf: boolean;
  resposta_ref: string | null;
  opcoes: OpcaoResposta[];
  id_resprod_selecionado: number | null;
  nome_terceiro: string;
  cpf_terceiro: string;
  comentario: string;
}

export interface GrupoPerguntas {
  id_grupoper: number;
  nm_grupoper: string;
  perguntas: Pergunta[];
}

/** Porta de MontaFiltro (questionario_def.js): questionários disponíveis para a seguradora/produto do sinistro. */
export async function listarQuestionariosDisponiveis(
  idSeguradora: number | null,
  idProduto: number | null,
): Promise<OpcaoQuestionario[]> {
  if (!idSeguradora || !idProduto) return [];
  const db = await getDb();
  return db.getAllAsync<OpcaoQuestionario>(
    `select pq.id_prodques, pq.nm_prodques
     from prod_questao pq
     inner join segproduto_prod_questao sp on sp.id_prodques = pq.id_prodques
     where sp.id_seguradora = ? and sp.id_produto = ?
     order by pq.nm_prodques`,
    [idSeguradora, idProduto],
  );
}

interface LinhaPergunta {
  id_grupoper: number | null;
  nm_grupoper: string | null;
  id_perprod: number;
  nm_perprod: string;
  comenta: number | boolean | null;
  nomcpf: number | boolean | null;
  ordem: number | null;
  resposta_ref: string | null;
  id_resprod: number | null;
  nm_resprod: string | null;
  respondido: number | null;
  nm_terce: string | null;
  cpf_terce: string | null;
  complemento: string | null;
}

/** Porta de VerRelaQuestoes/MontaArrays (questionario_def.js): perguntas do questionário agrupadas, já com as respostas salvas do sinistro. */
export async function buscarPerguntas(idSinistro: number, idProdques: number): Promise<GrupoPerguntas[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<LinhaPergunta>(
    `select pg.id_grupoper, pg.nm_grupoper,
       pp.id_perprod, pp.nm_perprod, pp.comenta, pp.nomcpf, pp.ordem, pp.resposta_ref,
       pr.id_resprod, pr.nm_resprod,
       sp.id_resprod as respondido, sp.nm_terce, sp.cpf_terce, sp.complemento
     from prod_questao_per pp
     left join prod_questao_grupo pg on pg.id_grupoper = pp.id_grupoper and pg.id_prodques = pp.id_prodques
     left join prod_questao_res pr on pr.id_perprod = pp.id_perprod
     left join sini_prod sp on sp.id_perprod = pp.id_perprod and sp.id_sinistro = ?
     where pp.id_prodques = ?
     order by pg.id_grupoper, pp.ordem, pp.id_perprod, pr.id_resprod`,
    [idSinistro, idProdques],
  );

  const grupos = new Map<number, GrupoPerguntas>();
  const perguntas = new Map<number, Pergunta>();

  for (const linha of linhas) {
    const idGrupo = linha.id_grupoper ?? 0;
    let grupo = grupos.get(idGrupo);
    if (!grupo) {
      grupo = { id_grupoper: idGrupo, nm_grupoper: linha.nm_grupoper ?? '', perguntas: [] };
      grupos.set(idGrupo, grupo);
    }

    let pergunta = perguntas.get(linha.id_perprod);
    if (!pergunta) {
      pergunta = {
        id_perprod: linha.id_perprod,
        nm_perprod: linha.nm_perprod,
        comenta: !!linha.comenta,
        nomcpf: !!linha.nomcpf,
        resposta_ref: linha.resposta_ref,
        opcoes: [],
        id_resprod_selecionado: linha.respondido,
        nome_terceiro: linha.nm_terce ?? '',
        cpf_terceiro: linha.cpf_terce ?? '',
        comentario: linha.complemento ?? '',
      };
      perguntas.set(linha.id_perprod, pergunta);
      grupo.perguntas.push(pergunta);
    }
    if (linha.id_resprod != null) {
      pergunta.opcoes.push({ id_resprod: linha.id_resprod, nm_resprod: linha.nm_resprod ?? '' });
    }
  }

  return Array.from(grupos.values());
}

/** Porta de RegistraResposta (questionario_def.js) para uma resposta selecionada: apaga a anterior e grava a nova. */
export async function salvarResposta(
  idSinistro: number,
  idPerprod: number,
  idResprod: number,
  extras: { nomeTerceiro?: string; cpfTerceiro?: string; comentario?: string },
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sini_prod where id_sinistro = ? and id_perprod = ?', [idSinistro, idPerprod]);
    await db.runAsync(
      `insert into sini_prod (id_sinistro, id_resprod, nm_terce, cpf_terce, complemento, id_perprod)
       values (?, ?, ?, ?, ?, ?)`,
      [idSinistro, idResprod, extras.nomeTerceiro ?? '', extras.cpfTerceiro ?? '', extras.comentario ?? '', idPerprod],
    );
  });
}

/** Porta do ramo `presp=='0'` de RegistraResposta: atualiza nome/CPF/comentário sem mudar a resposta marcada. */
export async function salvarExtrasResposta(
  idSinistro: number,
  idPerprod: number,
  extras: { nomeTerceiro?: string; cpfTerceiro?: string; comentario?: string },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'update sini_prod set nm_terce = ?, cpf_terce = ?, complemento = ? where id_sinistro = ? and id_perprod = ?',
    [extras.nomeTerceiro ?? '', extras.cpfTerceiro ?? '', extras.comentario ?? '', idSinistro, idPerprod],
  );
}

/** Porta do branch de limpeza em VerQuestoes: some a resposta de uma pergunta (usado quando a subpergunta deixa de se aplicar). */
export async function limparResposta(idSinistro: number, idPerprod: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sini_prod where id_sinistro = ? and id_perprod = ?', [idSinistro, idPerprod]);
}
