import { getDb } from './client';
import { registrarLog } from './logs';
import type { OpcaoLista } from './sinistros';

export type TipoApolice = 'PRE' | 'MAQ' | string;

export interface ContextoApolice {
  tipo_apolice: TipoApolice | null;
  /** Só faz sentido em apólice MAQ: o risco é o território nacional inteiro (máquina itinerante). */
  territorio_nacional: boolean;
  /** Só faz sentido em apólice MAQ: o risco é um endereço fixo, igual ao Predial. */
  local_determinado: boolean;
}

/**
 * Tipo da apólice + os dois flags de abrangência do risco (Cadastro Geral), que juntos decidem
 * qual questionário de Informações Gerais é montado — ver CHECKLIST_ENDERECO/CHECKLIST_MAQUINA
 * em app/sinistro/[id]/informacoes.tsx.
 */
export async function buscarContextoApolice(idSinistro: number): Promise<ContextoApolice> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    tipo_apolice: string | null;
    territorio_nacional: number | null;
    local_determinado: number | null;
  }>(
    `select ta.tipo_apolice, sm.territorio_nacional, sm.local_determinado
     from sinimob sm
     left join tipoapolice ta on sm.id_tipoapolice = ta.id_tipoapolice
     where sm.id_sinistro = ?`,
    [idSinistro],
  );
  return {
    tipo_apolice: row?.tipo_apolice ?? null,
    territorio_nacional: !!row?.territorio_nacional,
    local_determinado: !!row?.local_determinado,
  };
}

export interface DadosEnderecoSinistro {
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  nro_predio: string | null;
  nro_unidade: string | null;
  id_estado: string | null;
  id_cidade: number | null;
  ocupacao: string | null;
  construcao: string | null;
  /** Apólice de item único: pré-preenche o item "Item da apólice" com o texto fixo. */
  item_unico: number | null;
}

/** Dados já preenchidos no Cadastro Geral, usados como valor padrão do checklist de Informações. */
export async function buscarDadosEnderecoSinistro(idSinistro: number): Promise<DadosEnderecoSinistro | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<DadosEnderecoSinistro>(
    `select endereco, bairro, cep, nro_predio, nro_unidade, id_estado, id_cidade, ocupacao, construcao, item_unico
     from sinimob where id_sinistro = ?`,
    [idSinistro],
  );
  return row ?? null;
}

/** Quanto de "Informações Gerais" já foi preenchido — usado pra avisar antes de trocar o tipo da apólice. */
export interface ResumoInformacoesGerais {
  /** Respostas do questionário de endereço (sinistro_apolice). */
  itensApolice: number;
  /** Máquinas cadastradas (sinibenfe tipo_bene='MAQ'). */
  maquinas: number;
  /** Respostas do checklist das máquinas (sinistro_maquina). */
  respostasMaquina: number;
}

export async function contarInformacoesGerais(idSinistro: number): Promise<ResumoInformacoesGerais> {
  const db = await getDb();
  const row = await db.getFirstAsync<ResumoInformacoesGerais>(
    `select
       (select count(*) from sinistro_apolice where id_sinistro = ?) as itensApolice,
       (select count(*) from sinibenfe where id_sinistro = ? and tipo_bene = 'MAQ') as maquinas,
       (select count(*) from sinistro_maquina where id_sinistro = ?) as respostasMaquina`,
    [idSinistro, idSinistro, idSinistro],
  );
  return row ?? { itensApolice: 0, maquinas: 0, respostasMaquina: 0 };
}

/**
 * Apaga o que ficou preso ao tipo antigo da apólice ao trocar Prédio <-> Máquina: os dois
 * questionários e as máquinas. As benfeitorias (sinibenfe tipo_bene='PRE') NÃO entram — elas
 * aparecem nos dois tipos e não têm relação com a troca. Também devolve o botão "informacoes"
 * pra pendente, já que o checklist volta a estar sem resposta.
 */
