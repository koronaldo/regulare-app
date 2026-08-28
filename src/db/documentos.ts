import { getDb } from './client';
import { registrarLog } from './logs';

export interface InstanciaDocumento {
  grupopag: string;
  totalPaginas: number;
  enviado: boolean;
}

export interface ArquivoDocumento {
  id_docpdf: number;
  /** Caminho físico do arquivo — é o que vai pro servidor na transferência. */
  nome_arquivo: string;
  /** Nome amigável pra exibir na relação (ex.: o nome da ata). Vazio nos arquivos antigos. */
  nome_descritivo: string;
  enviado: boolean;
}

export interface DocumentoResumo {
  id_documento: number;
  nm_documento: string;
  id_docgrupo: number;
  descritivo: boolean;
  complemento: string;
  solicitado: boolean;
  instancias: InstanciaDocumento[];
  arquivos: ArquivoDocumento[];
}

export interface GrupoDocumentos {
  id_docgrupo: number;
  nm_docgrupo: string;
  documentos: DocumentoResumo[];
}

export type FiltroDocumento = 'todos' | 'solicitados' | 'nao_solicitados';

export interface DocumentoDetalhe {
  id_documento: number;
  nm_documento: string;
  descritivo: boolean;
  complemento: string;
  solicitado: boolean;
}

export async function buscarDocumento(idSinistro: number, idDocumento: number): Promise<DocumentoDetalhe | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id_documento: number;
    nm_documento: string;
    descritivo: number | boolean | null;
    complemento: string | null;
    solicitado: number | boolean | null;
  }>(
    `select dc.id_documento, dc.nm_documento, dc.descritivo, sd.complemento, sd.solicitado
     from documentos dc
     left join sinidoc sd on sd.id_documento = dc.id_documento and sd.id_sinistro = ?
     where dc.id_documento = ?`,
    [idSinistro, idDocumento],
  );
  if (!row) return null;
  return {
    id_documento: row.id_documento,
    nm_documento: row.nm_documento,
    descritivo: !!row.descritivo,
    complemento: row.complemento ?? '',
    solicitado: !!row.solicitado,
  };
}

