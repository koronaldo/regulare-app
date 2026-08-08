import { getDb } from './client';

/**
 * Porta da montagem de `sini_cad` (definicoes.js): lista os sinistros já salvos localmente,
 * pra mandar no login (ou na checagem periódica) e o servidor saber quais o app já tem.
 */
export async function listaSinistrosLocais(): Promise<string> {
  try {
    const db = await getDb();
    const linhas = await db.getAllAsync<{ id_sinistro: number }>(
      'select id_sinistro from sinimob where id_sinistro is not null',
    );
    if (linhas.length === 0) return '0';
    return '0,' + linhas.map((l) => l.id_sinistro).join(',');
  } catch {
    return '0';
  }
}

/** Ids de sinistro já salvos localmente, pra descobrir quais vieram novos num login. */
export async function idsSinistrosLocais(): Promise<Set<number>> {
  try {
    const db = await getDb();
    const linhas = await db.getAllAsync<{ id_sinistro: number }>(
      'select id_sinistro from sinimob where id_sinistro is not null',
    );
    return new Set(linhas.map((l) => l.id_sinistro));
  } catch {
    return new Set();
  }
}

export type SituacaoSinistro = 'P' | 'A' | 'T';

export interface SinistroResumo {
  id_sinistro: number;
  nm_segurado: string | null;
  apelido: string | null;
  nm_cidade: string | null;
  id_estado: string | null;
  nro_sinistro: string | null;
  nroreg_sinistro: string | null;
  data_ocor: string | null;
  data_vistoria: string | null;
  contatoseg: string | null;
  fone: string | null;
  celular: string | null;
  endereco: string | null;
  nro_predio: string | null;
  nro_unidade: string | null;
  bairro: string | null;
  apolice: string | null;
  nm_produto: string | null;
  nm_causa: string | null;
  novo_sini: string | null;
  totfoto: number;
  totdoc: number;
}

/**
 * Porta de CarregaDetalheProcesso (atividade_def.js do app legado):
 * P = pendente (sem vistoria), A = atendido (com vistoria), T = todos.
 * "novo_sini IS NULL" marca processos ainda não abertos pelo usuário.
 */
export async function listarSinistros(
  codreg: number,
  situacao: SituacaoSinistro,
  busca?: string,
): Promise<SinistroResumo[]> {
  const db = await getDb();

  const condicoes = ['mb.id_regulador = ?'];
  const params: (string | number)[] = [codreg];

  if (situacao === 'A') condicoes.push('mb.data_vistoria is not null');
  if (situacao === 'P') condicoes.push('mb.data_vistoria is null');

  if (busca?.trim()) {
    condicoes.push('mb.nm_segurado like ?');
    params.push(`%${busca.trim()}%`);
  }

  const sql = `
    select mb.*,
      se.apelido as apelido,
      (select count(*) from sinifotoapp sf where mb.id_sinistro = sf.id_sinistro) as totfoto,
      (select count(*) from sinidocpag sd where mb.id_sinistro = sd.id_sinistro) as totdoc
    from sinimob mb
    left join seguradora se on (mb.id_seguradora = se.id_seguradora)
    where ${condicoes.join(' and ')}
    order by mb.nroreg_sinistro desc
  `;

  return db.getAllAsync<SinistroResumo>(sql, params);
}

export async function contarSinistros(codreg: number, situacao: SituacaoSinistro): Promise<number> {
  const db = await getDb();
  const condicoes = ['id_regulador = ?'];
  const params: (string | number)[] = [codreg];

  if (situacao === 'A') condicoes.push('data_vistoria is not null');
  if (situacao === 'P') condicoes.push('data_vistoria is null');

  const row = await db.getFirstAsync<{ total: number }>(
    `select count(*) as total from sinimob where ${condicoes.join(' and ')}`,
    params,
  );
  return row?.total ?? 0;
}