export async function limparInformacoesGerais(idSinistro: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sinistro_apolice where id_sinistro = ?', [idSinistro]);
    await db.runAsync('delete from sinistro_maquina where id_sinistro = ?', [idSinistro]);
    await db.runAsync("delete from sinibenfe where id_sinistro = ? and tipo_bene = 'MAQ'", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'N' where id_sinistro = ? and nm_botao = 'informacoes'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, 'Informações Gerais removidas por troca de tipo de apólice');
}

/**
 * Máquina em local determinado responde só a localização do risco: Cidade/UF, Bairro,
 * Logradouro, Nº prédio, Nº unidade e CEP (apolice_item.id_item 3 a 8). Os itens de prédio
 * (Ocupação, Construção, Item da apólice, Propriedade, Proprietário, Tempo de instalação) não
 * se aplicam e ficam fora do questionário.
 */
export const ITENS_APOLICE_MAQUINA_LOCAL = [3, 4, 5, 6, 7, 8];

/** Filtra o questionário de endereço conforme o tipo da apólice (Predial responde todos). */
export function itensApoliceDoContexto(contexto: ContextoApolice, itens: ItemApolice[]): ItemApolice[] {
  if (contexto.tipo_apolice !== 'MAQ') return itens;
  return itens.filter((i) => ITENS_APOLICE_MAQUINA_LOCAL.includes(i.id_item));
}

export interface ItemApolice {
  id_item: number;
  descricao_item: string;
  /** Posição do item no questionário (o "N" de descricaoN no legado). Null em bases antigas. */
  ordem_item: number | null;
  referencia: string | null;
  lista_selecao: string | null;
  conferencia: boolean;
  descricao: string;
  confere: boolean | null;
  complemento: string;
  id_estado: string | null;
  id_cidade: number | null;
  id_estado_ori: string | null;
  id_cidade_ori: number | null;
}

interface LinhaItemApolice {
  id_item: number;
  descricao_apolice_item: string;
  ordem_item: number | null;
  referencia: string | null;
  lista_selecao: string | null;
  conferencia: number | null;
  descricao: string | null;
  confere: number | null;
  complemento: string | null;
  id_estado: string | null;
  id_cidade: number | null;
  id_estado_ori: string | null;
  id_cidade_ori: number | null;
}

/** Porta de CarregaInformacoesNovas + MontaEstruturaApolice (cadinformacoes_def.js), caso Predial (PRE). */
export async function buscarItensApolice(idSinistro: number): Promise<ItemApolice[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<LinhaItemApolice>(
    `select ai.id_item, ai.descricao as descricao_apolice_item, ai.ordem_item, ai.referencia, ai.lista_selecao, ai.conferencia,
       sa.descricao, sa.confere, sa.complemento, sa.id_estado, sa.id_cidade, sa.id_estado_ori, sa.id_cidade_ori
     from apolice_item ai
     left join sinistro_apolice sa on ai.id_item = sa.id_item and sa.id_sinistro = ?
     order by cast(ai.ordem_item as integer)`,
    [idSinistro],
  );

  return linhas.map((l) => ({
    id_item: l.id_item,
    descricao_item: l.descricao_apolice_item,
    // ordem_item é integer no servidor, mas em bases antigas veio como texto pela migração — o
    // Number() garante que o mapa posicional de pré-preenchimento case por número, não por string.
    ordem_item: l.ordem_item == null ? null : Number(l.ordem_item),
    referencia: l.referencia,
    lista_selecao: l.lista_selecao,
    conferencia: !!l.conferencia,
    descricao: l.descricao ?? '',
    confere: l.confere == null ? null : !!l.confere,
    complemento: l.complemento ?? '',
    id_estado: l.id_estado,
    id_cidade: l.id_cidade,
    id_estado_ori: l.id_estado_ori,
    id_cidade_ori: l.id_cidade_ori,
  }));
}

export interface RespostaItemApolice {
  id_item: number;
  descricao: string;
  confere: boolean | null;
  complemento: string;
  id_estado: string | null;
  id_cidade: number | null;
  id_estado_ori: string | null;
  id_cidade_ori: number | null;
}

