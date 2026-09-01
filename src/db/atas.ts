import { getDb } from './client';
import { buscarRelato } from './relato';
import {
  paraDataBR,
  paraDataPorExtenso,
  paraHtmlMultilinha,
  digitosParaVariaveis,
  substituirVariaveisAta,
  paginaTemConteudo,
  removerPaginasVazias,
  aplicarMargemPagina,
} from '../utils/atasTemplate';

export interface AtaDisponivel {
  id_modata: number;
  id_documento: number | null;
  nome: string;
  simbolo: string;
  assinada: boolean;
  temArquivo: boolean;
}

interface SinistroBaseAta {
  id_sinistro: number;
  id_seguradora: number | null;
  id_produto: number | null;
  tipo_doc: string | null;
}

async function buscarBaseSinistro(idSinistro: number): Promise<SinistroBaseAta | null> {
  const db = await getDb();
  return db.getFirstAsync<SinistroBaseAta>(
    'select id_sinistro, id_seguradora, id_produto, tipo_doc from sinimob where id_sinistro = ?',
    [idSinistro],
  );
}

/**
 * Porta de InicializaBotoes (gera_config_pdf.js): lista os modelos de ata disponíveis para a
 * seguradora/produto do sinistro.
 *
 * Fallback produto -> seguradora: quando não há nenhum modelo associado ao produto do sinistro,
 * valem os modelos da seguradora (qualquer produto). É a mesma regra que buscarLayoutsAta já
 * aplica pras páginas de layout — sem ela, um sinistro cujo produto não foi cadastrado em
 * ataseg_doc ficava sem nenhuma ata pra imprimir ou assinar.
 */
export async function listarAtasDisponiveis(idSinistro: number): Promise<AtaDisponivel[]> {
  const base = await buscarBaseSinistro(idSinistro);
  if (!base || !base.id_seguradora) return [];
  const db = await getDb();

  async function buscar(filtrarPorProduto: boolean) {
    return db.getAllAsync<{
      id_modata: number;
      id_documento: number | null;
      nm_modata: string;
      nome_simple: string | null;
      simbolo: string | null;
      chave_sign: string | null;
      total_arquivos: number;
    }>(
      `select distinct ad.id_modata, ad.id_documento, ma.nm_modata, ma.nome_simple, ma.simbolo,
         sd.chave_sign,
         (select count(*) from sinidocpdf sp where sp.id_sinistro = ? and sp.id_documento = ad.id_documento) as total_arquivos
       from ataseg_doc ad
       inner join modelo_atas ma on ma.id_modata = ad.id_modata
       left join sinidoc sd on sd.id_sinistro = ? and sd.id_documento = ad.id_documento
       where ad.id_seguradora = ?${filtrarPorProduto ? ' and (ad.id_produto = ? or ad.id_produto is null)' : ''}
       order by ad.id_modata`,
      filtrarPorProduto
        ? [idSinistro, idSinistro, base!.id_seguradora, base!.id_produto]
        : [idSinistro, idSinistro, base!.id_seguradora],
    );
  }

  const doProduto = await buscar(true);
  const linhas = doProduto.length > 0 ? doProduto : await buscar(false);

  return linhas.map((l) => ({
    id_modata: l.id_modata,
    id_documento: l.id_documento,
    nome: l.nome_simple || l.nm_modata,
    simbolo: l.simbolo || '',
    assinada: !!l.chave_sign,
    temArquivo: l.total_arquivos > 0,
  }));
}

/** Mesmo fallback produto -> seguradora de listarAtasDisponiveis, senão a ata listada não resolveria o documento. */
export async function resolverDocumentoDaAta(idSinistro: number, idModata: number): Promise<number | null> {
  const base = await buscarBaseSinistro(idSinistro);
  if (!base || !base.id_seguradora) return null;
  const db = await getDb();

  const doProduto = await db.getFirstAsync<{ id_documento: number | null }>(
    `select id_documento from ataseg_doc
     where id_seguradora = ? and (id_produto = ? or id_produto is null) and id_modata = ?
     limit 1`,
    [base.id_seguradora, base.id_produto, idModata],
  );
  if (doProduto) return doProduto.id_documento ?? null;

  const daSeguradora = await db.getFirstAsync<{ id_documento: number | null }>(
    'select id_documento from ataseg_doc where id_seguradora = ? and id_modata = ? limit 1',
    [base.id_seguradora, idModata],
  );
  return daSeguradora?.id_documento ?? null;
}

/**
 * Porta de InicializaLayoutAta (gera_config_pdf.js): resolve as páginas de layout HTML do modelo,
 * com fallback produto-específico -> genérico e, dentro de cada um, tipo de pessoa exato -> 'O'
 * (o 'O' é usado só quando não existe uma página específica para o tipo de pessoa do segurado,
 * nunca somada a ela — evita duplicar página quando o cadastro tem as duas linhas).
 */
