import { getDb } from './client';
import { registrarLog } from './logs';
import type { OpcaoLista } from './sinistros';

const LABEL_TIPO_COBERTURA: Record<string, string> = {
  PRE: 'PRÉDIO',
  MMU: 'MMU',
  MMP: 'MMP',
  VAL: 'VALOR',
  VER: 'VERBA ÚNICA',
};

/**
 * Porta de BuscaTipoCobertura (cadbeneficiario_def.js): só os tipos de cobertura que já têm
 * cobertura cadastrada nesse sinistro — é assim que o legado obriga vincular a cobertura antes
 * de cadastrar um beneficiário (sem cobertura salva, esse combo fica vazio).
 */
export async function listarTiposCoberturaDoSinistro(idSinistro: number): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ tipo_cob: string }>(
    `select distinct cb.tipo_cob
     from sinimobcob sc
     inner join cobertura cb on sc.id_cobertura = cb.id_cobertura
     where sc.id_sinistro = ?`,
    [idSinistro],
  );
  return linhas.map((l) => ({ valor: l.tipo_cob, label: LABEL_TIPO_COBERTURA[l.tipo_cob] ?? l.tipo_cob }));
}

/** Porta de BuscaCoberturas (cadbeneficiario_def.js): coberturas já cadastradas nesse sinistro, por tipo. */
export async function listarCoberturasDoSinistroPorTipo(idSinistro: number, tipoCob: string): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_cobertura: number; nm_cobertura: string }>(
    `select distinct sc.id_cobertura, cb.nm_cobertura
     from sinimobcob sc
     inner join cobertura cb on sc.id_cobertura = cb.id_cobertura
     where sc.id_sinistro = ? and cb.tipo_cob = ?`,
    [idSinistro, tipoCob],
  );
  return linhas.map((l) => ({ valor: l.id_cobertura, label: l.nm_cobertura }));
}

export async function existeCoberturaCadastrada(idSinistro: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>('select count(*) as total from sinimobcob where id_sinistro = ?', [
    idSinistro,
  ]);
  return (row?.total ?? 0) > 0;
}

export interface DadosSegurado {
  nome: string;
  tipoDoc: string;
  cpf: string;
  avaliaSegura: boolean;
}

/** Porta de BuscaDadosSegurados (cadbeneficiario_def.js). */
export async function buscarDadosSegurado(idSinistro: number): Promise<DadosSegurado | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ nm_segurado: string; tipo_doc: string | null; cpf: string | null; avalia_segura: number | null }>(
    `select sm.nm_segurado, sm.tipo_doc, sm.cpf, sa.avalia_segura
     from sinimob sm
     left join seguradora sa on sa.id_seguradora = sm.id_seguradora
     where sm.id_sinistro = ?`,
    [idSinistro],
  );
  if (!row) return null;
  return {
    nome: row.nm_segurado ?? '',
    tipoDoc: row.tipo_doc ?? 'F',
    cpf: row.cpf ?? '',
    avaliaSegura: !!row.avalia_segura,
  };
}

/** Porta de BuscaFormaPag (cadbeneficiario_def.js). */
export async function listarFormasPagamento(idSinistro: number): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_formapag: number; nm_formapag: string }>(
    `select fp.id_formapag, fp.nm_formapag
     from formapag fp
     inner join seguradora_formapag se on fp.id_formapag = se.id_formapag
     inner join sinimob si on si.id_seguradora = se.id_seguradora
     where si.id_sinistro = ?`,
    [idSinistro],
  );
  return linhas.map((l) => ({ valor: l.id_formapag, label: l.nm_formapag }));
}

/** Porta de BuscaTipoConta (cadbeneficiario_def.js). */
export async function listarTiposConta(idSeguradora: number, idFormaPag: number): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_tipoconta: number; nm_tipoconta: string }>(
    `select ft.id_tipoconta, tc.nm_tipoconta
     from formapag_tipoconta ft
     inner join tipoconta tc on ft.id_tipoconta = tc.id_tipoconta
     where ft.id_seguradora = ? and ft.id_formapag = ?`,
    [idSeguradora, idFormaPag],
  );
  return linhas.map((l) => ({ valor: l.id_tipoconta, label: l.nm_tipoconta }));
}

/** Porta de BuscaBancos (cadbeneficiario_def.js). */
export async function listarBancos(): Promise<OpcaoLista[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_banco: number; nm_banco: string; codigo: string }>(
    'select id_banco, nm_banco, codigo from bancos order by nm_banco',
  );
  return linhas.map((l) => ({ valor: l.id_banco, label: `${l.codigo.padStart(3, '0')} - ${l.nm_banco}` }));
}

export async function buscarSeguradoraDoSinistro(idSinistro: number): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id_seguradora: number }>('select id_seguradora from sinimob where id_sinistro = ?', [
    idSinistro,
  ]);
  return row?.id_seguradora ?? null;
}

export interface BeneficiarioResumo {
  id_beneficio: number;
  tipo_cob: string;
  id_cobertura: number;
  id_formapag: number | null;
  quem: string;
  nm_beneficiario: string;
  tipo_doc: string;
  cpf_beneficiario: string;
  id_banco: number | null;
  banco: string;
  agencia: string;
  conta: string;
  id_tipoconta: number | null;
  digage: string;
  digconta: string;
  nota_ava: number | null;
}