/** Porta de VerRelaDoc (reldocumento_def.js), já agrupada por docgrupo. */
export async function listarDocumentos(
  idSinistro: number,
  filtro: FiltroDocumento,
  pesquisa: string,
): Promise<GrupoDocumentos[]> {
  const db = await getDb();
  const condicoes: string[] = [];
  const params: (string | number)[] = [idSinistro];

  if (filtro === 'solicitados') condicoes.push('sd.solicitado = 1');
  if (filtro === 'nao_solicitados') condicoes.push('(sd.solicitado is null or sd.solicitado = 0)');
  if (pesquisa.trim()) {
    condicoes.push('upper(dc.nm_documento) like upper(?)');
    params.push(`${pesquisa.trim()}%`);
  }
  const where = condicoes.length ? `and ${condicoes.join(' and ')}` : '';

  const linhas = await db.getAllAsync<{
    id_docgrupo: number;
    nm_docgrupo: string;
    id_documento: number;
    nm_documento: string;
    descritivo: number | boolean | null;
    complemento: string | null;
    solicitado: number | boolean | null;
  }>(
    `select dg.id_docgrupo, dg.nm_docgrupo, dc.id_documento, dc.nm_documento, dc.descritivo,
       sd.complemento, sd.solicitado
     from docgrupo dg
     inner join documentos dc on dg.id_docgrupo = dc.id_docgrupo
     left join sinidoc sd on sd.id_documento = dc.id_documento and sd.id_sinistro = ?
     where 1 = 1 ${where}
     order by dg.nm_docgrupo, dg.id_docgrupo, dc.nm_documento`,
    params,
  );

  const idsDocumentos = Array.from(new Set(linhas.map((l) => l.id_documento)));
  const instanciasPorDoc = new Map<number, InstanciaDocumento[]>();
  const arquivosPorDoc = new Map<number, ArquivoDocumento[]>();
  if (idsDocumentos.length > 0) {
    const placeholders = idsDocumentos.map(() => '?').join(',');

    // "todas_enviadas": 1 só quando TODAS as páginas da instância já foram enviadas ('E') —
    // min() do flag 0/1 por página dá 1 apenas se nenhuma página estiver pendente.
    const linhasInstancias = await db.getAllAsync<{
      id_documento: number;
      grupopag: string;
      total: number;
      todas_enviadas: number;
    }>(
      `select id_documento, grupopag, count(*) as total,
         min(case when enviado = 'E' then 1 else 0 end) as todas_enviadas
       from sinidocpag
       where id_sinistro = ? and id_documento in (${placeholders})
       group by id_documento, grupopag
       order by grupopag`,
      [idSinistro, ...idsDocumentos],
    );
    for (const li of linhasInstancias) {
      const lista = instanciasPorDoc.get(li.id_documento) ?? [];
      lista.push({ grupopag: li.grupopag, totalPaginas: Number(li.total), enviado: !!li.todas_enviadas });
      instanciasPorDoc.set(li.id_documento, lista);
    }

    const linhasArquivos = await db.getAllAsync<{
      id_docpdf: number;
      id_documento: number;
      nome_arquivo: string | null;
      nome_descritivo: string | null;
      enviado: number | boolean | null;
    }>(
      `select id_docpdf, id_documento, nome_arquivo, nome_descritivo, enviado from sinidocpdf
       where id_sinistro = ? and id_documento in (${placeholders})
       order by id_docpdf`,
      [idSinistro, ...idsDocumentos],
    );
    for (const la of linhasArquivos) {
      const lista = arquivosPorDoc.get(la.id_documento) ?? [];
      lista.push({
        id_docpdf: la.id_docpdf,
        nome_arquivo: la.nome_arquivo ?? '',
        nome_descritivo: la.nome_descritivo ?? '',
        enviado: !!la.enviado,
      });
      arquivosPorDoc.set(la.id_documento, lista);
    }
  }

  const grupos = new Map<number, GrupoDocumentos>();
  for (const l of linhas) {
    let grupo = grupos.get(l.id_docgrupo);
    if (!grupo) {
      grupo = { id_docgrupo: l.id_docgrupo, nm_docgrupo: l.nm_docgrupo, documentos: [] };
      grupos.set(l.id_docgrupo, grupo);
    }
    grupo.documentos.push({
      id_documento: l.id_documento,
      nm_documento: l.nm_documento,
      id_docgrupo: l.id_docgrupo,
      descritivo: !!l.descritivo,
      complemento: l.complemento ?? '',
      solicitado: !!l.solicitado,
      instancias: instanciasPorDoc.get(l.id_documento) ?? [],
      arquivos: arquivosPorDoc.get(l.id_documento) ?? [],
    });
  }
  return Array.from(grupos.values());
}

/** Porta de AlteraParaSolicitado/ConfirmaSolitacao (reldocumento_def.js). */
export async function marcarSolicitado(idSinistro: number, idDocumento: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const existe = await db.getFirstAsync<{ total: number }>(
      'select count(*) as total from sinidoc where id_sinistro = ? and id_documento = ?',
      [idSinistro, idDocumento],
    );
    if (!existe || existe.total === 0) {
      await db.runAsync(
        `insert into sinidoc (id_sinistro, id_documento, solicitado, complemento) values (?, ?, 1, '')`,
        [idSinistro, idDocumento],
      );
    } else {
      // A linha já existir NÃO significa que o documento está solicitado: o servidor importa o
      // catálogo inteiro de sinidoc por sinistro, a maioria com solicitado=0. Sem este update,
      // anexar um arquivo (ou assinar uma ata) a um documento já catalogado não o fazia aparecer
      // na relação, que por padrão filtra por solicitado=1.
      await db.runAsync('update sinidoc set solicitado = 1 where id_sinistro = ? and id_documento = ?', [
        idSinistro,
        idDocumento,
      ]);
    }
    await db.runAsync('delete from sinidoc_exc where id_sinistro = ? and id_documento = ?', [idSinistro, idDocumento]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'docs'", [
      idSinistro,
    ]);
  });
}

/**
 * Contrapartida de marcarSolicitado, usada ao apagar uma ata/termo assinado: o documento só
 * continua "solicitado" enquanto ainda houver algum arquivo anexado a ele. Sem isso, apagar a ata
 * apagava o PDF e a assinatura mas deixava o documento pendurado na relação, vazio.
 *
 * Diferente de removerSolicitacao, aqui a linha de sinidoc é preservada (e nada vai pra
 * sinidoc_exc): é só o vínculo que cai, não um pedido de exclusão do documento.
 */