/** Porta de GravarItemApolices (cadinformacoes_def.js): substitui as respostas e libera o botão "informacoes". */
export async function salvarItensApolice(idSinistro: number, respostas: RespostaItemApolice[]): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sinistro_apolice where id_sinistro = ?', [idSinistro]);

    for (const r of respostas) {
      await db.runAsync(
        `insert into sinistro_apolice
           (id_sinistro, id_item, descricao, confere, complemento, id_estado, id_cidade, id_estado_ori, id_cidade_ori)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idSinistro,
          r.id_item,
          r.descricao,
          r.confere == null ? null : r.confere ? 1 : 0,
          r.complemento,
          r.id_estado,
          r.id_cidade,
          r.id_estado_ori,
          r.id_cidade_ori,
        ],
      );
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'informacoes'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, 'Informações Gerais alterado');
}

export interface Benfeitoria {
  id_sinibenfe: number;
  construcao: string;
  id_ocupacao: number | null;
  area: string;
  idade: string;
  danos: boolean;
  nm_benfeito: string;
  id_estrutura: number | null;
  id_parede: number | null;
  id_tipocobertura: number | null;
  id_esquadria: number | null;
  coord_lat: string;
  coord_long: string;
  id_cobertura: number | null;
}

/** Porta de CarregaBenfeitoria (cadinformacoes_def.js): só as benfeitorias tipo Predial (PRE). */
export async function listarBenfeitorias(idSinistro: number): Promise<Benfeitoria[]> {
  const db = await getDb();
  // area/idade são numeric(12,2): se o valor salvo "parece" número puro, o SQLite devolve number,
  // não string — por isso os String(...) abaixo em vez de um `?? ''` direto.
  const linhas = await db.getAllAsync<{
    id_sinibenfe: number;
    construcao: string | null;
    id_ocupacao: number | null;
    area: string | number | null;
    idade: string | number | null;
    danos: number | null;
    nm_benfeito: string | null;
    id_estrutura: number | null;
    id_parede: number | null;
    id_tipocobertura: number | null;
    id_esquadria: number | null;
    coord_lat: string | null;
    coord_long: string | null;
    id_cobertura: number | null;
  }>(
    `select id_sinibenfe, construcao, id_ocupacao, area, idade, danos, nm_benfeito,
       id_estrutura, id_parede, id_tipocobertura, id_esquadria, coord_lat, coord_long, id_cobertura
     from sinibenfe
     where tipo_bene = 'PRE' and id_sinistro = ?
     order by nm_benfeito`,
    [idSinistro],
  );

  return linhas.map((l) => ({
    id_sinibenfe: l.id_sinibenfe,
    construcao: l.construcao ?? '',
    id_ocupacao: l.id_ocupacao,
    area: l.area != null ? String(l.area) : '',
    idade: l.idade != null ? String(l.idade) : '',
    danos: !!l.danos,
    nm_benfeito: l.nm_benfeito ?? '',
    id_estrutura: l.id_estrutura,
    id_parede: l.id_parede,
    id_tipocobertura: l.id_tipocobertura,
    id_esquadria: l.id_esquadria,
    coord_lat: l.coord_lat ?? '',
    coord_long: l.coord_long ?? '',
    id_cobertura: l.id_cobertura,
  }));
}

export interface DadosBenfeitoria {
  construcao: string;
  id_ocupacao: number;
  area: string;
  idade: string;
  danos: boolean;
  nm_benfeito: string;
  id_estrutura: number;
  id_parede: number;
  id_tipocobertura: number;
  id_esquadria: number;
  coord_lat: string;
  coord_long: string;
  id_cobertura: number | null;
}

/** Porta de AtualizaBenfeitoria (cadinformacoes_def.js): insere se id_sinibenfe vazio/0, senão atualiza. */
export async function salvarBenfeitoria(
  idSinistro: number,
  idSinibenfe: number | null,
  dados: DadosBenfeitoria,
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    if (!idSinibenfe) {
      await db.runAsync(
        `insert into sinibenfe
           (id_benfeweb, id_sinistro, construcao, id_benfeito, id_ocupacao, area, idade, danos,
            nm_benfeito, id_estrutura, id_parede, id_tipocobertura, id_esquadria, tipo_bene,
            coord_lat, coord_long, id_cobertura)
         values (0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRE', ?, ?, ?)`,
        [
          idSinistro,
          dados.construcao,
          dados.id_ocupacao,
          dados.area,
          dados.idade,
          dados.danos ? 1 : 0,
          dados.nm_benfeito,
          dados.id_estrutura,
          dados.id_parede,
          dados.id_tipocobertura,
          dados.id_esquadria,
          dados.coord_lat,
          dados.coord_long,
          dados.id_cobertura,
        ],
      );
    } else {
      await db.runAsync(
        `update sinibenfe set
           construcao = ?, id_ocupacao = ?, area = ?, idade = ?, danos = ?, nm_benfeito = ?,
           id_estrutura = ?, id_parede = ?, id_tipocobertura = ?, id_esquadria = ?,
           coord_lat = ?, coord_long = ?, id_cobertura = ?
         where id_sinistro = ? and id_sinibenfe = ?`,
        [
          dados.construcao,
          dados.id_ocupacao,
          dados.area,
          dados.idade,
          dados.danos ? 1 : 0,
          dados.nm_benfeito,
          dados.id_estrutura,
          dados.id_parede,
          dados.id_tipocobertura,
          dados.id_esquadria,
          dados.coord_lat,
          dados.coord_long,
          dados.id_cobertura,
          idSinistro,
          idSinibenfe,
        ],
      );
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
  });

  await registrarLog(idSinistro, idSinibenfe ? 'Benfeitoria alterada' : 'Benfeitoria inserida');
}

