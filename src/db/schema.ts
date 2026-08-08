import { getDb } from './client';

const DEFAULT_SERVER_URL = 'https://regulare.eccreguladora.com.br/';

/**
 * Schema portado do banco local do app legado (RegulareMobile4.0/www/js/index.js
 * createTables()). Mantido fiel aos nomes de tabela/coluna originais para que a
 * lógica de importação (importLogin.ts) e futuras telas possam reutilizar o
 * mesmo vocabulário do sistema legado.
 */
const CREATE_TABLES_SQL = `
create table if not exists config(url_server varchar(125), PRIMARY KEY(url_server));

create table if not exists sinidesp_iti(
  id_sinidesp integer primary key autoincrement not null,
  id_despeweb integer, id_sinistro integer, id_despesa integer, qtde numeric(12,2), formato char(2),
  vlr_uni numeric(12,2), vlr_tot numeric(12,2), comple varchar(90), nome_recibo text, img_base64 text,
  recibo_pdf varchar, data_desp date, nro_despesa varchar(20));

create table if not exists tipoapolice(id_tipoapolice integer, nm_tipoapolice varchar(100), tipo_apolice char(3), PRIMARY KEY(id_tipoapolice));

create table if not exists maquina_item(id_item integer primary key autoincrement not null, descricao varchar(100), referencia char(1),
  lista_selecao varchar(400), conferencia boolean);

create table if not exists btn_permissoes(id_sinistro integer, nm_botao varchar(15), sit_botao char(1), icone varchar(30), label varchar(100), ordem smallint, PRIMARY KEY(id_sinistro,nm_botao));

create table if not exists sini_download(id_download integer primary key autoincrement not null, id_sinistro integer,
  path varchar(100), file varchar(100), fisico varchar(100), label_foto varchar(100));

create table if not exists sini_outros(id_sinistro integer, prejuizo numeric(12,2), data_ocors date, seguradora varchar(100), ocorrencia varchar(100));

create table if not exists sini_trans(id_sinistro integer, id_tipotrans integer, data_trans date, hora_trans time, status_trans char(1));

create table if not exists seguradora_imagem(id_seguradora integer, tipo_img char(2), filebit text);

create table if not exists apolice_item(id_item integer primary key, descricao varchar(100), referencia char(1), lista_selecao varchar, conferencia boolean, ordem_item integer);

create table if not exists corretora(id_corretora integer, nm_corretora varchar(120), cnpj varchar(30),
  id_estado char(2), id_cidade integer, endereco varchar(100), bairro varchar(60), cep varchar(10), email varchar(90),
  telefone varchar(30));

create table if not exists modelo_atas(id_modata integer, nm_modata varchar(80), sigla_modata varchar(20), simbolo varchar(15), nome_simple varchar(20));

create table if not exists tipo_trans(id_tipotrans integer, nm_tipotrans varchar(60), ordem smallint);

create table if not exists ataseg_doc(id_seguradora integer, id_produto integer, id_modata integer, id_documento integer);

create table if not exists modelo_ataseg(id_seqata integer, id_modata integer, id_seguradora integer, layout text, tip_pes char(1), produto char(1));

create table if not exists modelo_ataseg_prod(id_seqata integer, id_seguradora integer, id_produto integer);

create table if not exists usuarioff(id_usuario integer, nm_usuario varchar, id_reguladora integer,
  nm_reguladora varchar, id_regulador integer, login varchar, fone_reguladora varchar(30),
  email_reguladora varchar(70), email_doctos varchar(70), fone_doctos varchar(20), fonereg varchar(20), celureg varchar(20),
  emailreg varchar(70), senha_crypto varchar, cpfreg varchar(20), senha_crypto_aux varchar);

create table if not exists legendaf(id_legendaf integer, nm_legendaf varchar, tipo_leg char(2), ordem_leg smallint, forma_leg char(1), PRIMARY KEY(id_legendaf ASC));

create table if not exists sinidocpag(id_docpag integer primary key autoincrement not null,
  id_sinistro integer, id_documento integer, grupopag varchar, formato char(2),
  nome_arquivo text, ordem integer, enviado char(1), ordleg integer,
  img_base64 text, nome_fisico varchar(300), path_fisico varchar(300), data_insere date, hora_insere time);

create table if not exists sinidocpdf(id_docpdf integer primary key autoincrement not null,
  id_sinistro integer, id_documento integer, nome_arquivo text,
  nome_fisico varchar(300), path_fisico varchar(300), enviado boolean,
  data_insere date, hora_insere time);

create table if not exists sinidoc_exc(id_sinistro integer, id_documento integer, PRIMARY KEY(id_sinistro,id_documento));

create table if not exists legendafcausa(id_legendaf integer, id_causa integer, PRIMARY KEY(id_legendaf,id_causa));

create table if not exists docgrupo(id_docgrupo integer, nm_docgrupo varchar(100), PRIMARY KEY(id_docgrupo));

create table if not exists documentos(id_documento integer, id_docgrupo integer, descritivo boolean, nm_documento varchar, PRIMARY KEY(id_documento));

create table if not exists sinidoc(id_sinistro integer, id_documento integer, solicitado boolean,
  data_entregue date, anexo_ori varchar, anexo_des varchar, id_usuario integer, complemento varchar,
  forma_docx char(3), id_modata integer, docext char(1), chave_sign text,
  PRIMARY KEY(id_sinistro,id_documento));

create table if not exists sinifotoapp(id_foto integer primary key autoincrement not null,
  id_sinistro integer, arquivo text, legenda varchar, situacao varchar, posicao char(1),
  ordem smallint, ordleg integer, id_fotoweb integer, data_insere date,
  hora_insere time);

create table if not exists sinivideoapp(id_video integer primary key autoincrement not null, id_sinistro integer, arquivo varchar,
  legenda varchar, situacao varchar, posicao char(1), ordem smallint, ordleg integer, id_videoweb integer, video64 text);

create table if not exists estado(id_estado char(2), nm_estado varchar(100));

create table if not exists cidade(id_cidade integer, nm_cidade varchar(100), id_estado char(2), ibge varchar(7), longitude varchar(20), latitude varchar(20));

create index if not exists idx_cidade_id_estado on cidade(id_estado);
create index if not exists idx_cidade_nm_cidade on cidade(nm_cidade);

create table if not exists relacaoseg(id_relacaoseg integer, nm_relacaoseg varchar(100));

create table if not exists planilha_apuracao(id_planilha integer primary key autoincrement not null, id_sinistro integer,
  id_cobertura integer, nm_planilha varchar, vlr_uni_apr numeric(12,4), vlr_uni_rec numeric(12,4), qtde numeric(12,4),
  vlr_tot_apr numeric(12,4), vlr_tot_rec numeric(12,4), grupoitem char(6), id_plaweb integer,
  nm_planilha_item varchar);

create table if not exists sinimob(id_sinistro integer, id_reguladora integer,
  id_regulador integer, id_seguradora integer, id_sucursal integer,
  id_segurado integer, nm_segurado varchar, id_produto integer,
  nm_produto varchar, nro_sinistro varchar(25), apolice varchar(25),
  nroreg_sinistro varchar, apolicie varchar, datasol date, data_ocor date, data_age_vistoria date,
  horai_age_vistoria varchar, id_causa integer, nm_causa varchar, endereco varchar, bairro varchar,
  cep varchar, id_cidade integer, nm_cidade varchar, id_estado varchar, fone varchar,
  celular varchar, contatoseg varchar, vlr_prejuizo numeric(12,2), data_aviso date,
  id_corretora integer, situacao varchar, hora_ocor varchar,
  hora_incerta boolean, id_causa_que integer, sem_cobertura boolean, codinomeseg varchar(20),
  coorde_log varchar(20), coorde_lat varchar(20), coorde_grau varchar(70),
  id_relacaoseg integer, atendente varchar(40), id_preserva smallint,
  coberto char(1), emailseg varchar(100), tratar_ate varchar(10),
  tratar_ass varchar(10), id_relacaoseg_ass integer, atendente_ass varchar(40),
  mesma_pessoa char(1), outro_seguro char(1), rg_assina varchar(20),
  rg_atendente varchar(20), tipo_doc char(1), cpf varchar(20), rgseg varchar(20),
  nm_sucursal varchar(80), nm_corretora varchar(100),
  fonecor varchar(20), emailcor varchar(100),
  data_vistoria date, datavig_ini date, datavig_fim date, path_docs varchar(50),
  proposta_seg varchar(20), sini_atu char(1), email_corretora_alternativo varchar(100),
  contato_corretora_alternativo varchar(50), fone_corretora_alternativo varchar(20),
  id_causa_abe integer, km_inicial numeric(12,2), km_final numeric(12,2),
  novo_sini char(1), id_nacionalidade integer, id_civil integer, construcao varchar(100),
  ocupacao varchar(100), nro_predio varchar(20), nro_unidade varchar(20), envio_preliminar char(1), justifica_envio text, id_tipoapolice integer,
  territorio_nacional boolean, local_determinado boolean,
  PRIMARY KEY(id_sinistro ASC));

create table if not exists cobertura(id_cobertura integer, nm_cobertura varchar(60), ativo boolean,
  tipo_cob char(3), PRIMARY KEY(id_cobertura));

create table if not exists bancos(id_banco integer, nm_banco varchar(90), codigo varchar(5), PRIMARY KEY(id_banco));

create table if not exists sinimobcob(id_sinicob integer primary key autoincrement not null,
  id_sinistro integer, id_cobertura integer, complemento varchar(60),
  vlr_cobertura numeric(12,2), vlr_franquia numeric(12,2), perc_franquia numeric(12,2), vlr_risco numeric(12,2),
  vlr_coefi numeric(12,2), aval_risco boolean, id_benfeito smallint, reclamado char(1),
  clausula char(1), justifica text, zera_indeni boolean, texto_cg text, nro_clausula varchar(20),
  nro_cob varchar(15), item_apolice varchar(20), vlr_cob_estima numeric(12,2), verba_unica boolean,
  porteira boolean, perc_predio numeric(12,2), perc_conteudo numeric(12,2), deduz_salvado boolean,
  vlr_salvado numeric(12,2), vlr_premio numeric(12,2), id_cobweb integer);

create table if not exists sinimobcob_outro(id_outro integer primary key autoincrement,
  id_sinistro integer, id_cobertura integer,
  id_seguradora integer, data_ini_vig date, data_fim_vig date, apolice varchar(60), vlr_lmi numeric(12,2),
  vlr_franquia numeric(12,2), perc_franquia numeric(12,2), id_outweb integer);

create table if not exists causamob(id_causa integer, nm_causa varchar, PRIMARY KEY(id_causa ASC));

create table if not exists textos(id_texto integer, nm_texto varchar, PRIMARY KEY(id_texto ASC));

create table if not exists sinitexto(id_sinistro integer, id_texto integer, resposta text,
  PRIMARY KEY(id_sinistro,id_texto ASC));

create table if not exists textomob(id_texto integer, id_mobile integer, nm_mobile text,
  ordem smallint, resposta_def text, PRIMARY KEY(id_texto,id_mobile ASC));

create table if not exists assunto(id_assunto integer, nm_assunto varchar(60), PRIMARY KEY(id_assunto));

create table if not exists comunicador(id_comunicador integer primary key autoincrement,
  id_sinistro integer, resposta text, data_mov date, hora_mov time,
  id_assunto integer, status_com char(1), id_usuario integer, env_ana boolean, env_cor boolean, env_reg boolean,
  env_res boolean, env_rev boolean, env_seg boolean);

create table if not exists textomob_causa(id_texto integer, id_mobile integer,
  id_causa integer, PRIMARY KEY(id_texto,id_mobile,id_causa ASC));

create table if not exists sinitextomob(id_sinistro integer, id_texto integer,
  id_mobile integer, resposta text, PRIMARY KEY(id_sinistro,id_texto,id_mobile));

create table if not exists segrisco(id_seguradora integer, id_risco integer, nm_risco varchar,
  forma_risco char(2), obriga_risco char(1), lista_risco varchar, PRIMARY KEY(id_seguradora,id_risco));

create table if not exists sinirisco(id_sinistro integer, id_risco integer, estado boolean,
  complem varchar(75), id_seguradora integer, PRIMARY KEY(id_sinistro,id_risco));

create table if not exists tipoconta(id_tipoconta integer, nm_tipoconta varchar(110),
  PRIMARY KEY(id_tipoconta));

create table if not exists formapag_tipoconta(id_seguradora integer, id_tipoconta integer, id_formapag integer,
  PRIMARY KEY(id_seguradora,id_tipoconta,id_formapag));

create table if not exists prod_questao(id_prodques integer not null, nm_prodques varchar(100),
  PRIMARY KEY(id_prodques));

create table if not exists prod_questao_grupo
  (id_prodques integer not null, id_grupoper integer not null,
   nm_grupoper varchar(100), PRIMARY KEY(id_grupoper));

create table if not exists segproduto_prod_questao
  (id_seguradora integer not null, id_produto integer not null,
   id_prodques integer, PRIMARY KEY(id_seguradora,id_produto,id_prodques));

create table if not exists prod_questao_per
  (id_perprod integer not null, nm_perprod varchar(300), id_prodques integer,
   comenta boolean DEFAULT false, nomcpf boolean DEFAULT false, ordem smallint DEFAULT 0,
   funcao varchar(50), id_perlink integer, id_reslink integer,
   id_grupoper integer, resposta_ref varchar(20), PRIMARY KEY(id_perprod));

create table if not exists prod_questao_res(
  id_resprod integer not null, nm_resprod varchar(200), id_prodques integer,
  id_perprod integer, res_default boolean DEFAULT false, PRIMARY KEY(id_resprod));

create table if not exists sini_prod
  (id_sinistro integer, id_resprod integer, nm_terce varchar(100),
   cpf_terce varchar(20), complemento text, id_sinicomple integer primary key autoincrement,
   id_perprod integer);

create table if not exists formapag(id_formapag integer, nm_formapag varchar(110),
  PRIMARY KEY(id_formapag));

create table if not exists seguradora_formapag(id_seguradora integer, id_formapag integer,
  PRIMARY KEY(id_seguradora,id_formapag));

create table if not exists seguradora(id_seguradora integer, nm_seguradora varchar(100), apelido varchar(50),
  avalia_segura boolean, obriga_ident_despesa boolean, PRIMARY KEY(id_seguradora));

create table if not exists sinibenfe(id_benfeweb integer, id_sinistro integer, id_benfeito smallint, construcao text,
  id_ocupacao integer, area numeric(12,2), idade numeric(12,2), danos boolean, nm_benfeito varchar(70),
  id_estrutura integer, id_parede integer, id_tipocobertura integer, id_esquadria integer, tipo_bene char(3),
  marca varchar(20), modelo varchar(20), nro_serie varchar(25), chassi varchar(25),
  ano char(4), placa varchar(10), total_km numeric(12,2), item_apolice char(5), reforma char(1),
  tipo_loc_bene char(1), tipo_ocupa_bene char(1), tipo_loc_consta char(1), justifica_tipo text,
  cor varchar(20), coord_lat varchar(15), coord_long varchar(15), id_cobertura integer,
  id_benmaq integer, id_bemmob integer, vlr_declarado numeric(12,2) DEFAULT 0, valor_is numeric(12,2),
  obs_benfe varchar(200), id_causa integer, id_dano integer, operador_habilitado boolean DEFAULT false,
  exclusivo_agricula boolean DEFAULT false, locacao boolean DEFAULT false, financiado boolean DEFAULT false,
  confere_apolice char(1),
  id_sinibenfe integer primary key autoincrement);

create table if not exists sinistro_maquina(id_sinistro integer, id_itemmaq integer, descricao varchar(200),
  confere boolean, complemento varchar(200), id_maquina integer primary key autoincrement, id_benmaq integer);

create table if not exists esquadria(id_esquadria integer, nm_esquadria varchar(50), PRIMARY KEY(id_esquadria));

create table if not exists tipocobertura(id_tipocobertura integer, nm_tipocobertura varchar(50),
  PRIMARY KEY(id_tipocobertura));

create table if not exists parede(id_parede integer, nm_parede varchar(50), PRIMARY KEY(id_parede));

create table if not exists estrutura(id_estrutura integer, nm_estrutura varchar(50), PRIMARY KEY(id_estrutura));

create table if not exists despesa(id_despesa integer, nm_despesa varchar(90), id_unimed char(3),
  tipo char(1), PRIMARY KEY(id_despesa));

create table if not exists despesa_reg(id_reguladora integer, id_despesa integer, id_seguradora integer, id_sucursal integer,
  vlr_uni numeric(12,2), limite_ini numeric(12,2), limite_fim numeric(12,2),
  qtde_ini numeric(12,2), qtde_fim numeric(12,2));

create table if not exists ocupacao(id_ocupacao integer, nm_ocupacao varchar(50),
  ativo boolean, PRIMARY KEY(id_ocupacao));

create table if not exists nacionalidade(id_nacionalidade integer, nm_nacionalidade varchar(50),
  PRIMARY KEY(id_nacionalidade));

create table if not exists estado_civil(id_civil integer, nm_civil varchar(50), PRIMARY KEY(id_civil));

create table if not exists sinistro_apolice(
  id_apolice integer primary key autoincrement,
  id_sinistro integer,
  id_item integer,
  descricao varchar(200),
  confere boolean,
  complemento varchar(200),
  id_estado char(2),
  id_cidade integer,
  id_estado_ori char(2), id_cidade_ori integer);

create table if not exists sinicobbeni(id_beneficio integer primary key autoincrement,
  id_sinistro integer, id_cobertura integer, id_benfeito integer,
  quem varchar(50), banco varchar(60), agencia varchar(60), conta varchar(60), nm_beneficiario varchar(120),
  cpf_beneficiario varchar(20), tip_ben char(1), id_banco integer, tipo_doc char(1), id_formapag integer,
  id_tipoconta integer, digage varchar(3), digconta varchar(3), id_beneweb integer, nota_ava smallint);
`;