export async function desvincularDocumentoSeVazio(idSinistro: number, idDocumento: number): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    `select
       (select count(*) from sinidocpdf where id_sinistro = ? and id_documento = ?) +
       (select count(*) from sinidocpag where id_sinistro = ? and id_documento = ?) as total`,
    [idSinistro, idDocumento, idSinistro, idDocumento],
  );
  if ((row?.total ?? 0) > 0) return;

  await db.runAsync('update sinidoc set solicitado = 0 where id_sinistro = ? and id_documento = ?', [
    idSinistro,
    idDocumento,
  ]);
}

/** Porta de ConfirmaRemocao/RemoverDocumento (reldocumento_def.js). */
export async function removerSolicitacao(idSinistro: number, idDocumento: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('delete from sinidoc where id_sinistro = ? and id_documento = ?', [idSinistro, idDocumento]);
    await db.runAsync('insert into sinidoc_exc (id_sinistro, id_documento) values (?, ?)', [idSinistro, idDocumento]);
  });
}

/** Porta de ConfirmaComplemento/GravaComplemento (reldocumento_def.js). */
export async function salvarComplemento(idSinistro: number, idDocumento: number, texto: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinidoc set complemento = ? where id_sinistro = ? and id_documento = ?', [
    texto,
    idSinistro,
    idDocumento,
  ]);
}

export interface PaginaDocumento {
  id_docpag: number;
  nome_arquivo: string;
  formato: string;
  ordem: number;
}

/**
 * Porta de "NOVO DOC." (digitaliza_def_screen.js): cada pasta de documento pode ter vários
 * documentos (instâncias) separados, cada um com suas próprias páginas — grupopag identifica
 * a instância. Gera o próximo código "DOC001", "DOC002"...
 */
export async function proximoGrupoPag(idSinistro: number, idDocumento: number): Promise<string> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ grupopag: string | null }>(
    'select distinct grupopag from sinidocpag where id_sinistro = ? and id_documento = ?',
    [idSinistro, idDocumento],
  );
  let max = 0;
  for (const l of linhas) {
    const m = /^DOC(\d+)$/.exec(l.grupopag ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `DOC${String(max + 1).padStart(3, '0')}`;
}

/** Porta de mostrarDocumentos/CarregaDoctos (digitaliza_def_screen.js): páginas de uma instância (grupopag). */
export async function listarPaginas(idSinistro: number, idDocumento: number, grupopag: string): Promise<PaginaDocumento[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_docpag: number;
    nome_arquivo: string | null;
    formato: string | null;
    ordem: number | string | null;
  }>(
    `select id_docpag, nome_arquivo, formato, ordem from sinidocpag
     where id_sinistro = ? and id_documento = ? and grupopag = ?
     order by ordem`,
    [idSinistro, idDocumento, grupopag],
  );
  return linhas.map((l) => ({
    id_docpag: l.id_docpag,
    nome_arquivo: l.nome_arquivo ?? '',
    formato: l.formato || '4',
    ordem: l.ordem != null ? Number(l.ordem) : 0,
  }));
}

async function proximaOrdemPagina(idSinistro: number, idDocumento: number, grupopag: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    'select count(*) as total from sinidocpag where id_sinistro = ? and id_documento = ? and grupopag = ?',
    [idSinistro, idDocumento, grupopag],
  );
  return (row?.total ?? 0) + 1;
}

/** Porta de InserenoBDArquivo/populateDB (digitaliza_def_screen.js): nova página fotografada, numa instância (grupopag). */
export async function inserirPagina(
  idSinistro: number,
  idDocumento: number,
  grupopag: string,
  arquivo: string,
): Promise<void> {
  const db = await getDb();
  const ordem = await proximaOrdemPagina(idSinistro, idDocumento, grupopag);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `insert into sinidocpag (id_sinistro, id_documento, grupopag, formato, nome_arquivo, ordem, ordleg, enviado, data_insere, hora_insere)
       values (?, ?, ?, '4', ?, ?, ?, 'N', date('now'), time('now'))`,
      [idSinistro, idDocumento, grupopag, arquivo, ordem, ordem],
    );
    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
  });
  await marcarSolicitado(idSinistro, idDocumento);
  await registrarLog(idSinistro, 'Documento inserido');
}

