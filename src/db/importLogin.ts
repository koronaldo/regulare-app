import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from './client';
import { registrarLogEmLote } from './logs';

type Row = Record<string, unknown>;
type BindValue = string | number | null;

/** Uma tabela "de referência": zera tudo (ou um recorte) e reinsere a cada login. */
interface ImportSpec {
  resultFlag: string;
  totalKey: string;
  dataKey: string;
  table: string;
  columns: string[];
  values: (row: Row) => BindValue[];
  /** Apaga todas as linhas da tabela antes de reinserir. */
  deleteAll?: boolean;
  /** Apaga por chave, executado uma vez por linha, antes do insert daquela linha. */
  deleteWhere?: { columns: string[]; values: (row: Row) => BindValue[] };
  /** Apaga por chave uma única vez, usando a primeira linha do lote (padrão legado sinioutros/siniapo). */
  deleteWhereOnce?: { columns: string[]; values: (firstRow: Row) => BindValue[] };
}

/**
 * Normaliza um valor vindo do JSON da API para algo que o SQLite aceite no bind.
 * O backend legado serializa colunas boolean do Postgres de duas formas diferentes
 * dependendo do trecho de código de origem: a palavra "true"/"false" (ex.: ocupacao.ativo)
 * ou o formato nativo do Postgres "t"/"f" (ex.: apolice_item.conferencia,
 * maquina_item.conferencia) — nenhuma das duas é um boolean JSON de verdade, e como
 * ambas são strings não-vazias, `!!valor` sempre dá true se não convertermos aqui.
 */
function n(v: unknown): BindValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === 'true' || v === 't') return 1;
  if (v === 'false' || v === 'f') return 0;
  if (typeof v === 'string' || typeof v === 'number') return v;
  return String(v);
}

/**
 * Especificações portadas de RegulareMobile4.0/www/js/importa_dados.js.
 * Cada bloco corresponde a um `if (json.result_X == true) { ... }` do app legado.
 *
 * Tabelas de referência (quase nunca mudam) — vêm de dados_estaticos.php,
 * buscado só uma vez (ver precisaDadosEstaticos), não a cada login.
 */