export async function buscarLayoutsAta(idSinistro: number, idModata: number): Promise<string[]> {
  const base = await buscarBaseSinistro(idSinistro);
  if (!base || !base.id_seguradora) return [];
  const db = await getDb();
  const tipoDoc = base.tipo_doc || 'F';
  const idSeguradora = base.id_seguradora;
  const idProduto = base.id_produto;

  async function especifico(tipPes: string): Promise<string[]> {
    const linhas = await db.getAllAsync<{ layout: string }>(
      `select ms.layout
       from modelo_ataseg_prod mp
       inner join modelo_ataseg ms on ms.id_seqata = mp.id_seqata
       where mp.id_seguradora = ? and mp.id_produto = ? and ms.id_modata = ? and ms.tip_pes = ?
       order by ms.id_seqata`,
      [idSeguradora, idProduto, idModata, tipPes],
    );
    return linhas.map((l) => l.layout);
  }

  async function generico(tipPes: string): Promise<string[]> {
    const linhas = await db.getAllAsync<{ layout: string }>(
      `select layout from modelo_ataseg
       where id_seguradora = ? and id_modata = ? and produto = 'N' and tip_pes = ?
       order by id_seqata`,
      [idSeguradora, idModata, tipPes],
    );
    return linhas.map((l) => l.layout);
  }

  const especificoExato = await especifico(tipoDoc);
  if (especificoExato.length > 0) return especificoExato;
  const especificoGenerico = await especifico('O');
  if (especificoGenerico.length > 0) return especificoGenerico;

  const genericoExato = await generico(tipoDoc);
  if (genericoExato.length > 0) return genericoExato;
  return generico('O');
}

/** Se não há nenhuma linha de layout cadastrada para essa seguradora/produto/tipo de pessoa, a ata não pode ser gerada nem assinada. */
export async function existeLayoutAta(idSinistro: number, idModata: number): Promise<boolean> {
  const paginas = await buscarLayoutsAta(idSinistro, idModata);
  return paginas.length > 0;
}

interface LinhaSinimobAta {
  nm_segurado: string | null;
  nro_sinistro: string | null;
  nroreg_sinistro: string | null;
  apolice: string | null;
  proposta_seg: string | null;
  datasol: string | null;
  data_ocor: string | null;
  hora_ocor: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  nm_cidade: string | null;
  id_estado: string | null;
  fone: string | null;
  celular: string | null;
  contatoseg: string | null;
  vlr_estimativa: number | null;
  data_aviso: string | null;
  situacao: string | null;
  id_preserva: string | null;
  nm_regulador: string | null;
  fonereg: string | null;
  celureg: string | null;
  atendente: string | null;
  atendente_ass: string | null;
  emailseg: string | null;
  tipo_doc: string | null;
  cpf: string | null;
  rgseg: string | null;
  nm_sucursal: string | null;
  nm_corretora: string | null;
  fonecor: string | null;
  emailcor: string | null;
  data_vistoria: string | null;
  datavig_ini: string | null;
  datavig_fim: string | null;
  outro_seguro: string | null;
  nm_causa: string | null;
  nm_causa_abe: string | null;
  nm_relacaoseg: string | null;
  nm_relacaoseg_ass: string | null;
  nm_seguradora: string | null;
  nm_produto: string | null;
}

interface LinhaPlanilhaTermo {
  id_cobertura: number;
  nm_cobertura: string | null;
  tipo_cob: string | null;
  nm_planilha_item: string | null;
  grupoitem: string | null;
  nm_planilha: string | null;
  // qtde/vlr_uni_rec/vlr_tot_rec são gravados como texto formatado em BR ("1.250,00", vírgula
  // decimal), não número puro — ver paraTextoValor em planilha.tsx — então chegam aqui como string.
  qtde: string | number | null;
  vlr_uni_rec: string | number | null;
  vlr_tot_rec: string | number | null;
  vlr_franquia: number | null;
  perc_franquia: number | null;
}

const COLUNAS_TERMO_PREJUIZO = 5;

/** Espelha paraNumero (planilha.tsx): converte "1.250,00" (ou já number) num número de verdade. */
function paraNumeroTermoPrejuizo(v: string | number | null): number {
  if (typeof v === 'number') return Number.isNaN(v) ? 0 : v;
  const limpo = (v ?? '').toString().replace(/[^\d,-]/g, '').replace(',', '.');
  const n = Number(limpo || '0');
  return Number.isNaN(n) ? 0 : n;
}