/** Porta de RemoveFoto/RemoveDoctoX (digitaliza_def_screen.js). */
export async function excluirPagina(idPagina: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinidocpag where id_docpag = ?', [idPagina]);
}

/** Porta de AtualizaTodas (digitaliza_def_screen.js): renumera ordem sequencialmente após arrastar. */
export async function reordenarPaginas(idsEmOrdem: number[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < idsEmOrdem.length; i++) {
      await db.runAsync('update sinidocpag set ordem = ?, ordleg = ? where id_docpag = ?', [
        i + 1,
        i + 1,
        idsEmOrdem[i],
      ]);
    }
  });
}

/** Porta de TrocaFormatoPagina (digitaliza_def_screen.js): tamanho da página no PDF final, em quartos (1/4..4/4). */
export async function definirFormatoPagina(idPagina: number, formato: '1' | '2' | '3' | '4'): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinidocpag set formato = ? where id_docpag = ?', [formato, idPagina]);
}

/** Arquivos anexados via upload (não fotografados) — sinidocpdf. */
export async function listarArquivos(idSinistro: number, idDocumento: number): Promise<ArquivoDocumento[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_docpdf: number;
    nome_arquivo: string | null;
    nome_descritivo: string | null;
    enviado: number | boolean | null;
  }>(
    'select id_docpdf, nome_arquivo, nome_descritivo, enviado from sinidocpdf where id_sinistro = ? and id_documento = ? order by id_docpdf',
    [idSinistro, idDocumento],
  );
  return linhas.map((l) => ({
    id_docpdf: l.id_docpdf,
    nome_arquivo: l.nome_arquivo ?? '',
    nome_descritivo: l.nome_descritivo ?? '',
    enviado: !!l.enviado,
  }));
}

/**
 * `arquivo` é o caminho físico (o que a transferência envia). `nomeDescritivo` é só pra exibição
 * na relação de documentos — quando vem de uma ata, é o mesmo nome mostrado na tela de Atas e
 * Termos; quando o usuário anexa um PDF avulso, fica vazio e a tela cai no nome do arquivo.
 */
export async function inserirArquivo(
  idSinistro: number,
  idDocumento: number,
  arquivo: string,
  nomeDescritivo = '',
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `insert into sinidocpdf (id_sinistro, id_documento, nome_arquivo, nome_descritivo, enviado, data_insere, hora_insere)
       values (?, ?, ?, ?, 0, date('now'), time('now'))`,
      [idSinistro, idDocumento, arquivo, nomeDescritivo],
    );
    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
  });
  await marcarSolicitado(idSinistro, idDocumento);
  await registrarLog(idSinistro, 'Documento inserido');
}

export async function excluirArquivo(idArquivo: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinidocpdf where id_docpdf = ?', [idArquivo]);
}

// ---- Transferência de documentos ----

export interface InstanciaParaTransferencia {
  id_documento: number;
  nm_documento: string;
  grupopag: string;
  complemento: string;
  paginas: { arquivo: string; formato: string }[];
}

/**
 * Instâncias fotografadas (sinidocpag) que precisam ir (de novo) pro servidor, agrupadas por
 * grupopag — cada grupo vira um PDF só na hora da transferência, que substitui (nunca duplica) o
 * que já estava lá, casando pelo mesmo nome_web (ver atualiza_documento_sinistro.php). Uma
 * instância entra na lista se TEM ALGUMA página ainda pendente (enviado <> 'E') — mas nesse caso
 * leva TODAS as suas páginas, não só as novas, pra o PDF reenviado ficar completo e realmente
 * substituir o anterior (se mandasse só as páginas novas, o reenvio sobrescreveria um documento
 * de 5 páginas por um de 1 página). grupopag='PDF' é reservado pras Atas/Termos assinadas
 * (ConferindoAtasTermos no legado), não entra aqui.
 */
