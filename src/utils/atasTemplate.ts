const PROPORCAO_A4 = 297 / 210;
const PT_POR_CM = 28.3465;
const MARGEM_PADRAO_CM = 2.5;
const CONTEUDO_PADRAO_PT = 595; // ~210mm, largura de conteúdo que os modelos baseados em mm assumem
const LARGURA_PAGINA_MAXIMA = 1200;
/**
 * expo-print no Android renderiza a 72 DPI (`Resolution` fixa no código nativo), mas o `px` do CSS
 * é sempre 96 DPI por definição da spec (independe da resolução real de saída). Então um
 * `width:735px` no HTML do modelo vira só 735*72/96 ≈ 551pt no PDF final, não 735pt — sem essa
 * conversão a página fica bem mais larga que o conteúdo, sobrando uma margem enorme.
 */
const PX_PARA_PT = 72 / 96;

/** Tamanho de página fixo usado pelos modelos que não têm margem própria (ver `MODATA_COM_MARGEM` em db/atas.ts). */
export const TAMANHO_PAGINA_PADRAO = { width: 800, height: 1131 };

/**
 * id_modata da Ata de Vistoria Preliminar — página mais compacta, com ~1,5cm de margem lateral
 * sobre a largura de conteúdo real (735px de CSS ≈ 551pt já convertido por `PX_PARA_PT`).
 * IMPORTANTE: a largura tem que ser <= altura — o Android exige página em formato retrato
 * (`PrintAttributes.MediaSize`) e troca width/height silenciosamente se width > height, o que já
 * causou confusão aqui (uma tentativa anterior com 740x650 saiu como 650x740 sem erro nenhum).
 */
const ID_MODATA_ATA_VISTORIA = 4;
const TAMANHO_PAGINA_ATA_VISTORIA = { width: 636, height: 900 };

/**
 * id_modata da Autorização de Crédito — também usa tamanho fixo dedicado em vez de margem
 * calculada: a detecção automática da largura (moda dos `width:Npx`) não achou o valor certo no
 * HTML já substituído/filtrado (caiu no piso `CONTEUDO_PADRAO_PT`, menor que o conteúdo real),
 * deixando a página estreita demais e o conteúdo saindo pela direita. 975px de CSS ≈ 731pt + 1,5cm
 * de cada lado.
 */
const ID_MODATA_AUTORIZACAO_CREDITO = 3;
const TAMANHO_PAGINA_AUTORIZACAO_CREDITO = { width: 816, height: 900 };

/**
 * Largura de conteúdo mais provável do modelo: a moda (valor mais frequente) entre os `width:Npx`
 * declarados no HTML, não o maior valor. Cada modelo usa uma largura "principal" repetida em
 * dezenas de divs (ex.: 735px na Ata de Vistoria, 975px na Autorização de Crédito) — pegar o maior
 * valor puro e simples é frágil, porque um elemento raro e isolado mais largo em algum canto do
 * modelo (que aparece só 1-3 vezes) distorceria a página toda.
 */
function larguraConteudoMaisFrequente(html: string): number {
  const larguras = [...html.matchAll(/width\s*:\s*(\d+)\s*px/gi)].map((m) => Number(m[1]));
  if (larguras.length === 0) return 0;
  const contagem = new Map<number, number>();
  for (const largura of larguras) contagem.set(largura, (contagem.get(largura) ?? 0) + 1);
  let moda = 0;
  let maiorContagem = 0;
  for (const [largura, vezes] of contagem) {
    if (vezes > maiorContagem || (vezes === maiorContagem && largura > moda)) {
      moda = largura;
      maiorContagem = vezes;
    }
  }
  return moda;
}

const TAMANHOS_PAGINA_FIXOS: Record<number, { width: number; height: number }> = {
  [ID_MODATA_ATA_VISTORIA]: TAMANHO_PAGINA_ATA_VISTORIA,
  [ID_MODATA_AUTORIZACAO_CREDITO]: TAMANHO_PAGINA_AUTORIZACAO_CREDITO,
};

/**
 * Calcula o tamanho de página a passar pro expo-print. Modelos com tamanho fixo dedicado em
 * `TAMANHOS_PAGINA_FIXOS` sempre usam esse valor (já calculado à mão pra cada um, com a margem
 * certa) — a detecção automática da largura de conteúdo não é confiável no HTML já
 * substituído/filtrado. Os demais usam a margem aplicada por `aplicarMargemPagina` (detectada no
 * próprio HTML) quando existir, senão o tamanho fixo padrão `TAMANHO_PAGINA_PADRAO`.
 */
export function calcularTamanhoPagina(html: string, idModata?: number): { width: number; height: number } {
  if (idModata != null && TAMANHOS_PAGINA_FIXOS[idModata]) {
    return TAMANHOS_PAGINA_FIXOS[idModata];
  }

  const margemAplicada = /body\s*\{\s*margin\s*:\s*([\d.]+)cm\s*\}/i.exec(html);
  if (!margemAplicada) {
    return TAMANHO_PAGINA_PADRAO;
  }

  const larguraConteudo = Math.max(larguraConteudoMaisFrequente(html) * PX_PARA_PT, CONTEUDO_PADRAO_PT);
  const folga = Math.round(PT_POR_CM * Number(margemAplicada[1])) * 2;

  const largura = Math.min(larguraConteudo + folga, LARGURA_PAGINA_MAXIMA);
  return { width: largura, height: Math.round(largura * PROPORCAO_A4) };
}