function formatarValorTermoPrejuizo(v: number | null): string {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function abrirTabelaCoberturaTermo(nomeCobertura: string): string {
  return (
    '<table border="1" style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:12px;margin-bottom:6px;">' +
    `<tr><td colspan="${COLUNAS_TERMO_PREJUIZO}" style="background-color:#cdcdcd;text-align:center;"><b>${nomeCobertura}</b></td></tr>` +
    '<tr>' +
    '<td style="background-color:#6495ED;color:#fff;text-align:center;width:40px;">Item</td>' +
    '<td style="background-color:#6495ED;color:#fff;text-align:center;">Descrição</td>' +
    '<td style="background-color:#6495ED;color:#fff;text-align:center;width:70px;">Quantidade</td>' +
    '<td style="background-color:#6495ED;color:#fff;text-align:center;width:85px;">Valor Unitário(R$)</td>' +
    '<td style="background-color:#6495ED;color:#fff;text-align:center;width:90px;">Valor Fixado(R$)</td>' +
    '</tr>'
  );
}

function linhaSubtotalGrupoTermo(nomeItem: string, total: number): string {
  return (
    `<tr><td colspan="2" style="background-color:#F5F6CE;">&nbsp;&nbsp;&nbsp;${nomeItem}</td>` +
    `<td colspan="3" style="background-color:#F5F6CE;text-align:right;"><b>${formatarValorTermoPrejuizo(total)}&nbsp;</b></td></tr>`
  );
}

function fecharTabelaCoberturaTermo(total: number, franquia: { perc: number; valor: number }): string {
  return (
    `<tr><td colspan="4" style="text-align:right;">Total Fixado (R$)</td>` +
    `<td style="background-color:#cacaca;text-align:right;">${formatarValorTermoPrejuizo(total)}&nbsp;</td></tr>` +
    '<tr><td colspan="3" style="color:red;border-color:black;"><b>Será deduzida a franquia de ... % do prejuízo com mínimo de:</b></td>' +
    `<td style="background-color:#cacaca;text-align:right;color:red;border-color:black;"><b>${franquia.perc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} %</b></td>` +
    `<td style="background-color:#cacaca;text-align:right;color:red;border-color:black;"><b>${formatarValorTermoPrejuizo(franquia.valor)}</b></td></tr>` +
    '</table>'
  );
}

/**
 * Porta de CarregandoCoberturasPla (gera_config_pdf.js): monta a tabela do Termo de Fixação de
 * Prejuízo — agrupada por cobertura (barra cinza com nome+tipo) e por item da planilha (subtotal
 * em amarelo claro), com o total fixado e a linha vermelha de franquia ao fechar cada cobertura.
 * idite/idsub (numeração "1.1", "1.2", "2.1"...) são contadores globais que avançam ao longo de
 * toda a planilha, exatamente como no legado — não reiniciam a cada cobertura.
 * Usa <table> em vez das divs com float+largura fixa do legado (mesmo motivo do bloco de Outros
 * Seguros: o container real da ata é mais estreito que o previsto, e tabela se ajusta sozinha).
 */
async function montarPlanilhaTermoPrejuizo(db: Awaited<ReturnType<typeof getDb>>, idSinistro: number): Promise<string[]> {
  const planilha = await db.getAllAsync<LinhaPlanilhaTermo>(
    `select pa.id_cobertura, cb.nm_cobertura, cb.tipo_cob, pa.nm_planilha_item, pa.grupoitem,
       pa.nm_planilha, pa.qtde, pa.vlr_uni_rec, pa.vlr_tot_rec, sb.vlr_franquia, sb.perc_franquia
     from planilha_apuracao pa
     left join cobertura cb on cb.id_cobertura = pa.id_cobertura
     left join sinimobcob sb on sb.id_sinistro = pa.id_sinistro and sb.id_cobertura = pa.id_cobertura
     where pa.id_sinistro = ?
     order by pa.id_cobertura, pa.grupoitem, pa.id_planilha`,
    [idSinistro],
  );
  if (planilha.length === 0) return [];

  // Um bloco por cobertura (tabela completa, já fechada com total+franquia) — cada cobertura
  // imprime como um termo à parte, então a quebra de página é aplicada por bloco no final, em vez
  // de um marcador solto entre eles: presa na própria tabela (elemento com conteúdo real), não
  // depende do container ao redor de <PLANILHA_BENS> respeitar um <div> vazio como quebra.
  const blocosCobertura: string[] = [];
  let blocoAtual = '';
  let idite = 0;
  let idsub = 0;
  let cobAnterior: number | null = null;
  let itemAnterior = '';
  let grupoAnterior = '';
  let totalGrupo = 0;
  let totalCobertura = 0;
  let franquiaCobertura = { perc: 0, valor: 0 };

  for (let i = 0; i < planilha.length; i++) {
    const linha = planilha[i];
    const itemAtual = linha.nm_planilha_item ?? '';
    const grupoAtual = linha.grupoitem ?? '';
    const qtdeAtual = paraNumeroTermoPrejuizo(linha.qtde);
    const vlrUniAtual = paraNumeroTermoPrejuizo(linha.vlr_uni_rec);
    const totrecAtual = paraNumeroTermoPrejuizo(linha.vlr_tot_rec);

    if (i > 0 && itemAtual !== itemAnterior) {
      blocoAtual += linhaSubtotalGrupoTermo(itemAnterior, totalGrupo);
      totalGrupo = 0;
    }
    if (i > 0 && linha.id_cobertura !== cobAnterior) {
      blocoAtual += fecharTabelaCoberturaTermo(totalCobertura, franquiaCobertura);
      blocosCobertura.push(blocoAtual);
      blocoAtual = '';
      totalCobertura = 0;
    }

    totalCobertura += totrecAtual;
    totalGrupo += totrecAtual;
    franquiaCobertura = { perc: linha.perc_franquia ?? 0, valor: linha.vlr_franquia ?? 0 };

    if (grupoAtual !== grupoAnterior) {
      idite++;
      idsub = 0;
    }
    idsub++;

    if (i === 0 || linha.id_cobertura !== cobAnterior) {
      blocoAtual += abrirTabelaCoberturaTermo(`${linha.nm_cobertura ?? ''} - ${linha.tipo_cob ?? ''}`);
    }

    blocoAtual +=
      `<tr><td style="text-align:center;">${idite}.${idsub}</td>` +
      `<td>${linha.nm_planilha ?? ''}</td>` +
      `<td style="text-align:right;">${qtdeAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}&nbsp;</td>` +
      `<td style="text-align:right;">${formatarValorTermoPrejuizo(vlrUniAtual)}&nbsp;</td>` +
      `<td style="text-align:right;">${formatarValorTermoPrejuizo(totrecAtual)}&nbsp;</td></tr>`;

    itemAnterior = itemAtual;
    grupoAnterior = grupoAtual;
    cobAnterior = linha.id_cobertura;
  }

  blocoAtual += linhaSubtotalGrupoTermo(itemAnterior, totalGrupo);
  blocoAtual += fecharTabelaCoberturaTermo(totalCobertura, franquiaCobertura);
  blocosCobertura.push(blocoAtual);

  return blocosCobertura;
}

/**
 * Porta de atualizaLayoutAta (gera_config_pdf.js): monta o mapa `<TAG>` -> valor com os dados do
 * sinistro, benfeitoria, planilha, beneficiário e documentos. Tags sem fonte de dados local
 * conhecida (respostas de questionário dinâmico, notas de avaliação, logos) ficam de fora do mapa
 * e permanecem literais no HTML gerado.
 *
 * `blocosPlanilha` (um bloco de tabela por cobertura do Termo de Prejuízo) vem separado de
 * `variaveis['<PLANILHA_BENS>']` (que já traz tudo junto, como fallback) porque cada cobertura
 * precisa imprimir como página à parte — repetindo a página inteira (cabeçalho+rodapé do modelo),
 * não só a tabela — e só gerarHtmlAta tem acesso ao HTML bruto da página pra fazer essa repetição.
 */
export async function montarVariaveisAta(
  idSinistro: number,
  assinaturaBase64: string,
): Promise<{ variaveis: Record<string, string>; blocosPlanilha: string[] }> {
  const db = await getDb();

  // <VLR_ESTIMATIVA> soma sinimobcob.vlr_cob_estima (igual a CarregandoVariaveisPrejuizo em
  // gera_config_pdf.js) em vez de ler sinimob.vlr_prejuizo — essa coluna nunca é gravada pelo
  // app, só vem populada em registros importados do servidor.
  // <REGULADOR> é o nome do vistoriador logado (usuarioff.nm_usuario), ligado via id_regulador —
  // não confundir com <ATENDENTE>, que é quem recebeu a visita no local.
  const s = await db.getFirstAsync<LinhaSinimobAta>(
    `select mb.nm_segurado, mb.nro_sinistro, mb.nroreg_sinistro, mb.apolice, mb.proposta_seg,
       mb.datasol, mb.data_ocor, mb.hora_ocor, mb.endereco, mb.bairro, mb.cep, ci.nm_cidade, mb.id_estado,
       mb.fone, mb.celular, mb.contatoseg,
       (select coalesce(sum(cast(sc.vlr_cob_estima as real)), 0) from sinimobcob sc where sc.id_sinistro = mb.id_sinistro) as vlr_estimativa,
       mb.data_aviso, mb.situacao, mb.id_preserva, us.nm_usuario as nm_regulador, us.fonereg, us.celureg,
       mb.atendente, mb.atendente_ass, mb.emailseg, mb.tipo_doc, mb.cpf, mb.rgseg,
       mb.nm_sucursal, mb.nm_corretora, mb.fonecor, mb.emailcor, mb.data_vistoria,
       mb.datavig_ini, mb.datavig_fim, mb.outro_seguro,
       ca.nm_causa, cb.nm_causa as nm_causa_abe,
       rl.nm_relacaoseg, rla.nm_relacaoseg as nm_relacaoseg_ass,
       se.nm_seguradora, mb.nm_produto
     from sinimob mb
     left join cidade ci on ci.id_cidade = mb.id_cidade
     left join causamob ca on ca.id_causa = mb.id_causa
     left join causamob cb on cb.id_causa = mb.id_causa_abe
     left join relacaoseg rl on rl.id_relacaoseg = mb.id_relacaoseg
     left join relacaoseg rla on rla.id_relacaoseg = mb.id_relacaoseg_ass
     left join seguradora se on se.id_seguradora = mb.id_seguradora
     left join usuarioff us on us.id_regulador = mb.id_regulador
     where mb.id_sinistro = ?`,
    [idSinistro],
  );
  if (!s) return { variaveis: {}, blocosPlanilha: [] };

  const tipoPessoa: 'F' | 'J' = s.tipo_doc === 'J' ? 'J' : 'F';

  const variaveis: Record<string, string> = {
    '<SEGURADO>': s.nm_segurado ?? '',
    '<NROSINISTRO>': s.nro_sinistro ?? '',
    '<NROREGSINISTRO>': s.nroreg_sinistro ?? '',
    '<APOLICE>': s.apolice ?? '',
    '<PROPOSTA_SEG>': s.proposta_seg ?? '',
    '<DATASOL>': paraDataBR(s.datasol),
    '<DATAOCOR>': paraDataBR(s.data_ocor),
    '<HORAOCOR>': s.hora_ocor ?? '',
    '<ENDERECOSEG>': s.endereco ?? '',
    '<BAIRROSEG>': s.bairro ?? '',
    '<CEPSEG>': s.cep ?? '',
    '<CIDADESEG>': s.nm_cidade ?? '',
    '<UFSEG>': s.id_estado ?? '',
    '<LOCALSINI>': s.nm_cidade ?? '',
    '<LOCALSINIEDATA>': s.nm_cidade && s.data_vistoria ? `${s.nm_cidade}, ${paraDataPorExtenso(s.data_vistoria)}.` : '',
    '<FONESEG>': s.fone ?? '',
    '<CELULARSEG>': s.celular ?? '',
    '<CONTATOSEG>': s.contatoseg ?? '',
    '<VLR_ESTIMATIVA>': s.vlr_estimativa != null ? s.vlr_estimativa.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
    '<DATAAVISO>': paraDataBR(s.data_aviso),
    '<REGULADOR>': s.nm_regulador ?? '',
    '<FONEREG>': s.fonereg ?? '',
    '<CELUREG>': s.celureg ?? '',
    '<ATENDENTE>': s.atendente ?? '',
    '<ATENDENTE_ASS>': s.atendente_ass ?? '',
    '<EMAILSEG>': s.emailseg ?? '',
    '<CPFSEG>': s.cpf ?? '',
    '<RGSEGURADO>': s.rgseg ?? '',
    '<SUCURSAL>': s.nm_sucursal ?? '',
    '<CORRETORA>': s.nm_corretora ?? '',
    '<FONECOR>': s.fonecor ?? '',
    '<EMAILCOR>': s.emailcor ?? '',
    '<DATAVISTO>': paraDataBR(s.data_vistoria),
    '<DATAVIG_INI>': paraDataBR(s.datavig_ini),
    '<DATAVIG_FIN>': paraDataBR(s.datavig_fim),
    '<CAUSA>': s.nm_causa ?? '',
    '<CAUSAABE>': s.nm_causa_abe ?? '',
    '<RELACAOSEG>': s.nm_relacaoseg ?? '',
    '<RELACAOSEG_ASS>': s.nm_relacaoseg_ass ?? '',
    '<SEGURADORA>': s.nm_seguradora ?? '',
    '<PRODUTO>': s.nm_produto ?? '',
    '<DATAATUAL>': paraDataBR(new Date().toISOString().slice(0, 10)),
    '<ASSINATURA_ATA>': assinaturaBase64 ?? '',
    ...digitosParaVariaveis(s.cpf ?? '', tipoPessoa),
  };

  if (s.outro_seguro === 'S') {
    variaveis['<OUTROSIM>'] = 'X';
    variaveis['<OUTRONAO>'] = ' ';
  } else {
    variaveis['<OUTROSIM>'] = ' ';
    variaveis['<OUTRONAO>'] = 'X';
  }

  // Bens preservados (id_preserva 'S'/'N'/'A') vira 3 checkboxes no HTML, igual ao legado
  // (CarregandoVariaveis em gera_config_pdf.js: bempresesim/nao/parte_view).
  variaveis['<BEMPRESE_SIM>'] = s.id_preserva === 'S' ? 'X' : '';
  variaveis['<BEMPRESE_NAO>'] = s.id_preserva === 'N' ? 'X' : '';
  variaveis['<BEMPRESE_PARTE>'] = s.id_preserva === 'A' ? 'X' : '';
  const outrosSeguros = await db.getAllAsync<{
    apolice: string | null;
    nm_seguradora: string | null;
    data_ini_vig: string | null;
    data_fim_vig: string | null;
    vlr_lmi: number | null;
    vlr_franquia: number | null;
    perc_franquia: number | null;
  }>(
    `select so.apolice, se.nm_seguradora, so.data_ini_vig, so.data_fim_vig, so.vlr_lmi, so.vlr_franquia, so.perc_franquia
     from sinimobcob_outro so
     left join seguradora se on se.id_seguradora = so.id_seguradora
     where so.id_sinistro = ?
     order by so.id_outro`,
    [idSinistro],
  );
  variaveis['<SEGURADORAOUT>'] = outrosSeguros[0]?.nm_seguradora ?? '';
  variaveis['<APOLICEOUT>'] = outrosSeguros[0]?.apolice ?? '';

  // <LISTA_OUTROSEG>/<STATUS_OUTROSEG>: bloco por seguro cadastrado, mesmos dados de
  // PreencheOutrosSeg (gera_config_pdf.js) — não confundir com <SEGURADORAOUT>/<APOLICEOUT> acima,
  // que só mostram o primeiro registro (usados num modelo de ata diferente). Usa <table> em vez das
  // divs com float+largura fixa (975px) do legado: aquele layout pressupõe a página inteira como
  // container e estourava a largura real (~730px) do container desse modelo, quebrando o resto da
  // ata. Largura fixa 730px (não 100%) porque o próprio container no modelo tem `width:735` sem
  // unidade — CSS inválido que o motor de renderização ignora, fazendo o div encolher pro conteúdo;
  // width:100% relativo a esse pai também encolhia, então a tabela precisa do valor absoluto.
  const formatarValorOutroSeg = (v: number | null) =>
    v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  variaveis['<STATUS_OUTROSEG>'] = outrosSeguros.length > 0 ? 'Sim' : 'Não';
  variaveis['<LISTA_OUTROSEG>'] = outrosSeguros
    .map((o) => {
      const vigencia = `${paraDataBR(o.data_ini_vig)} à ${paraDataBR(o.data_fim_vig)}`;
      return (
        '<table border="1" style="width:730px;border-collapse:collapse;font-family:sans-serif;font-size:12px;margin-bottom:4px;">' +
        '<tr>' +
        '<td><b>Apólice</b></td><td><b>Seguradora</b></td><td><b>Vigência</b></td>' +
        '</tr><tr>' +
        `<td>${o.apolice ?? ''}</td><td>${o.nm_seguradora ?? ''}</td><td style="text-align:center">${vigencia}</td>` +
        '</tr><tr>' +
        '<td><b>Franquia R$</b></td><td><b>Franquia %</b></td><td><b>L.M.I.</b></td>' +
        '</tr><tr>' +
        `<td style="text-align:right">${formatarValorOutroSeg(o.vlr_franquia)}</td>` +
        `<td style="text-align:right">${formatarValorOutroSeg(o.perc_franquia)}</td>` +
        `<td style="text-align:right">${formatarValorOutroSeg(o.vlr_lmi)}</td>` +
        '</tr></table>'
      );
    })
    .join('');

  const relato = await buscarRelato(idSinistro, 4);
  variaveis['<RELATO_SEGURADO>'] = relato.subtextos
    .map((sub) => sub.resposta)
    .filter(Boolean)
    .map((resposta) => paraHtmlMultilinha(resposta))
    .join('<br>');

  // <VISTORIA> é o texto de "Constatações do regulador" (tela `parecer`, id_texto=5) — igual ao
  // legado (relvistoria_view, sinitextomob id_texto=5). Não confundir com <DATAVISTO>, a data.
  const constatacoes = await buscarRelato(idSinistro, 5);
  variaveis['<VISTORIA>'] = constatacoes.subtextos
    .map((sub) => sub.resposta)
    .filter(Boolean)
    .map((resposta) => paraHtmlMultilinha(resposta))
    .join('<br>');

  const benfeitoria = await db.getFirstAsync<{
    construcao: string | null;
    id_ocupacao_nome: string | null;
    area: number | null;
    idade: number | null;
    danos: number | null;
    nm_benfeito: string | null;
    item_apolice: string | null;
    coord_lat: string | null;
    coord_long: string | null;
    marca: string | null;
    modelo: string | null;
    nro_serie: string | null;
    chassi: string | null;
    ano: string | null;
    placa: string | null;
    total_km: number | null;
    cor: string | null;
  }>(
    `select sb.construcao, oc.nm_ocupacao as id_ocupacao_nome, sb.area, sb.idade, sb.danos, sb.nm_benfeito,
       sb.item_apolice, sb.coord_lat, sb.coord_long, sb.marca, sb.modelo, sb.nro_serie, sb.chassi,
       sb.ano, sb.placa, sb.total_km, sb.cor
     from sinibenfe sb
     left join ocupacao oc on oc.id_ocupacao = sb.id_ocupacao
     where sb.id_sinistro = ? order by sb.id_sinibenfe limit 1`,
    [idSinistro],
  );
  if (benfeitoria) {
    variaveis['<BEM_OBS>'] = benfeitoria.construcao ?? '';
    variaveis['<BEM_OCUPACAO>'] = benfeitoria.id_ocupacao_nome ?? '';
    variaveis['<BEM_AREA>'] = benfeitoria.area != null ? String(benfeitoria.area) : '';
    variaveis['<BEM_IDADE>'] = benfeitoria.idade != null ? String(benfeitoria.idade) : '';
    variaveis['<BEM_DANOS>'] = benfeitoria.danos ? 'Sim' : 'Não';
    variaveis['<BEM_NOME>'] = benfeitoria.nm_benfeito ?? '';
    variaveis['<BEM_APOLICE>'] = benfeitoria.item_apolice ?? '';
    variaveis['<BEM_LAT>'] = benfeitoria.coord_lat ?? '';
    variaveis['<BEM_LONG>'] = benfeitoria.coord_long ?? '';
    variaveis['<MAQ_OBS>'] = benfeitoria.construcao ?? '';
    variaveis['<MAQ_NOME>'] = benfeitoria.nm_benfeito ?? '';
    variaveis['<MAQ_MARCA>'] = benfeitoria.marca ?? '';
    variaveis['<MAQ_MODELO>'] = benfeitoria.modelo ?? '';
    variaveis['<MAQ_SERIE>'] = benfeitoria.nro_serie ?? '';
    variaveis['<MAQ_CHASSI>'] = benfeitoria.chassi ?? '';
    variaveis['<MAQ_ANO>'] = benfeitoria.ano ?? '';
    variaveis['<MAQ_PLACA>'] = benfeitoria.placa ?? '';
    variaveis['<MAQ_TOTAKM>'] = benfeitoria.total_km != null ? String(benfeitoria.total_km) : '';
    variaveis['<MAQ_ITEM>'] = benfeitoria.item_apolice ?? '';
    variaveis['<MAQ_COR>'] = benfeitoria.cor ?? '';
  }

  const beneficiario = await db.getFirstAsync<{
    nm_beneficiario: string | null;
    cpf_beneficiario: string | null;
    agencia: string | null;
    conta: string | null;
    digage: string | null;
    digconta: string | null;
    nm_banco: string | null;
    codigo: string | null;
  }>(
    `select sc.nm_beneficiario, sc.cpf_beneficiario, sc.agencia, sc.conta, sc.digage, sc.digconta,
       bc.nm_banco, bc.codigo
     from sinicobbeni sc
     left join bancos bc on bc.id_banco = sc.id_banco
     where sc.id_sinistro = ? limit 1`,
    [idSinistro],
  );
  if (beneficiario) {
    variaveis['<BENEFICIARIO>'] = beneficiario.nm_beneficiario ?? '';
    variaveis['<CPFBENEFICIARIO>'] = beneficiario.cpf_beneficiario ?? '';
    variaveis['<NOMEBANCO>'] = beneficiario.nm_banco ?? '';
    variaveis['<CODBANCO>'] = beneficiario.codigo ?? '';
    variaveis['<AGENCIA>'] = beneficiario.agencia ?? '';
    variaveis['<DIGAGENCIA>'] = beneficiario.digage ?? '';
    variaveis['<CONTA>'] = beneficiario.conta ?? '';
    variaveis['<DIGCONTA>'] = beneficiario.digconta ?? '';
  }

  const blocosPlanilha = await montarPlanilhaTermoPrejuizo(db, idSinistro);
  variaveis['<PLANILHA_BENS>'] = blocosPlanilha.join('');

  const docs = await db.getFirstAsync<{ solicitados: string | null; entregues: string | null; pendentes: string | null }>(
    `select
       (select group_concat(dc.nm_documento, ', ') from sinidoc sd inner join documentos dc on dc.id_documento = sd.id_documento
         where sd.id_sinistro = ? and sd.solicitado = 1) as solicitados,
       (select group_concat(dc.nm_documento, ', ') from sinidoc sd inner join documentos dc on dc.id_documento = sd.id_documento
         where sd.id_sinistro = ? and sd.solicitado = 1 and sd.data_entregue is not null) as entregues,
       (select group_concat(dc.nm_documento, ', ') from sinidoc sd inner join documentos dc on dc.id_documento = sd.id_documento
         where sd.id_sinistro = ? and sd.solicitado = 1 and sd.data_entregue is null) as pendentes`,
    [idSinistro, idSinistro, idSinistro],
  );
  variaveis['<DOCUMENTOS_SOLICITADOS>'] = docs?.solicitados ?? '';
  variaveis['<DOCUMENTOS_ENTREGUES>'] = docs?.entregues ?? '';
  variaveis['<DOCUMENTOS_PENDENTES>'] = docs?.pendentes ?? '';
  variaveis['<LISTA_DOCPENDENTE>'] = docs?.pendentes ?? '';

  // Porta de MontaRespostas (gera_config_pdf.js): respostas do questionário — uma linha em
  // sini_prod por pergunta respondida, marcando o `<RESPOn>` da opção escolhida (n=id_resprod) e
  // preenchendo `<NOMEn>`/`<CPFn>`/`<COMENTAn>` (n=id_perprod) com o que foi digitado a mais.
  const respostasQuestionario = await db.getAllAsync<{
    id_perprod: number;
    id_resprod: number;
    nm_terce: string | null;
    cpf_terce: string | null;
    complemento: string | null;
  }>('select id_perprod, id_resprod, nm_terce, cpf_terce, complemento from sini_prod where id_sinistro = ?', [
    idSinistro,
  ]);
  for (const resposta of respostasQuestionario) {
    variaveis[`<RESPO${resposta.id_resprod}>`] = ' X ';
    variaveis[`<NOME${resposta.id_perprod}>`] = resposta.nm_terce ?? '';
    variaveis[`<CPF${resposta.id_perprod}>`] = resposta.cpf_terce ?? '';
    variaveis[`<COMENTA${resposta.id_perprod}>`] = resposta.complemento ?? '';
  }

  return { variaveis, blocosPlanilha };
}

/**
 * Margem de página (cm) por id_modata (modelo_atas). O conteúdo desses modelos é alinhado à
 * esquerda por padrão — só alargar a página (`TAMANHOS_PAGINA_FIXOS` em atasTemplate.ts) empurra
 * toda a sobra pro lado direito; é o `body{margin}` de `aplicarMargemPagina` que efetivamente
 * empurra o conteúdo, então os dois têm que ser usados juntos e combinar (a largura fixa de cada
 * modelo já foi calculada somando a margem correspondente aqui).
 *
 * A Ata de Vistoria (id_modata=4) NÃO entra aqui: esse modelo tem elementos `position:fixed`
 * (cabeçalho/rodapé) e já declara seu próprio `@page{margin:5mm}`, e combinar isso com o
 * `body{margin}` injetado distorce o conteúdo (fica deslocado pra baixo/centro). Pra ela, só o
 * tamanho fixo (`TAMANHOS_PAGINA_FIXOS`), sem margem CSS, funciona direito.
 */
const MARGEM_CM_POR_MODATA: Record<number, number> = {
  1: 2.5, // Aviso de Sinistro
  2: 2, // Outros Seguros — conteúdo de 210mm (largura A4 cheia), 2cm de margem de cada lado
  3: 1.5, // Autorização de Crédito
};

/**
 * Gera o HTML final da ata, substituindo as variáveis em cada página candidata e descartando as
 * que ficam sem conteúdo real no corpo (ex.: página com só cabeçalho, quando o modelo tem mais de
 * uma linha de layout mas nem todas se aplicam ao caso).
 */
export async function gerarHtmlAta(idSinistro: number, idModata: number, assinaturaBase64: string): Promise<string | null> {
  const paginas = await buscarLayoutsAta(idSinistro, idModata);
  if (paginas.length === 0) return null;
  const { variaveis, blocosPlanilha } = await montarVariaveisAta(idSinistro, assinaturaBase64);

  // Termo de Fixação de Prejuízo com mais de uma cobertura: cada cobertura imprime como página à
  // parte, então a página que contém <PLANILHA_BENS> é repetida uma vez por cobertura (cabeçalho e
  // rodapé do modelo se repetem junto, só a tabela muda), com quebra de página entre as repetições.
  const paginasExpandidas =
    blocosPlanilha.length > 1
      ? paginas.flatMap((pagina) => {
          if (!pagina.includes('<PLANILHA_BENS>')) return [pagina];
          return blocosPlanilha.map((bloco, i) => {
            const paginaComUmaCobertura = pagina.split('<PLANILHA_BENS>').join(bloco);
            return i < blocosPlanilha.length - 1
              ? paginaComUmaCobertura + '<div style="page-break-after: always;">&nbsp</div>'
              : paginaComUmaCobertura;
          });
        })
      : paginas;

  const paginasPreenchidas = paginasExpandidas
    .map((pagina) => substituirVariaveisAta(pagina, variaveis))
    .filter((paginaPronta) => paginaTemConteudo(paginaPronta));

  if (paginasPreenchidas.length === 0) return null;
  const htmlFinal = removerPaginasVazias(paginasPreenchidas.join(''));
  const margemCm = MARGEM_CM_POR_MODATA[idModata];
  return margemCm != null ? aplicarMargemPagina(htmlFinal, margemCm) : htmlFinal;
}

/** Porta da leitura de sinidoc.chave_sign em assinatura_atas_def.js: string truthy = já assinado. */
export async function buscarAssinaturaAta(idSinistro: number, idDocumento: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ chave_sign: string | null }>(
    'select chave_sign from sinidoc where id_sinistro = ? and id_documento = ?',
    [idSinistro, idDocumento],
  );
  return row?.chave_sign || null;
}

export async function salvarAssinaturaAta(idSinistro: number, idDocumento: number, assinaturaBase64: string): Promise<void> {
  const db = await getDb();
  const existe = await db.getFirstAsync<{ total: number }>(
    'select count(*) as total from sinidoc where id_sinistro = ? and id_documento = ?',
    [idSinistro, idDocumento],
  );
  if (!existe || existe.total === 0) {
    await db.runAsync(`insert into sinidoc (id_sinistro, id_documento, solicitado, chave_sign) values (?, ?, 1, ?)`, [
      idSinistro,
      idDocumento,
      assinaturaBase64,
    ]);
  } else {
    await db.runAsync('update sinidoc set chave_sign = ? where id_sinistro = ? and id_documento = ?', [
      assinaturaBase64,
      idSinistro,
      idDocumento,
    ]);
  }
}

export async function limparAssinaturaAta(idSinistro: number, idDocumento: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinidoc set chave_sign = null where id_sinistro = ? and id_documento = ?', [
    idSinistro,
    idDocumento,
  ]);
}