export async function listarInstanciasParaTransferencia(idSinistro: number): Promise<InstanciaParaTransferencia[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_documento: number;
    nm_documento: string;
    grupopag: string;
    complemento: string | null;
    nome_arquivo: string | null;
    formato: string | null;
  }>(
    `select sp.id_documento, dc.nm_documento, sp.grupopag, sd.complemento, sp.nome_arquivo, sp.formato
     from sinidocpag sp
     inner join documentos dc on dc.id_documento = sp.id_documento
     left join sinidoc sd on sd.id_sinistro = sp.id_sinistro and sd.id_documento = sp.id_documento
     where sp.id_sinistro = ? and sp.grupopag <> 'PDF'
       and exists (
         select 1 from sinidocpag pendente
         where pendente.id_sinistro = sp.id_sinistro and pendente.id_documento = sp.id_documento
           and pendente.grupopag = sp.grupopag and (pendente.enviado is null or pendente.enviado <> 'E')
       )
     order by sp.id_documento, sp.grupopag, sp.ordem`,
    [idSinistro],
  );

  const mapa = new Map<string, InstanciaParaTransferencia>();
  for (const l of linhas) {
    const chave = `${l.id_documento}|${l.grupopag}`;
    let instancia = mapa.get(chave);
    if (!instancia) {
      instancia = {
        id_documento: l.id_documento,
        nm_documento: l.nm_documento,
        grupopag: l.grupopag,
        complemento: l.complemento ?? '',
        paginas: [],
      };
      mapa.set(chave, instancia);
    }
    instancia.paginas.push({ arquivo: l.nome_arquivo ?? '', formato: l.formato || '4' });
  }
  return Array.from(mapa.values());
}

/** Busca uma única instância fotografada (grupopag), pra transmitir esse documento individualmente. */
export async function buscarInstanciaParaTransferencia(
  idSinistro: number,
  idDocumento: number,
  grupopag: string,
): Promise<InstanciaParaTransferencia | null> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    nm_documento: string;
    complemento: string | null;
    nome_arquivo: string | null;
    formato: string | null;
  }>(
    `select dc.nm_documento, sd.complemento, sp.nome_arquivo, sp.formato
     from sinidocpag sp
     inner join documentos dc on dc.id_documento = sp.id_documento
     left join sinidoc sd on sd.id_sinistro = sp.id_sinistro and sd.id_documento = sp.id_documento
     where sp.id_sinistro = ? and sp.id_documento = ? and sp.grupopag = ?
     order by sp.ordem`,
    [idSinistro, idDocumento, grupopag],
  );
  if (linhas.length === 0) return null;
  return {
    id_documento: idDocumento,
    nm_documento: linhas[0].nm_documento,
    grupopag,
    complemento: linhas[0].complemento ?? '',
    paginas: linhas.map((l) => ({ arquivo: l.nome_arquivo ?? '', formato: l.formato || '4' })),
  };
}

/** Porta de onUploadSuccessPDF (envia_fotos_servidor.js): marca todas as páginas da instância como enviadas. */
export async function marcarInstanciaEnviada(idSinistro: number, idDocumento: number, grupopag: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("update sinidocpag set enviado = 'E' where id_sinistro = ? and id_documento = ? and grupopag = ?", [
    idSinistro,
    idDocumento,
    grupopag,
  ]);
}

export interface ArquivoParaTransferencia {
  id_docpdf: number;
  id_documento: number;
  nm_documento: string;
  nome_arquivo: string;
  complemento: string;
}

/**
 * sinidocpdf guarda tanto arquivos anexados manualmente (DocumentPicker) quanto PDFs de Atas
 * assinadas (assinar.tsx chama o mesmo inserirArquivo) — ataseg_doc é o catálogo que diz qual
 * id_documento pertence a qual modelo de ata, então dá pra distinguir os dois casos sem precisar
 * de uma coluna nova.
 *
 * O casamento é só por seguradora, sem filtrar por produto: listarAtasDisponiveis (db/atas.ts) usa
 * fallback produto -> seguradora, então uma ata pode ter sido gerada a partir de um modelo cadastrado
 * em outro produto da mesma seguradora. Com o filtro de produto aqui, essas atas não eram
 * reconhecidas — sumiam da transferência de "Atas e Termos" (que respondia "nada a transferir" e
 * marcava como enviado sem enviar nada) e ainda vazavam pra transferência de "Documentos".
 */