/** Porta de RemovendoRegistro (cadinformacoes_def.js). */
export async function excluirBenfeitoria(idSinistro: number, idSinibenfe: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinibenfe where id_sinistro = ? and id_sinibenfe = ?', [idSinistro, idSinibenfe]);
}

export interface BenfeitoriaTransferencia {
  id_sinibenfe: number;
  id_benfeweb: number | null;
  construcao: string | null;
  id_ocupacao: number | null;
  area: string | number | null;
  idade: string | number | null;
  danos: number | null;
  nm_benfeito: string | null;
  id_estrutura: number | null;
  id_parede: number | null;
  id_tipocobertura: number | null;
  id_esquadria: number | null;
  tipo_bene: string | null;
  marca: string | null;
  modelo: string | null;
  nro_serie: string | null;
  chassi: string | null;
  ano: string | null;
  placa: string | null;
  total_km: string | number | null;
  item_apolice: string | null;
  cor: string | null;
  coord_lat: string | null;
  coord_long: string | null;
  id_cobertura: number | null;
}

/**
 * Porta de ConferindoDuplicidadeBenfeitoria (transfere_sinistro_def_screen.js), estendida pra
 * cobrir também tipo_bene='MAQ': o legado só mandava as benfeitorias (PRE) por esse caminho,
 * mas aqui as máquinas usam a mesma insere_benfeitoria_web(...) pro cadastro base — o checklist
 * delas (sinistro_maquina) é sincronizado à parte, depois que a máquina já tem id_benfeweb.
 */
export async function listarBenfeitoriasParaTransferencia(idSinistro: number): Promise<BenfeitoriaTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<BenfeitoriaTransferencia>(
    `select id_sinibenfe, id_benfeweb, construcao, id_ocupacao, area, idade, danos, nm_benfeito,
       id_estrutura, id_parede, id_tipocobertura, id_esquadria, tipo_bene, marca, modelo, nro_serie,
       chassi, ano, placa, total_km, item_apolice, cor, coord_lat, coord_long, id_cobertura
     from sinibenfe where id_sinistro = ?`,
    [idSinistro],
  );
}

/**
 * Porta de AtualizaChavesBenfeitoria (transfere_sinistro_def_screen.js): grava o id_benfeweb
 * (chave real, gerada pelo servidor) devolvido depois do envio, casando pelo id_sinibenfe local.
 */