/**
 * Aplica uma margem de página (padrão 2cm) via `body{margin}` — expo-print só aceita `margins` no
 * iOS, então no Android a margem precisa vir do próprio HTML. Funciona mesmo com mais de um
 * `<body>` concatenado (modelo com várias linhas de layout), já que é uma regra de CSS por seletor,
 * não uma injeção pontual num único elemento.
 */
export function aplicarMargemPagina(html: string, margemCm = MARGEM_PADRAO_CM): string {
  const tagEstilo = `<style>body{margin:${margemCm}cm}</style>`;
  const marcaCorpo = /<body[^>]*>/i;
  if (marcaCorpo.test(html)) {
    return html.replace(marcaCorpo, (tag) => tag + tagEstilo);
  }
  return tagEstilo + html;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "2026-08-08" -> "08/08/2026". Porta de formatação usada em toda a tela de atas. */
export function paraDataBR(dataIso: string | null | undefined): string {
  if (!dataIso) return '';
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return '';
  return `${dia}/${mes}/${ano}`;
}

/** "2026-08-08" -> "08 de agosto de 2026". Porta de MesExtenso (gera_config_pdf.js). */
export function paraDataPorExtenso(dataIso: string | null | undefined): string {
  if (!dataIso) return '';
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  if (!ano || !mes || !dia) return '';
  return `${String(dia).padStart(2, '0')} de ${MESES[mes - 1] ?? ''} de ${ano}`;
}

/**
 * Converte um texto digitado em textarea (quebras de linha e espaços múltiplos) pro equivalente em
 * HTML — sem isso, o navegador colapsa tudo numa linha só ao renderizar a ata. Porta de nl2br
 * (gera_config_pdf.js: respo_vistoria/respo_segurado).
 */
export function paraHtmlMultilinha(texto: string): string {
  return texto
    .replace(/ {2,}/g, (espacos) => '&nbsp;'.repeat(espacos.length))
    .replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * Divide os dígitos de um CPF/CNPJ em variáveis separadas, uma por dígito, para preencher os
 * campos de caixinha usados em alguns modelos de ata (padrão `<DIGF1>`..`<DIGFn>` para pessoa
 * física e `<DIGJ1>`..`<DIGJn>` para pessoa jurídica). Porta do laço em atualizaLayoutAta.
 */
export function digitosParaVariaveis(documento: string, tipoPessoa: 'F' | 'J'): Record<string, string> {
  const variaveis: Record<string, string> = {};
  const digitos = documento.replace(/[^0-9A-Za-z]/g, '');
  const prefixo = tipoPessoa === 'F' ? 'DIGF' : 'DIGJ';
  for (let i = 0; i < digitos.length; i++) {
    variaveis[`<${prefixo}${i + 1}>`] = digitos[i];
  }
  return variaveis;
}

/**
 * Aplica o mapa de variáveis sobre o HTML do modelo, substituindo todas as ocorrências de cada
 * tag `<TAG>`. Tags do modelo sem valor mapeado ficam em branco (mesmo comportamento do app
 * legado, cujos campos ocultos não preenchidos resultavam em string vazia).
 */
export function substituirVariaveisAta(html: string, variaveis: Record<string, string>): string {
  let resultado = html;
  for (const [tag, valor] of Object.entries(variaveis)) {
    resultado = resultado.split(tag).join(valor ?? '');
  }
  return resultado;
}

/**
 * Verifica se uma página de ata já preenchida tem conteúdo real no corpo, ou se ficou só com o
 * cabeçalho/estrutura da tabela (modelo com mais de uma linha de layout cadastrada, mas nem todas
 * se aplicam ao caso). Usado para descartar páginas em branco antes de gerar o PDF.
 */
export function paginaTemConteudo(htmlPagina: string, minimoCaracteres = 40): boolean {
  const textoPuro = htmlPagina
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return textoPuro.length >= minimoCaracteres;
}

const MARCADOR_QUEBRA_PAGINA = /<div\s+style="page-break-after:\s*always;">\s*&nbsp\s*<\/div>/gi;

/**
 * Remove quebras de página forçadas (`page-break-after: always`) do modelo legado que não têm
 * conteúdo novo depois — só o cabeçalho/rodapé fixo repetindo, sem nada no corpo. Também tira a
 * classe "page" do wrapper raiz: como ela embrulha o documento inteiro, seu page-break-after só
 * serve pra criar uma página final em branco depois do fim do conteúdo.
 * Limiar mais alto que `paginaTemConteudo` porque o cabeçalho/rodapé fixo sozinho já rende ~130
 * caracteres de texto (rótulos como "Produto:", "Segurado:") mesmo numa página sem nada de novo.
 */
export function removerPaginasVazias(html: string, minimoCaracteres = 200): string {
  const semClassePage = html.replace(/\sclass="page"/gi, '');
  const partes = semClassePage.split(MARCADOR_QUEBRA_PAGINA);
  if (partes.length <= 1) return semClassePage;

  let resultado = partes[0];
  for (let i = 1; i < partes.length; i++) {
    if (paginaTemConteudo(partes[i], minimoCaracteres)) {
      resultado += '<div style="page-break-after: always;">&nbsp</div>' + partes[i];
    }
  }
  return resultado;
}