/** Porta de CarregaBeneficiarios (cadbeneficiario_def.js). */
export async function listarBeneficiarios(idSinistro: number): Promise<BeneficiarioResumo[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<Record<string, unknown>>(
    `select sb.*, cb.tipo_cob
     from sinicobbeni sb
     inner join cobertura cb on sb.id_cobertura = cb.id_cobertura
     where sb.id_sinistro = ?
     order by sb.nm_beneficiario`,
    [idSinistro],
  );
  return linhas.map((l) => ({
    id_beneficio: Number(l.id_beneficio),
    tipo_cob: String(l.tipo_cob ?? ''),
    id_cobertura: Number(l.id_cobertura),
    id_formapag: l.id_formapag != null ? Number(l.id_formapag) : null,
    quem: String(l.quem ?? ''),
    nm_beneficiario: String(l.nm_beneficiario ?? ''),
    tipo_doc: String(l.tipo_doc ?? 'F'),
    cpf_beneficiario: String(l.cpf_beneficiario ?? ''),
    id_banco: l.id_banco != null ? Number(l.id_banco) : null,
    banco: String(l.banco ?? ''),
    agencia: String(l.agencia ?? ''),
    conta: String(l.conta ?? ''),
    id_tipoconta: l.id_tipoconta != null ? Number(l.id_tipoconta) : null,
    digage: String(l.digage ?? ''),
    digconta: String(l.digconta ?? ''),
    nota_ava: l.nota_ava != null ? Number(l.nota_ava) : null,
  }));
}

export interface DadosBeneficiario {
  id_cobertura: number;
  id_formapag: number | null;
  quem: string;
  nm_beneficiario: string;
  tipo_doc: string;
  cpf_beneficiario: string;
  id_banco: number | null;
  codban: string;
  agencia: string;
  conta: string;
  id_tipoconta: number | null;
  digage: string;
  digconta: string;
  nota_ava: number | null;
}

/** Porta de AtualizaBeneficiario (cadbeneficiario_def.js). */
export async function salvarBeneficiario(idSinistro: number, idBeneficio: number | null, dados: DadosBeneficiario): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    if (!idBeneficio) {
      await db.runAsync(
        `insert into sinicobbeni
           (id_sinistro, id_cobertura, id_benfeito, quem, banco, agencia, conta, nm_beneficiario,
            cpf_beneficiario, tip_ben, id_banco, tipo_doc, id_formapag, id_tipoconta, digage, digconta, nota_ava)
         values (?, ?, 0, ?, ?, ?, ?, ?, ?, 'U', ?, ?, ?, ?, ?, ?, ?)`,
        [
          idSinistro,
          dados.id_cobertura,
          dados.quem,
          dados.codban,
          dados.agencia,
          dados.conta,
          dados.nm_beneficiario,
          dados.cpf_beneficiario,
          dados.id_banco,
          dados.tipo_doc,
          dados.id_formapag,
          dados.id_tipoconta,
          dados.digage,
          dados.digconta,
          dados.nota_ava,
        ],
      );
    } else {
      await db.runAsync(
        `update sinicobbeni set
           quem = ?, banco = ?, agencia = ?, conta = ?, nm_beneficiario = ?, cpf_beneficiario = ?,
           id_banco = ?, tipo_doc = ?, id_formapag = ?, id_tipoconta = ?, digage = ?, digconta = ?, nota_ava = ?
         where id_beneficio = ? and id_sinistro = ?`,
        [
          dados.quem,
          dados.codban,
          dados.agencia,
          dados.conta,
          dados.nm_beneficiario,
          dados.cpf_beneficiario,
          dados.id_banco,
          dados.tipo_doc,
          dados.id_formapag,
          dados.id_tipoconta,
          dados.digage,
          dados.digconta,
          dados.nota_ava,
          idBeneficio,
          idSinistro,
        ],
      );
    }

    await db.runAsync("update sinimob set novo_sini = 'N' where id_sinistro = ?", [idSinistro]);
    await db.runAsync("update btn_permissoes set sit_botao = 'S' where id_sinistro = ? and nm_botao = 'beneficia'", [
      idSinistro,
    ]);
  });

  await registrarLog(idSinistro, idBeneficio ? 'Beneficiário alterado' : 'Beneficiário inserido');
}

export interface BeneficiarioTransferencia {
  id_cobertura: number;
  quem: string | null;
  banco: string | null;
  agencia: string | null;
  digage: string | null;
  conta: string | null;
  digconta: string | null;
  nm_beneficiario: string | null;
  cpf_beneficiario: string | null;
  tip_ben: string | null;
  id_banco: number | null;
  tipo_doc: string | null;
  id_formapag: number | null;
  id_tipoconta: number | null;
  nota_ava: number | null;
}

/** Porta de ConferindoDuplicidadeBeneficiario/CarregaDadosBeneficiarios (transfere_sinistro_def_screen.js). */
export async function listarBeneficiariosParaTransferencia(idSinistro: number): Promise<BeneficiarioTransferencia[]> {
  const db = await getDb();
  return db.getAllAsync<BeneficiarioTransferencia>(
    `select id_cobertura, quem, banco, agencia, digage, conta, digconta, nm_beneficiario,
       cpf_beneficiario, tip_ben, id_banco, tipo_doc, id_formapag, id_tipoconta, nota_ava
     from sinicobbeni where id_sinistro = ?`,
    [idSinistro],
  );
}

/** Porta de RemovendoRegistro (cadbeneficiario_def.js). */
export async function excluirBeneficiario(idSinistro: number, idCobertura: number, idBeneficio: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('delete from sinicobbeni where id_sinistro = ? and id_cobertura = ? and id_beneficio = ?', [
    idSinistro,
    idCobertura,
    idBeneficio,
  ]);
}