const STATIC_IMPORTS: ImportSpec[] = [
  {
    resultFlag: 'result_despesa',
    totalKey: 'total_despesa',
    dataKey: 'dados_despesa',
    table: 'despesa',
    columns: ['id_despesa', 'nm_despesa', 'id_unimed', 'tipo'],
    values: (r) => [n(r.id_despesa), n(r.nm_despesa), n(r.id_unimed), n(r.tipo)],
    deleteWhere: { columns: ['id_despesa'], values: (r) => [n(r.id_despesa)] },
  },
  {
    resultFlag: 'result_tipoapolice',
    totalKey: 'total_tipoapolice',
    dataKey: 'dados_tipoapolice',
    table: 'tipoapolice',
    columns: ['id_tipoapolice', 'nm_tipoapolice', 'tipo_apolice'],
    values: (r) => [n(r.id_tipoapolice), n(r.nm_tipoapolice), n(r.tipo_apolice)],
    deleteWhere: { columns: ['id_tipoapolice'], values: (r) => [n(r.id_tipoapolice)] },
  },
  {
    resultFlag: 'result_apoite',
    totalKey: 'total_apoite',
    dataKey: 'dados_apoite',
    table: 'apolice_item',
    columns: ['id_item', 'descricao', 'referencia', 'lista_selecao', 'conferencia', 'ordem_item'],
    values: (r) => [n(r.id_item), n(r.descricao), n(r.referencia), n(r.lista_selecao), n(r.conferencia), n(r.ordem_item)],
    deleteWhere: { columns: ['id_item'], values: (r) => [n(r.id_item)] },
  },
  {
    resultFlag: 'result_assunto',
    totalKey: 'total_assunto',
    dataKey: 'dados_assunto',
    table: 'assunto',
    columns: ['id_assunto', 'nm_assunto'],
    values: (r) => [n(r.id_assunto), n(r.nm_assunto)],
    deleteWhere: { columns: ['id_assunto'], values: (r) => [n(r.id_assunto)] },
  },
  {
    resultFlag: 'result_maquinaitem',
    totalKey: 'total_maquinaitem',
    dataKey: 'dados_maquinaitem',
    table: 'maquina_item',
    columns: ['id_item', 'descricao', 'referencia', 'lista_selecao', 'conferencia'],
    values: (r) => [n(r.id_item), n(r.descricao), n(r.referencia), n(r.lista_selecao), n(r.conferencia)],
    deleteWhere: { columns: ['id_item'], values: (r) => [n(r.id_item)] },
  },
  {
    resultFlag: 'result_nacionalidade',
    totalKey: 'total_nacionalidade',
    dataKey: 'dados_nacionalidade',
    table: 'nacionalidade',
    columns: ['id_nacionalidade', 'nm_nacionalidade'],
    values: (r) => [n(r.id_nacionalidade), n(r.nm_nacionalidade)],
    deleteWhere: { columns: ['id_nacionalidade'], values: (r) => [n(r.id_nacionalidade)] },
  },
  {
    resultFlag: 'result_civil',
    totalKey: 'total_estcivil',
    dataKey: 'dados_civil',
    table: 'estado_civil',
    columns: ['id_civil', 'nm_civil'],
    values: (r) => [n(r.id_civil), n(r.nm_civil)],
    deleteWhere: { columns: ['id_civil'], values: (r) => [n(r.id_civil)] },
  },
  {
    resultFlag: 'result_despesa_reg',
    totalKey: 'total_despesa_reg',
    dataKey: 'dados_despesa_reg',
    table: 'despesa_reg',
    columns: [
      'id_reguladora',
      'id_despesa',
      'id_seguradora',
      'id_sucursal',
      'vlr_uni',
      'limite_ini',
      'limite_fim',
      'qtde_ini',
      'qtde_fim',
    ],
    values: (r) => [
      n(r.id_reguladora),
      n(r.id_despesa),
      n(r.id_seguradora),
      n(r.id_sucursal),
      n(r.vlr_uni),
      n(r.limite_ini),
      n(r.limite_fim),
      n(r.qtde_ini),
      n(r.qtde_fim),
    ],
    deleteAll: true,
  },
  {
    resultFlag: 'result_esquadria',
    totalKey: 'total_esquadria',
    dataKey: 'dados_esquadria',
    table: 'esquadria',
    columns: ['id_esquadria', 'nm_esquadria'],
    values: (r) => [n(r.id_esquadria), n(r.nm_esquadria)],
    deleteWhere: { columns: ['id_esquadria'], values: (r) => [n(r.id_esquadria)] },
  },
  {
    resultFlag: 'result_parede',
    totalKey: 'total_parede',
    dataKey: 'dados_parede',
    table: 'parede',
    columns: ['id_parede', 'nm_parede'],
    values: (r) => [n(r.id_parede), n(r.nm_parede)],
    deleteWhere: { columns: ['id_parede'], values: (r) => [n(r.id_parede)] },
  },
  {
    resultFlag: 'result_estrutura',
    totalKey: 'total_estrutura',
    dataKey: 'dados_estrutura',
    table: 'estrutura',
    columns: ['id_estrutura', 'nm_estrutura'],
    values: (r) => [n(r.id_estrutura), n(r.nm_estrutura)],
    deleteWhere: { columns: ['id_estrutura'], values: (r) => [n(r.id_estrutura)] },
  },
  {
    resultFlag: 'result_ocupacao',
    totalKey: 'total_ocupacao',
    dataKey: 'dados_ocupacao',
    table: 'ocupacao',
    columns: ['id_ocupacao', 'nm_ocupacao', 'ativo'],
    values: (r) => [n(r.id_ocupacao), n(r.nm_ocupacao), n(r.ativo)],
    deleteWhere: { columns: ['id_ocupacao'], values: (r) => [n(r.id_ocupacao)] },
  },
  {
    resultFlag: 'result_tipocobertura',
    totalKey: 'total_tipocobertura',
    dataKey: 'dados_tipocobertura',
    table: 'tipocobertura',
    columns: ['id_tipocobertura', 'nm_tipocobertura'],
    values: (r) => [n(r.id_tipocobertura), n(r.nm_tipocobertura)],
    deleteWhere: { columns: ['id_tipocobertura'], values: (r) => [n(r.id_tipocobertura)] },
  },
  {
    resultFlag: 'result_segimagem',
    totalKey: 'total_segimagem',
    dataKey: 'dados_segimagem',
    table: 'seguradora_imagem',
    columns: ['id_seguradora', 'tipo_img', 'filebit'],
    values: (r) => [n(r.id_seguradora), n(r.tipo_img), n(r.filebit)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_segmodatadoc',
    totalKey: 'total_segmodatadoc',
    dataKey: 'dados_segmodatadoc',
    table: 'ataseg_doc',
    columns: ['id_seguradora', 'id_produto', 'id_modata', 'id_documento'],
    values: (r) => [n(r.id_seguradora), n(r.id_produto), n(r.id_modata), n(r.id_documento)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_tipotrans',
    totalKey: 'total_tipotrans',
    dataKey: 'dados_tipotrans',
    table: 'tipo_trans',
    columns: ['id_tipotrans', 'nm_tipotrans', 'ordem'],
    values: (r) => [n(r.id_tipotrans), n(r.nm_tipotrans), n(r.ord_trans)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_atas',
    totalKey: 'total_atas',
    dataKey: 'dados_atas',
    table: 'modelo_atas',
    columns: ['id_modata', 'nm_modata', 'sigla_modata', 'simbolo', 'nome_simple'],
    values: (r) => [n(r.id_modata), n(r.nm_modata), n(r.sigla_modata), n(r.simbolo), n(r.nome_simple)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_ataseg',
    totalKey: 'total_ataseg',
    dataKey: 'dados_ataseg',
    table: 'modelo_ataseg',
    columns: ['id_seqata', 'id_modata', 'id_seguradora', 'layout', 'tip_pes', 'produto'],
    values: (r) => [n(r.id_seqata), n(r.id_modata), n(r.id_seguradora), n(r.layout), n(r.tip_pes), n(r.produto)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_ataseg_prod',
    totalKey: 'total_ataseg_prod',
    dataKey: 'dados_ataseg_prod',
    table: 'modelo_ataseg_prod',
    columns: ['id_seqata', 'id_seguradora', 'id_produto'],
    values: (r) => [n(r.id_seqata), n(r.id_seguradora), n(r.id_produto)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_docgrupo',
    totalKey: 'total_docgrupo',
    dataKey: 'dados_docgrupo',
    table: 'docgrupo',
    columns: ['id_docgrupo', 'nm_docgrupo'],
    values: (r) => [n(r.id_docgrupo), n(r.nm_docgrupo)],
    deleteWhere: { columns: ['id_docgrupo'], values: (r) => [n(r.id_docgrupo)] },
  },
  {
    resultFlag: 'result_seguradora',
    totalKey: 'total_seguradora',
    dataKey: 'dados_seguradora',
    table: 'seguradora',
    columns: ['id_seguradora', 'nm_seguradora', 'apelido', 'avalia_segura', 'obriga_ident_despesa'],
    values: (r) => [n(r.id_seguradora), n(r.nm_seguradora), n(r.apelido), n(r.avalia_segura), n(r.obriga_ident_despesa)],
    deleteWhere: { columns: ['id_seguradora'], values: (r) => [n(r.id_seguradora)] },
  },
  {
    resultFlag: 'result_tipoconta',
    totalKey: 'total_tipoconta',
    dataKey: 'dados_tipoconta',
    table: 'tipoconta',
    columns: ['id_tipoconta', 'nm_tipoconta'],
    values: (r) => [n(r.id_tipoconta), n(r.nm_tipoconta)],
    deleteWhere: { columns: ['id_tipoconta'], values: (r) => [n(r.id_tipoconta)] },
  },
  {
    resultFlag: 'result_formapag_tipoconta',
    totalKey: 'total_formapag_tipoconta',
    dataKey: 'dados_formapag_tipoconta',
    table: 'formapag_tipoconta',
    columns: ['id_seguradora', 'id_formapag', 'id_tipoconta'],
    values: (r) => [n(r.id_seguradora), n(r.id_formapag), n(r.id_tipoconta)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_uf',
    totalKey: 'total_uf',
    dataKey: 'dados_uf',
    table: 'estado',
    columns: ['id_estado', 'nm_estado'],
    values: (r) => [n(r.id_estado), n(r.nm_estado)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_bancos',
    totalKey: 'total_bancos',
    dataKey: 'dados_bancos',
    table: 'bancos',
    columns: ['id_banco', 'nm_banco', 'codigo'],
    values: (r) => [n(r.id_banco), n(r.nm_banco), n(r.codigo)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_cob',
    totalKey: 'total_cob',
    dataKey: 'dados_cob',
    table: 'cobertura',
    columns: ['id_cobertura', 'nm_cobertura', 'tipo_cob'],
    values: (r) => [n(r.id_cobertura), n(r.nm_cobertura), n(r.tipo_cob)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_relacaoseg',
    totalKey: 'total_relacaoseg',
    dataKey: 'dados_relacaoseg',
    table: 'relacaoseg',
    columns: ['id_relacaoseg', 'nm_relacaoseg'],
    values: (r) => [n(r.id_relacaoseg), n(r.nm_relacaoseg)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_cidade',
    totalKey: 'total_cidade',
    dataKey: 'dados_cidade',
    table: 'cidade',
    columns: ['id_cidade', 'nm_cidade', 'id_estado', 'ibge', 'longitude', 'latitude'],
    values: (r) => [n(r.id_cidade), n(r.nm_cidade), n(r.id_estado), n(r.ibge), n(r.longitude), n(r.latitude)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_documentos',
    totalKey: 'total_documentos',
    dataKey: 'dados_documentos',
    table: 'documentos',
    columns: ['id_documento', 'nm_documento', 'descritivo', 'id_docgrupo'],
    values: (r) => [n(r.id_documento), n(r.nm_documento), n(r.descritivo), n(r.id_docgrupo)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_causa',
    totalKey: 'total_causa',
    dataKey: 'dados_causa',
    table: 'causamob',
    columns: ['id_causa', 'nm_causa'],
    values: (r) => [n(r.id_causa), n(r.nm_causa)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_legendaf',
    totalKey: 'total_legendaf',
    dataKey: 'dados_legendaf',
    table: 'legendaf',
    columns: ['id_legendaf', 'nm_legendaf', 'tipo_leg', 'ordem_leg', 'forma_leg'],
    values: (r) => [n(r.id_legendaf), n(r.nm_legendaf), n(r.tipo_leg), n(r.ordem_leg), n(r.forma_leg)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_legendafcausa',
    totalKey: 'total_legendafcausa',
    dataKey: 'dados_legendafcausa',
    table: 'legendafcausa',
    columns: ['id_legendaf', 'id_causa'],
    values: (r) => [n(r.id_legendaf), n(r.id_causa)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_textos',
    totalKey: 'total_textos',
    dataKey: 'dados_textos',
    table: 'textos',
    columns: ['id_texto', 'nm_texto'],
    values: (r) => [n(r.id_texto), n(r.nm_texto)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_formapag',
    totalKey: 'total_formapag',
    dataKey: 'dados_formapag',
    table: 'formapag',
    columns: ['id_formapag', 'nm_formapag'],
    values: (r) => [n(r.id_formapag), n(r.nm_formapag)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_segformapag',
    totalKey: 'total_segformapag',
    dataKey: 'dados_segformapag',
    table: 'seguradora_formapag',
    columns: ['id_seguradora', 'id_formapag'],
    values: (r) => [n(r.id_seguradora), n(r.id_formapag)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_segrisco',
    totalKey: 'total_segrisco',
    dataKey: 'dados_segrisco',
    table: 'segrisco',
    columns: ['id_seguradora', 'id_risco', 'nm_risco', 'forma_risco', 'obriga_risco', 'lista_risco'],
    values: (r) => [
      n(r.id_seguradora),
      n(r.id_risco),
      n(r.nm_risco),
      n(r.forma_risco),
      n(r.obriga_risco),
      n(r.lista_risco),
    ],
    deleteAll: true,
  },
  {
    resultFlag: 'result_textosmob',
    totalKey: 'total_textosmob',
    dataKey: 'dados_textosmob',
    table: 'textomob',
    columns: ['id_texto', 'id_mobile', 'nm_mobile', 'ordem', 'resposta_def'],
    values: (r) => [n(r.id_texto), n(r.id_mobile), n(r.nm_mobile), n(r.ordem), n(r.resposta_def)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_textosmob_causa',
    totalKey: 'total_textosmob_causa',
    dataKey: 'dados_textosmob_causa',
    table: 'textomob_causa',
    columns: ['id_texto', 'id_mobile', 'id_causa'],
    values: (r) => [n(r.id_texto), n(r.id_mobile), n(r.id_causa)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_prod_questao',
    totalKey: 'total_prod_questao',
    dataKey: 'dados_prod_questao',
    table: 'prod_questao',
    columns: ['id_prodques', 'nm_prodques'],
    values: (r) => [n(r.id_prodques), n(r.nm_prodques)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_segproduto_prod_questao',
    totalKey: 'total_segproduto_prod_questao',
    dataKey: 'dados_segproduto_prod_questao',
    table: 'segproduto_prod_questao',
    columns: ['id_seguradora', 'id_produto', 'id_prodques'],
    values: (r) => [n(r.id_seguradora), n(r.id_produto), n(r.id_prodques)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_prod_questao_per',
    totalKey: 'total_prod_questao_per',
    dataKey: 'dados_prod_questao_per',
    table: 'prod_questao_per',
    columns: [
      'id_perprod',
      'nm_perprod',
      'id_prodques',
      'comenta',
      'nomcpf',
      'ordem',
      'funcao',
      'id_perlink',
      'id_reslink',
      'resposta_ref',
      'id_grupoper',
    ],
    values: (r) => [
      n(r.id_perprod),
      n(r.nm_perprod),
      n(r.id_prodques),
      n(r.comenta),
      n(r.nomcpf),
      n(r.ordem),
      n(r.funcao),
      n(r.id_perlink),
      n(r.id_reslink),
      n(r.resposta_ref),
      n(r.id_grupoper),
    ],
    deleteAll: true,
  },
  {
    resultFlag: 'result_prod_questao_grupo',
    totalKey: 'total_prod_questao_grupo',
    dataKey: 'dados_prod_questao_grupo',
    table: 'prod_questao_grupo',
    columns: ['id_prodques', 'id_grupoper', 'nm_grupoper'],
    values: (r) => [n(r.id_prodques), n(r.id_grupoper), n(r.nm_grupoper)],
    deleteAll: true,
  },
  {
    resultFlag: 'result_prod_questao_res',
    totalKey: 'total_prod_questao_res',
    dataKey: 'dados_prod_questao_res',
    table: 'prod_questao_res',
    columns: ['id_resprod', 'nm_resprod', 'id_prodques', 'id_perprod', 'res_default'],
    values: (r) => [n(r.id_resprod), n(r.nm_resprod), n(r.id_prodques), n(r.id_perprod), n(r.res_default)],
    deleteAll: true,
  },
];

/**
 * Dados dependentes dos sinistros do usuário (mudam a cada login) — continuam vindo
 * da resposta de autentica_criptoX40.php, junto com result_sini (ver importSinistros).
 */
const DYNAMIC_IMPORTS: ImportSpec[] = [
  {
    resultFlag: 'result_sinitrans',
    totalKey: 'total_sinitrans',
    dataKey: 'dados_sinitrans',
    table: 'sini_trans',
    columns: ['id_sinistro', 'id_tipotrans', 'data_trans', 'hora_trans', 'status_trans'],
    values: (r) => [n(r.id_sinistro), n(r.id_tipotrans), n(r.data_trans), n(r.hora_trans), n(r.status_trans)],
    deleteWhere: {
      columns: ['id_sinistro', 'id_tipotrans'],
      values: (r) => [n(r.id_sinistro), n(r.id_tipotrans)],
    },
  },
  {
    resultFlag: 'result_siniapo',
    totalKey: 'total_siniapo',
    dataKey: 'dados_siniapo',
    table: 'sinistro_apolice',
    columns: [
      'id_sinistro',
      'id_item',
      'descricao',
      'confere',
      'complemento',
      'id_apolice',
      'id_estado',
      'id_cidade',
      'id_estado_ori',
      'id_cidade_ori',
    ],
    // A troca id_estado <-> id_estado_ori (e cidade) é intencional e espelha a que a subida já
    // faz em atualiza_informacoes_sinistro.php: no servidor o par _ori guarda o valor da apólice
    // (a referência) e o par sem sufixo guarda o que o regulador encontrou; localmente é o
    // contrário. Sem inverter aqui também, um sinistro que volta do servidor com o checklist já
    // respondido reaparecia com "UF/Cidade" e "UF/Cidade encontrado" invertidos.
    values: (r) => [
      n(r.id_sinistro),
      n(r.id_item),
      n(r.descricao),
      n(r.confere),
      n(r.complemento),
      n(r.id_apolice),
      n(r.id_estado_ori),
      n(r.id_cidade_ori),
      n(r.id_estado),
      n(r.id_cidade),
    ],
    deleteWhereOnce: { columns: ['id_sinistro'], values: (first) => [n(first.id_sinistro)] },
  },
  {
    resultFlag: 'result_sinioutros',
    totalKey: 'total_sinioutros',
    dataKey: 'dados_sinioutros',
    table: 'sini_outros',
    columns: ['id_sinistro', 'prejuizo', 'data_ocors', 'seguradora', 'ocorrencia'],
    values: (r) => [n(r.id_sinistro), n(r.prejuizo), n(r.data_ocor), n(r.seguradora), n(r.ocorrencia)],
    deleteWhereOnce: { columns: ['id_sinistro'], values: (first) => [n(first.id_sinistro)] },
  },
  {
    resultFlag: 'result_sinicob',
    totalKey: 'total_sinicob',
    dataKey: 'dados_sinicob',
    table: 'sinimobcob',
    columns: ['id_sinistro', 'id_cobertura', 'vlr_cobertura', 'vlr_franquia', 'vlr_cob_estima', 'complemento', 'perc_franquia', 'id_cobweb'],
    values: (r) => [
      n(r.id_sinistro),
      n(r.id_cobertura),
      n(r.vlr_cobertura),
      n(r.vlr_franquia),
      n(r.vlr_cob_estima),
      n(r.complemento),
      n(r.perc_franquia),
      n(r.id_sinicob),
    ],
    deleteWhere: { columns: ['id_sinistro', 'id_cobertura'], values: (r) => [n(r.id_sinistro), n(r.id_cobertura)] },
  },
  {
    resultFlag: 'result_cor',
    totalKey: 'total_cor',
    dataKey: 'dados_cor',
    table: 'corretora',
    columns: ['id_corretora', 'nm_corretora', 'cnpj', 'id_estado', 'id_cidade', 'endereco', 'bairro', 'cep', 'email', 'telefone'],
    values: (r) => [
      n(r.id_corretora),
      n(r.nm_corretora),
      n(r.cnpj),
      n(r.id_estado),
      n(r.id_cidade),
      n(r.endereco),
      n(r.bairro),
      n(r.cep),
      n(r.email),
      n(r.telefone),
    ],
    deleteAll: true,
  },
  {
    resultFlag: 'result_sinidoc',
    totalKey: 'total_sinidoc',
    dataKey: 'dados_sinidoc',
    table: 'sinidoc',
    columns: ['id_sinistro', 'id_documento', 'solicitado', 'data_entregue', 'anexo_ori', 'anexo_des', 'id_usuario', 'complemento', 'docext'],
    values: (r) => [
      n(r.id_sinistro),
      n(r.id_documento),
      n(r.solicitado),
      n(r.data_entregue),
      n(r.anexo_ori),
      n(r.anexo_des),
      n(r.id_usuario),
      n(r.complemento),
      n(r.docext),
    ],
    deleteAll: true,
  },
  {
    resultFlag: 'result_sinibenfe',
    totalKey: 'total_sinibenfe',
    dataKey: 'dados_sinibenfe',
    table: 'sinibenfe',
    columns: [
      'id_sinistro', 'id_benfeito', 'construcao', 'id_ocupacao', 'area', 'idade', 'danos',
      'nm_benfeito', 'id_estrutura', 'id_parede', 'id_tipocobertura', 'id_esquadria', 'tipo_bene',
      'marca', 'modelo', 'nro_serie', 'chassi', 'ano', 'placa', 'total_km', 'item_apolice', 'reforma',
      'tipo_loc_bene', 'tipo_ocupa_bene', 'tipo_loc_consta', 'justifica_tipo', 'cor', 'coord_lat',
      'coord_long', 'id_cobertura', 'id_benmaq', 'vlr_declarado', 'valor_is', 'obs_benfe', 'id_causa',
      'id_dano', 'operador_habilitado', 'exclusivo_agricula', 'locacao', 'financiado', 'confere_apolice',
    ],
    values: (r) => [
      n(r.id_sinistro), n(r.id_benfeito), n(r.construcao), n(r.id_ocupacao), n(r.area), n(r.idade), n(r.danos),
      n(r.nm_benfeito), n(r.id_estrutura), n(r.id_parede), n(r.id_tipocobertura), n(r.id_esquadria), n(r.tipo_bene),
      n(r.marca), n(r.modelo), n(r.nro_serie), n(r.chassi), n(r.ano), n(r.placa), n(r.total_km), n(r.item_apolice),
      n(r.reforma), n(r.tipo_loc_bene), n(r.tipo_ocupa_bene), n(r.tipo_loc_consta), n(r.justifica_tipo), n(r.cor),
      n(r.coord_lat), n(r.coord_long), n(r.id_cobertura), n(r.id_benmaq), n(r.vlr_declarado), n(r.valor_is),
      n(r.obs_benfe), n(r.id_causa), n(r.id_dano), n(r.operador_habilitado), n(r.exclusivo_agricula),
      n(r.locacao), n(r.financiado), n(r.confere_apolice),
    ],
    deleteWhere: { columns: ['id_sinistro', 'id_benmaq'], values: (r) => [n(r.id_sinistro), n(r.id_benmaq)] },
  },
];

const SINIMOB_COLUMNS = [
  'id_sinistro', 'id_reguladora', 'id_regulador',
  'id_seguradora', 'id_segurado', 'nm_segurado',
  'id_produto', 'nm_produto', 'nro_sinistro', 'nroreg_sinistro', 'apolicie', 'datasol', 'data_ocor',
  'data_age_vistoria', 'horai_age_vistoria', 'id_causa', 'nm_causa', 'endereco', 'bairro', 'cep',
  'id_cidade', 'nm_cidade', 'id_estado', 'fone', 'celular', 'contatoseg', 'vlr_prejuizo', 'data_aviso',
  'id_corretora', 'situacao', 'hora_ocor', 'hora_incerta', 'id_causa_que',
  'sem_cobertura', 'emailseg', 'id_relacaoseg', 'atendente', 'id_preserva',
  'tratar_ate', 'tratar_ass', 'id_relacaoseg_ass', 'atendente_ass',
  'mesma_pessoa', 'outro_seguro', 'rg_assina', 'rg_atendente', 'apolice',
  'cpf', 'tipo_doc', 'rgseg', 'nm_sucursal',
  'nm_corretora', 'fonecor', 'emailcor', 'data_vistoria', 'datavig_ini',
  'datavig_fim', 'path_docs', 'proposta_seg', 'email_corretora_alternativo',
  'contato_corretora_alternativo', 'fone_corretora_alternativo',
  'id_causa_abe', 'id_sucursal', 'construcao', 'ocupacao', 'id_nacionalidade',
  'id_civil', 'nro_predio', 'nro_unidade', 'envio_preliminar', 'id_tipoapolice',
  'territorio_nacional', 'local_determinado', 'item_unico',
];

function sinimobValues(r: Row): BindValue[] {
  return [
    n(r.id_sinistro), n(r.id_reguladora), n(r.id_regulador),
    n(r.id_seguradora), n(r.id_segurado), n(r.nm_segurado),
    n(r.id_produto), n(r.nm_produto), n(r.nro_sinistro), n(r.nroreg_sinistro), n(r.apolicie), n(r.datasol), n(r.data_ocor),
    n(r.data_age_vistoria), n(r.horai_age_vistoria), null, n(r.nm_causa), n(r.endereco), n(r.bairro), n(r.cep),
    n(r.id_cidade), n(r.nm_cidade), n(r.id_estado), n(r.fone), n(r.celular), n(r.contato), n(r.vlr_prejuizo), n(r.data_avis),
    n(r.id_corretora), 'A', n(r.hora_ocor), n(r.hora_incerta), null,
    n(r.sem_cobertura), n(r.email_seg), n(r.id_relacaoseg), n(r.atendente), n(r.id_preserva),
    n(r.tratar_ate), n(r.tratar_ass), n(r.id_relacaoseg_ass), n(r.atendente_ass),
    n(r.mesma_pessoa), n(r.outro_seguro), n(r.rg_assina), n(r.rg_atendente), n(r.apolicie),
    n(r.cpf), n(r.tipo_doc), n(r.rgseg), n(r.nm_sucursal),
    n(r.nm_corretora), n(r.fonecor), n(r.emailcor), n(r.data_vistoria), n(r.data_vig_ini),
    n(r.data_vig_fim), n(r.path_docs), n(r.proposta_seg), n(r.email_corretora_alternativo),
    n(r.contato_corretora_alternativo), n(r.fone_corretora_alternativo),
    n(r.id_causa_abe), n(r.id_sucursal), n(r.construcao), n(r.ocupacao), n(r.id_nacionalidade),
    n(r.id_civil), n(r.nro_predio), n(r.nro_unidade), 'N', n(r.id_tipoapolice),
    n(r.territorio_nacional), n(r.local_determinado), n(r.item_unico),
  ];
}

const BOTOES_SINISTRO: [string, string, string, string, number][] = [
  ['cadastro', 'S', 'fas fa-user', 'Cadastro Geral', 1],
  ['relato', 'N', 'fas fa-comment-dots', 'Relato Segurado', 2],
  ['parecer', 'N', 'fa-solid fa-file-pen', 'Constatações do regulador', 3],
  ['informacoes', 'N', 'fas fa-users', 'Inf. Gerais e Benfeitorias', 4],
  ['coberturas', 'N', 'fas fa-umbrella', 'Coberturas', 5],
  ['beneficia', 'N', 'fa-solid fa-user-shield', 'Beneficiários', 6],
  ['planilha', 'N', 'fa-solid fa-table-cells', 'Planilha Apuração', 7],
  ['outro', 'N', 'fa-solid fa-house-crack', 'Outros Seguros', 8],
  ['fotos', 'S', 'fas fa-image', 'Álbum de Fotos', 9],
  ['docs', 'S', 'fas fa-folder', 'Relação Documentos', 10],
  ['despesas', 'S', 'fas fa-receipt', 'Despesas Viagem', 11],
  ['videos', 'S', 'fas fa-video', 'Vídeos e Áudios', 12],
  ['preliminar', 'N', 'fa-solid fa-file-signature', 'Atas e Termos', 13],
  ['apolice', 'S', 'fas fa-file-alt', 'Apólice e Cond. Geral', 14],
  ['questionario', 'S', 'fa-solid fa-list-check', 'Questionário', 15],
];

async function importUsuario(db: SQLiteDatabase, dados: Row, user: string) {
  await db.runAsync('delete from usuarioff where login=? or emailreg=?', [user, user]);
  await db.runAsync(
    `insert into usuarioff(id_usuario,nm_usuario,id_reguladora,nm_reguladora,id_regulador,login,
      fone_reguladora,email_reguladora,email_doctos,fone_doctos,fonereg,celureg,emailreg,
      senha_crypto,cpfreg,senha_crypto_aux) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      n(dados.codusu), n(dados.nomusu), n(dados.codregula), n(dados.nomregula), n(dados.codreg),
      n(dados.login), n(dados.fon_reguladora), n(dados.ema_reguladora), n(dados.email_doctos),
      n(dados.fone_doctos), n(dados.fone_reg), n(dados.celu_reg), n(dados.email_reg),
      n(dados.senha_crypto), n(dados.cpf_usu), n(dados.senha_crypto_aux),
    ],
  );
}

/** Limite conservador de parâmetros por statement (SQLite aceita bem mais, mas isso mantém as queries pequenas). */
const MAX_PARAMS = 900;

function rowsFromResponse(json: Record<string, any>, dataKey: string, totalKey: string): Row[] {
  const total: number = json[totalKey] ?? 0;
  const rows: unknown[] = json[dataKey] ?? [];
  return rows.slice(0, total).filter((r): r is Row => r != null);
}

/** Insere em lotes (multi-row VALUES) para evitar milhares de round-trips assíncronos. */
async function batchInsert(db: SQLiteDatabase, table: string, columns: string[], rows: BindValue[][]) {
  if (rows.length === 0) return;

  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / columns.length));
  const rowPlaceholder = `(${columns.map(() => '?').join(',')})`;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const sql = `insert or ignore into ${table}(${columns.join(',')}) values ${chunk
      .map(() => rowPlaceholder)
      .join(',')}`;
    await db.runAsync(sql, chunk.flat());
  }
}

/** Apaga em lotes por chave (1 ou mais colunas), também evitando um DELETE por linha. */
async function batchDeleteByKeys(db: SQLiteDatabase, table: string, keyColumns: string[], keys: BindValue[][]) {
  if (keys.length === 0) return;

  if (keyColumns.length === 1) {
    const chunkSize = MAX_PARAMS;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const sql = `delete from ${table} where ${keyColumns[0]} in (${chunk.map(() => '?').join(',')})`;
      await db.runAsync(sql, chunk.map((k) => k[0]));
    }
    return;
  }

  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / keyColumns.length));
  const whereGroup = `(${keyColumns.map((c) => `${c}=?`).join(' and ')})`;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const sql = `delete from ${table} where ${chunk.map(() => whereGroup).join(' or ')}`;
    await db.runAsync(sql, chunk.flat());
  }
}

async function importSinistros(db: SQLiteDatabase, json: Record<string, any>) {
  if (json.result_sini !== true) return;
  const rows = rowsFromResponse(json, 'dados_sini', 'total_sini');
  if (rows.length === 0) return;

  // Detecta quais processos ainda não existem localmente (sinimob usa insert or ignore) antes de
  // inserir, pra registrar o log "Importado o aplicativo" só na primeira vez que cada um chega.
  const idsRecebidos = rows.map((r) => Number(n(r.id_sinistro)));
  const placeholders = idsRecebidos.map(() => '?').join(',');
  const existentes = await db.getAllAsync<{ id_sinistro: number }>(
    `select id_sinistro from sinimob where id_sinistro in (${placeholders})`,
    idsRecebidos,
  );
  const idsExistentes = new Set(existentes.map((e) => e.id_sinistro));
  const idsNovos = idsRecebidos.filter((id) => !idsExistentes.has(id));

  await batchInsert(db, 'sinimob', SINIMOB_COLUMNS, rows.map(sinimobValues));

  const botaoColumns = ['id_sinistro', 'nm_botao', 'sit_botao', 'icone', 'label', 'ordem'];
  const botaoRows: BindValue[][] = [];
  for (const row of rows) {
    for (const [nmBotao, sitBotao, icone, label, ordem] of BOTOES_SINISTRO) {
      botaoRows.push([n(row.id_sinistro), nmBotao, sitBotao, icone, label, ordem]);
    }
  }
  await batchInsert(db, 'btn_permissoes', botaoColumns, botaoRows);

  if (idsNovos.length > 0) {
    await registrarLogEmLote(idsNovos, 'Importado o aplicativo');
  }
}

async function runSimpleImport(db: SQLiteDatabase, json: Record<string, any>, spec: ImportSpec) {
  if (json[spec.resultFlag] !== true) return;

  const rows = rowsFromResponse(json, spec.dataKey, spec.totalKey);

  if (spec.deleteAll) {
    await db.runAsync(`delete from ${spec.table}`);
  }
  if (spec.deleteWhereOnce && rows.length > 0) {
    const { columns, values } = spec.deleteWhereOnce;
    const whereSql = columns.map((c) => `${c}=?`).join(' and ');
    await db.runAsync(`delete from ${spec.table} where ${whereSql}`, values(rows[0]));
  }
  if (spec.deleteWhere) {
    const keys = rows.map((r) => spec.deleteWhere!.values(r));
    await batchDeleteByKeys(db, spec.table, spec.deleteWhere.columns, keys);
  }

  await batchInsert(db, spec.table, spec.columns, rows.map(spec.values));
}

/**
 * Porta ImportaDados(json, user) do app legado: grava o usuário autenticado e
 * atualiza (zera + reinsere) os dados dependentes dos sinistros do usuário.
 * Idempotente — pode rodar em todo login. Tabelas de referência (que quase nunca
 * mudam) NÃO entram aqui — ver importarDadosEstaticos/precisaDadosEstaticos.
 */
export async function importarDadosLogin(json: Record<string, any>, user: string): Promise<void> {
  if (!(json?.dados?.codusu > 0)) return;

  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await importUsuario(db, json.dados, user);

    for (const spec of DYNAMIC_IMPORTS) {
      await runSimpleImport(db, json, spec);
    }

    await importSinistros(db, json);
  });
}

/**
 * Tabelas de referência (estado, cidade, bancos, tipoapolice, textos, etc.) praticamente
 * nunca mudam, então em vez de buscar tudo de novo a cada login (como o legado fazia),
 * checa se já existem localmente. Usa `estado` como sentinela por ser pequena e sempre
 * presente quando o dados_estaticos.php já rodou uma vez.
 */
export async function precisaDadosEstaticos(): Promise<boolean> {
  try {
    const db = await getDb();
    const linha = await db.getFirstAsync<{ total: number }>('select count(*) as total from estado');
    return !linha || linha.total === 0;
  } catch {
    return true;
  }
}

/** Importa as tabelas de referência vindas de dados_estaticos.php. Ver precisaDadosEstaticos. */
export async function importarDadosEstaticos(json: Record<string, any>): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    for (const spec of STATIC_IMPORTS) {
      await runSimpleImport(db, json, spec);
    }
  });
}