export async function marcarBenfeitoriasTransferidas(
  idSinistro: number,
  chaves: { id_sinibenfe: number; id_benfeweb: number }[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const chave of chaves) {
      await db.runAsync('update sinibenfe set id_benfeweb = ? where id_sinistro = ? and id_sinibenfe = ?', [
        chave.id_benfeweb,
        idSinistro,
        chave.id_sinibenfe,
      ]);
    }
  });
}

export interface ChecklistMaquinaTransferencia {
  /** id_benmaq já resolvido pro servidor (sinibenfe.id_benfeweb da máquina dona do checklist) — nunca o id_sinibenfe local. */
  id_benmaq_servidor: number;
  id_itemmaq: number;
  descricao: string | null;
  confere: number | null;
  complemento: string | null;
}

/**
 * Porta de LendoDadosInformacoesMaquinas/CarregaDadosInformacoesMaquinas
 * (transfere_sinistro_def_screen.js): lê o checklist de cada máquina (sinistro_maquina), já
 * resolvendo o id_benmaq local (que localmente é o id_sinibenfe) pro id_benfeweb real do
 * servidor via o join com sinibenfe — só entram máquinas que já têm id_benfeweb (ou seja, que
 * já foram sincronizadas por transferirBenfeitorias nesta mesma rodada).
 */
export async function listarChecklistMaquinasParaTransferencia(
  idSinistro: number,
): Promise<ChecklistMaquinaTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<ChecklistMaquinaTransferencia>(
    `select sb.id_benfeweb as id_benmaq_servidor, sm.id_itemmaq, sm.descricao, sm.confere, sm.complemento
     from sinistro_maquina sm
     inner join sinibenfe sb on sb.id_sinibenfe = sm.id_benmaq and sb.id_sinistro = sm.id_sinistro
     where sm.id_sinistro = ? and sb.id_benfeweb is not null and sb.id_benfeweb > 0`,
    [idSinistro],
  );
}

export async function listarOpcoesOcupacao(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_ocupacao: number; nm_ocupacao: string }>(
    'select id_ocupacao, nm_ocupacao from ocupacao where ativo = 1 order by nm_ocupacao',
  );
  return linhas.map((l) => ({ valor: l.id_ocupacao, label: l.nm_ocupacao }));
}

export async function listarOpcoesEstrutura(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_estrutura: number; nm_estrutura: string }>(
    'select id_estrutura, nm_estrutura from estrutura order by nm_estrutura',
  );
  return linhas.map((l) => ({ valor: l.id_estrutura, label: l.nm_estrutura }));
}

export async function listarOpcoesParede(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_parede: number; nm_parede: string }>(
    'select id_parede, nm_parede from parede order by nm_parede',
  );
  return linhas.map((l) => ({ valor: l.id_parede, label: l.nm_parede }));
}

export async function listarOpcoesTipoCobertura(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_tipocobertura: number; nm_tipocobertura: string }>(
    'select id_tipocobertura, nm_tipocobertura from tipocobertura order by nm_tipocobertura',
  );
  return linhas.map((l) => ({ valor: l.id_tipocobertura, label: l.nm_tipocobertura }));
}

export async function listarOpcoesEsquadria(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_esquadria: number; nm_esquadria: string }>(
    'select id_esquadria, nm_esquadria from esquadria order by nm_esquadria',
  );
  return linhas.map((l) => ({ valor: l.id_esquadria, label: l.nm_esquadria }));
}

/** Porta de BuscaCobertura (cadinformacoes_def.js): só as coberturas contratadas nesse sinistro. */
export async function listarCoberturasSinistro(idSinistro: number): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_cobertura: number; nm_cobertura: string }>(
    `select sc.id_cobertura, cb.nm_cobertura
     from sinimobcob sc
     inner join cobertura cb on sc.id_cobertura = cb.id_cobertura
     where sc.id_sinistro = ?`,
    [idSinistro],
  );
  return linhas.map((l) => ({ valor: l.id_cobertura, label: l.nm_cobertura }));
}