/** Colunas adicionadas depois que `apolice_item`/etc. já podem existir em bancos instalados. */
async function aplicarMigracoes(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const colunas = await db.getAllAsync<{ name: string }>("pragma table_info('apolice_item')");
  if (!colunas.some((c) => c.name === 'ordem_item')) {
    await db.execAsync('alter table apolice_item add column ordem_item integer');
  }

  // Conserta colunas boolean já importadas com o bug de vir como texto "t"/"f" ou "true"/"false"
  // (ver `n()` em importLogin.ts) — idempotente, seguro rodar em todo boot.
  await db.execAsync(`
    update apolice_item set conferencia = case conferencia when 't' then 1 when 'f' then 0 else conferencia end;
    update maquina_item set conferencia = case conferencia when 't' then 1 when 'f' then 0 else conferencia end;
    update ocupacao set ativo = case ativo when 'true' then 1 when 'false' then 0 when 't' then 1 when 'f' then 0 else ativo end;
  `);
}

export async function inicializarBancoLocal(): Promise<void> {
  const db = await getDb();
  await db.execAsync(CREATE_TABLES_SQL);
  await aplicarMigracoes(db);

  const configRow = await db.getFirstAsync<{ count: number }>(
    'select count(*) as count from config',
  );
  if (!configRow || configRow.count === 0) {
    await db.runAsync('insert into config(url_server) values (?)', [DEFAULT_SERVER_URL]);
  }
}