export interface SinistroDetalhe extends SinistroResumo {
  id_seguradora: number | null;
  id_produto: number | null;
  nm_seguradora: string | null;
  id_corretora: number | null;
  tipo_doc: string | null;
  cpf: string | null;
  cep: string | null;
  id_cidade: number | null;
  emailseg: string | null;
  proposta_seg: string | null;
  id_tipoapolice: number | null;
  local_determinado: number | null;
  territorio_nacional: number | null;
  tratar_ate: string | null;
  atendente: string | null;
  rg_atendente: string | null;
  id_relacaoseg: number | null;
  mesma_pessoa: string | null;
  tratar_ass: string | null;
  atendente_ass: string | null;
  rg_assina: string | null;
  id_relacaoseg_ass: number | null;
  id_causa_abe: number | null;
  id_causa: number | null;
  hora_incerta: number | null;
  hora_ocor: string | null;
  datavig_ini: string | null;
  datavig_fim: string | null;
  data_aviso: string | null;
  id_preserva: string | null;
}

export async function buscarSinistroPorId(idSinistro: number): Promise<SinistroDetalhe | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SinistroDetalhe>(
    `select mb.*, se.apelido as apelido, se.nm_seguradora as nm_seguradora,
       (select count(*) from sinifotoapp sf where mb.id_sinistro = sf.id_sinistro) as totfoto,
       (select count(*) from sinidocpag sd where mb.id_sinistro = sd.id_sinistro) as totdoc
     from sinimob mb
     left join seguradora se on (mb.id_seguradora = se.id_seguradora)
     where mb.id_sinistro = ?`,
    [idSinistro],
  );
  return row ?? null;
}

export interface PermissaoBotao {
  nm_botao: string;
  sit_botao: string;
}

/** Porta de CarregandoPermissoesBotoes (controle_def.js). */
export async function buscarPermissoesBotoes(idSinistro: number): Promise<Record<string, boolean>> {
  const db = await getDb();
  const linhas = await db.getAllAsync<PermissaoBotao>(
    'select nm_botao, sit_botao from btn_permissoes where id_sinistro = ?',
    [idSinistro],
  );
  const mapa: Record<string, boolean> = {};
  for (const linha of linhas) {
    mapa[linha.nm_botao] = linha.sit_botao === 'S';
  }
  return mapa;
}

/** Porta de HabilitaQuestionario (controle_def.js): existe questionário pra essa seguradora+produto? */
export async function temQuestionario(idSeguradora: number | null, idProduto: number | null): Promise<boolean> {
  if (!idSeguradora || !idProduto) return false;
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    'select count(*) as total from segproduto_prod_questao where id_seguradora = ? and id_produto = ?',
    [idSeguradora, idProduto],
  );
  return (row?.total ?? 0) > 0;
}

/** Marca o processo como aberto/visto (porta do padrão `update sinimob set novo_sini='N'`). */
export async function marcarSinistroVisto(idSinistro: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
}

export interface OpcaoLista {
  valor: number | string;
  label: string;
}

export async function listarEstados(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_estado: string }>('select id_estado from estado order by id_estado');
  return linhas.map((l) => ({ valor: l.id_estado, label: l.id_estado }));
}

export async function listarCidadesPorEstado(idEstado: string): Promise<OpcaoLista[]> {
  if (!idEstado) return [];
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_cidade: number; nm_cidade: string }>(
    'select id_cidade, nm_cidade from cidade where id_estado = ? order by nm_cidade',
    [idEstado],
  );
  return linhas.map((l) => ({ valor: l.id_cidade, label: l.nm_cidade }));
}

export async function listarCausas(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_causa: number; nm_causa: string }>(
    'select id_causa, nm_causa from causamob order by nm_causa',
  );
  return linhas.map((l) => ({ valor: l.id_causa, label: l.nm_causa }));
}

export async function listarRelacoesSeg(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_relacaoseg: number; nm_relacaoseg: string }>(
    'select id_relacaoseg, nm_relacaoseg from relacaoseg order by nm_relacaoseg',
  );
  return linhas.map((l) => ({ valor: l.id_relacaoseg, label: l.nm_relacaoseg }));
}

export async function listarTiposApolice(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_tipoapolice: number; nm_tipoapolice: string }>(
    'select id_tipoapolice, nm_tipoapolice from tipoapolice order by nm_tipoapolice',
  );
  return linhas.map((l) => ({ valor: l.id_tipoapolice, label: l.nm_tipoapolice }));
}

export interface CorretoraInfo {
  nm_corretora: string | null;
  endereco: string | null;
  bairro: string | null;
  nm_cidade: string | null;
  id_estado: string | null;
  telefone: string | null;
  email: string | null;
}