// ---- Máquinas (apólices tipo MAQ) ----
// Porta simplificada de CarregaInformacoesNovas + MontaEstruturaMaquina1 + GravarItemMaquinas
// (cadinformacoes_def.js): cada máquina é um "sinibenfe" tipo_bene='MAQ', e o checklist de campos
// dela usa a mesma estrutura de referência de item (maquina_item) e resposta (sinistro_maquina)
// que o checklist de Informações usa pra apolice_item/sinistro_apolice.

export interface MaquinaItem {
  id_item: number;
  descricao_item: string;
  referencia: string | null;
  lista_selecao: string | null;
  conferencia: boolean;
}

export async function listarMaquinaItens(): Promise<MaquinaItem[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_item: number;
    descricao: string;
    referencia: string | null;
    lista_selecao: string | null;
    conferencia: number | null;
  }>('select id_item, descricao, referencia, lista_selecao, conferencia from maquina_item order by id_item');
  return linhas.map((l) => ({
    id_item: l.id_item,
    descricao_item: l.descricao,
    referencia: l.referencia,
    lista_selecao: l.lista_selecao,
    conferencia: !!l.conferencia,
  }));
}

export interface MaquinaResumo {
  id_benmaq: number;
  nm_benfeito: string;
  /** Veio pronta do servidor (precisa conferir) ou foi criada localmente (só cadastrar). */
  importada: boolean;
}

export async function listarMaquinas(idSinistro: number): Promise<MaquinaResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_sinibenfe: number; nm_benfeito: string | null; id_benfeweb: number | null }>(
    "select id_sinibenfe, nm_benfeito, id_benfeweb from sinibenfe where tipo_bene = 'MAQ' and id_sinistro = ? order by id_sinibenfe",
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_benmaq: l.id_sinibenfe,
    nm_benfeito: l.nm_benfeito || '(sem nome)',
    importada: !!l.id_benfeweb,
  }));
}

export interface DadosBasicosMaquina {
  item_apolice: string;
  nm_benfeito: string;
  marca: string;
  modelo: string;
  ano: string;
  nro_serie: string;
  chassi: string;
  placa: string;
  total_km: string;
  obs_benfe: string;
  construcao: string;
}

export async function buscarDadosBasicosMaquina(idBenmaq: number): Promise<DadosBasicosMaquina | null> {
  const db = await getDb();
  // total_km é numeric(12,2): se o valor salvo "parece" número puro, o SQLite devolve number, não string.
  const row = await db.getFirstAsync<Record<Exclude<keyof DadosBasicosMaquina, 'total_km'>, string | null> & { total_km: string | number | null }>(
    `select item_apolice, nm_benfeito, marca, modelo, ano, nro_serie, chassi, placa, total_km, obs_benfe, construcao
     from sinibenfe where id_sinibenfe = ?`,
    [idBenmaq],
  );
  if (!row) return null;
  return {
    item_apolice: row.item_apolice ?? '',
    nm_benfeito: row.nm_benfeito ?? '',
    marca: row.marca ?? '',
    modelo: row.modelo ?? '',
    ano: row.ano ?? '',
    nro_serie: row.nro_serie ?? '',
    chassi: row.chassi ?? '',
    placa: row.placa ?? '',
    total_km: row.total_km != null ? String(row.total_km) : '',
    obs_benfe: row.obs_benfe ?? '',
    construcao: row.construcao ?? '',
  };
}

export interface RespostaCampoMaquina {
  descricao: string;
  confere: boolean | null;
  complemento: string;
}

export async function buscarRespostasMaquina(
  idSinistro: number,
  idBenmaq: number,
): Promise<Record<number, RespostaCampoMaquina>> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_itemmaq: number;
    descricao: string | null;
    confere: number | null;
    complemento: string | null;
  }>('select id_itemmaq, descricao, confere, complemento from sinistro_maquina where id_sinistro = ? and id_benmaq = ?', [
    idSinistro,
    idBenmaq,
  ]);
  const mapa: Record<number, RespostaCampoMaquina> = {};
  for (const l of linhas) {
    mapa[l.id_itemmaq] = {
      descricao: l.descricao ?? '',
      confere: l.confere == null ? null : !!l.confere,
      complemento: l.complemento ?? '',
    };
  }
  return mapa;
}