const CONDICAO_E_ATA = `exists (
       select 1 from ataseg_doc ad
       inner join sinimob sm on sm.id_sinistro = sp.id_sinistro
       where ad.id_documento = sp.id_documento
         and ad.id_seguradora = sm.id_seguradora
     )`;

/** Arquivos já prontos (sinidocpdf, anexados via DocumentPicker) ainda não confirmados no servidor — não inclui Atas/Termos, que têm opção própria. */
export async function listarArquivosParaTransferencia(idSinistro: number): Promise<ArquivoParaTransferencia[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_docpdf: number;
    id_documento: number;
    nm_documento: string;
    nome_arquivo: string | null;
    complemento: string | null;
  }>(
    `select sp.id_docpdf, sp.id_documento, dc.nm_documento, sp.nome_arquivo, sd.complemento
     from sinidocpdf sp
     inner join documentos dc on dc.id_documento = sp.id_documento
     left join sinidoc sd on sd.id_sinistro = sp.id_sinistro and sd.id_documento = sp.id_documento
     where sp.id_sinistro = ? and (sp.enviado is null or sp.enviado = 0) and not ${CONDICAO_E_ATA}`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_docpdf: l.id_docpdf,
    id_documento: l.id_documento,
    nm_documento: l.nm_documento,
    nome_arquivo: l.nome_arquivo ?? '',
    complemento: l.complemento ?? '',
  }));
}

/** Busca um único arquivo anexado (sinidocpdf), pra transmitir esse documento individualmente. */
export async function buscarArquivoParaTransferencia(idDocpdf: number): Promise<ArquivoParaTransferencia | null> {
  const db = await getDb();
  const l = await db.getFirstAsync<{
    id_docpdf: number;
    id_documento: number;
    nm_documento: string;
    nome_arquivo: string | null;
    complemento: string | null;
  }>(
    `select sp.id_docpdf, sp.id_documento, dc.nm_documento, sp.nome_arquivo, sd.complemento
     from sinidocpdf sp
     inner join documentos dc on dc.id_documento = sp.id_documento
     left join sinidoc sd on sd.id_sinistro = sp.id_sinistro and sd.id_documento = sp.id_documento
     where sp.id_docpdf = ?`,
    [idDocpdf],
  );
  if (!l) return null;
  return {
    id_docpdf: l.id_docpdf,
    id_documento: l.id_documento,
    nm_documento: l.nm_documento,
    nome_arquivo: l.nome_arquivo ?? '',
    complemento: l.complemento ?? '',
  };
}

export async function marcarArquivoEnviado(idDocpdf: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('update sinidocpdf set enviado = 1 where id_docpdf = ?', [idDocpdf]);
}

/**
 * Atas/Termos assinadas (sinidocpdf, ver CONDICAO_E_ATA), separadas de "Documentos".
 *
 * `incluirEnviadas` reenvia também as que já constam como enviadas: quando o usuário marca
 * "Atas e Termos" na tela de transferência, ele está pedindo o envio explicitamente, e responder
 * "nada a transferir" (marcando como sucesso) esconde qualquer ata que o servidor não tenha
 * recebido de fato.
 */
export async function listarAtasParaTransferencia(
  idSinistro: number,
  incluirEnviadas = false,
): Promise<ArquivoParaTransferencia[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{
    id_docpdf: number;
    id_documento: number;
    nm_documento: string;
    nome_arquivo: string | null;
    complemento: string | null;
  }>(
    `select sp.id_docpdf, sp.id_documento, dc.nm_documento, sp.nome_arquivo, sd.complemento
     from sinidocpdf sp
     inner join documentos dc on dc.id_documento = sp.id_documento
     left join sinidoc sd on sd.id_sinistro = sp.id_sinistro and sd.id_documento = sp.id_documento
     where sp.id_sinistro = ?${incluirEnviadas ? '' : ' and (sp.enviado is null or sp.enviado = 0)'}
       and ${CONDICAO_E_ATA}`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_docpdf: l.id_docpdf,
    id_documento: l.id_documento,
    nm_documento: l.nm_documento,
    nome_arquivo: l.nome_arquivo ?? '',
    complemento: l.complemento ?? '',
  }));
}