export async function buscarCorretora(idCorretora: number | null): Promise<CorretoraInfo | null> {
  if (!idCorretora) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<CorretoraInfo>(
    'select nm_corretora, endereco, bairro, id_estado, telefone, email from corretora where id_corretora = ?',
    [idCorretora],
  );
  return row ?? null;
}

export interface DadosCadastro {
  nm_segurado: string;
  tipo_doc: string | null;
  cpf: string | null;
  endereco: string;
  nro_predio: string | null;
  nro_unidade: string | null;
  bairro: string | null;
  cep: string | null;
  id_estado: string;
  id_cidade: number;
  fone: string;
  celular: string | null;
  emailseg: string | null;
  contatoseg: string | null;
  proposta_seg: string | null;
  nro_sinistro: string | null;
  apolice: string | null;
  id_tipoapolice: number | null;
  local_determinado: boolean;
  territorio_nacional: boolean;
  tratar_ate: string;
  atendente: string;
  rg_atendente: string;
  id_relacaoseg: number;
  mesma_pessoa: string;
  tratar_ass: string;
  atendente_ass: string;
  rg_assina: string;
  id_relacaoseg_ass: number;
  id_causa_abe: number;
  id_causa: number;
  data_ocor: string;
  hora_incerta: boolean;
  hora_ocor: string | null;
  datavig_ini: string | null;
  datavig_fim: string | null;
  data_vistoria: string;
  data_aviso: string;
  id_preserva: string;
}

const BOTOES_LIBERADOS_APOS_CADASTRO = ['fotos', 'docs', 'despesas', 'videos', 'apolice', 'questionario', 'informacoes'];

/**
 * Porta de AtualizaSinimob + PermissaoBotaoZ (cadprocesso_def_screen.js):
 * grava o cadastro geral do processo e libera os botões que dependem dele.
 */
export async function salvarCadastroSinistro(idSinistro: number, dados: DadosCadastro): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `update sinimob set
        nm_segurado = ?, endereco = ?, bairro = ?, cep = ?, id_estado = ?, id_cidade = ?,
        id_tipoapolice = ?, novo_sini = 'N', sini_atu = 'S', fone = ?, celular = ?,
        contatoseg = ?, proposta_seg = ?, emailseg = ?, tipo_doc = ?, cpf = ?,
        nro_predio = ?, nro_unidade = ?, id_causa = ?, id_causa_que = ?, id_causa_abe = ?,
        data_ocor = ?, data_vistoria = ?, datavig_ini = ?, datavig_fim = ?, data_aviso = ?,
        hora_ocor = ?, hora_incerta = ?, local_determinado = ?, territorio_nacional = ?,
        id_preserva = ?, atendente = ?, id_relacaoseg = ?, tratar_ate = ?, tratar_ass = ?,
        nro_sinistro = ?, apolice = ?, id_relacaoseg_ass = ?, atendente_ass = ?,
        mesma_pessoa = ?, rg_assina = ?, rg_atendente = ?
      where id_sinistro = ?`,
      [
        dados.nm_segurado, dados.endereco, dados.bairro, dados.cep, dados.id_estado, dados.id_cidade,
        dados.id_tipoapolice, dados.fone, dados.celular,
        dados.contatoseg, dados.proposta_seg, dados.emailseg, dados.tipo_doc, dados.cpf,
        dados.nro_predio, dados.nro_unidade, dados.id_causa, dados.id_causa, dados.id_causa_abe,
        dados.data_ocor, dados.data_vistoria, dados.datavig_ini, dados.datavig_fim, dados.data_aviso,
        dados.hora_ocor, dados.hora_incerta ? 1 : 0, dados.local_determinado ? 1 : 0, dados.territorio_nacional ? 1 : 0,
        dados.id_preserva, dados.atendente, dados.id_relacaoseg, dados.tratar_ate, dados.tratar_ass,
        dados.nro_sinistro, dados.apolice, dados.id_relacaoseg_ass, dados.atendente_ass,
        dados.mesma_pessoa, dados.rg_assina, dados.rg_atendente,
        idSinistro,
      ],
    );

    const placeholders = BOTOES_LIBERADOS_APOS_CADASTRO.map(() => '?').join(',');
    await db.runAsync(
      `update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao in (${placeholders})`,
      [idSinistro, ...BOTOES_LIBERADOS_APOS_CADASTRO],
    );
  });
}