/** Cria uma máquina nova (ainda sem dados), retorna o id_benmaq (= id_sinibenfe) gerado. */
export async function criarMaquina(idSinistro: number): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "insert into sinibenfe (id_benfeweb, id_sinistro, id_benfeito, tipo_bene, nm_benfeito) values (0, ?, 0, 'MAQ', '')",
    [idSinistro],
  );
  await registrarLog(idSinistro, 'Máquina inserida');
  return result.lastInsertRowId;
}

export async function excluirMaquina(idSinistro: number, idBenmaq: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sinibenfe where id_sinistro = ? and id_sinibenfe = ?', [idSinistro, idBenmaq]);
    await db.runAsync('delete from sinistro_maquina where id_sinistro = ? and id_benmaq = ?', [idSinistro, idBenmaq]);
  });
}

export interface RespostaMaquina {
  id_item: number;
  descricao: string;
  confere: boolean | null;
  complemento: string;
}

/** Porta simplificada de GravarItemMaquinas (cadinformacoes_def.js). */
export async function salvarMaquina(
  idSinistro: number,
  idBenmaq: number,
  dadosBasicos: DadosBasicosMaquina,
  respostas: RespostaMaquina[],
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `update sinibenfe set nm_benfeito = ?, marca = ?, modelo = ?, ano = ?, nro_serie = ?, chassi = ?,
         placa = ?, total_km = ?, obs_benfe = ?, construcao = ?, item_apolice = ?
       where id_sinibenfe = ?`,
      [
        dadosBasicos.nm_benfeito,
        dadosBasicos.marca,
        dadosBasicos.modelo,
        dadosBasicos.ano,
        dadosBasicos.nro_serie,
        dadosBasicos.chassi,
        dadosBasicos.placa,
        dadosBasicos.total_km,
        dadosBasicos.obs_benfe,
        dadosBasicos.construcao,
        dadosBasicos.item_apolice,
        idBenmaq,
      ],
    );

    await db.runAsync('delete from sinistro_maquina where id_sinistro = ? and id_benmaq = ?', [idSinistro, idBenmaq]);
    for (const r of respostas) {
      await db.runAsync(
        'insert into sinistro_maquina (id_sinistro, id_benmaq, id_itemmaq, descricao, confere, complemento) values (?, ?, ?, ?, ?, ?)',
        [idSinistro, idBenmaq, r.id_item, r.descricao, r.confere == null ? null : r.confere ? 1 : 0, r.complemento],
      );
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'informacoes'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, 'Máquina alterada');
}

// ---- Transferência de "Informações Gerais" (sinirisco + sinistro_apolice) ----
// Porta de LendoDadosInformacoes/CarregaDadosInformacoes e
// LendoDadosInformacoesNovas/CarregaDadosInformacoesNovas (transfere_sinistro_def_screen.js).

export interface RiscoTransferencia {
  id_risco: number;
  estado: number | null;
  complem: string | null;
  id_seguradora: number | null;
}

export async function listarRiscosParaTransferencia(idSinistro: number): Promise<RiscoTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<RiscoTransferencia>(
    'select id_risco, estado, complem, id_seguradora from sinirisco where id_sinistro = ?',
    [idSinistro],
  );
}

export interface ItemApoliceTransferencia {
  id_item: number;
  descricao: string | null;
  confere: number | null;
  complemento: string | null;
  id_estado: string | null;
  id_cidade: number | null;
  id_estado_ori: string | null;
  id_cidade_ori: number | null;
}

export async function listarItensApoliceParaTransferencia(idSinistro: number): Promise<ItemApoliceTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<ItemApoliceTransferencia>(
    `select id_item, descricao, confere, complemento, id_estado, id_cidade, id_estado_ori, id_cidade_ori
     from sinistro_apolice where id_sinistro = ?`,
    [idSinistro],
  );
}
