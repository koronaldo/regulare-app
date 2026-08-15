import { getDb } from '../db/client';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_cadastro_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_CADASTRO_URL = new URL('atualiza_cadastro_sinistro.php', requireApiUrl()).toString();

interface DadosCadastraisLocais {
  nm_segurado: string | null;
  celular: string | null;
  fone: string | null;
  emailseg: string | null;
  id_cidade: number | null;
  id_estado: string | null;
  bairro: string | null;
  cep: string | null;
  contatoseg: string | null;
  coorde_log: string | null;
  coorde_lat: string | null;
  data_vistoria: string | null;
  id_produto: number | null;
  nro_sinistro: string | null;
  apolicie: string | null;
  data_ocor: string | null;
  id_causa: number | null;
  data_aviso: string | null;
  id_corretora: number | null;
  situacao: string | null;
  hora_ocor: string | null;
  hora_incerta: number | null;
  id_causa_que: number | null;
  sem_cobertura: number | null;
  envio_preliminar: string | null;
  justifica_envio: string | null;
  id_relacaoseg: number | null;
  atendente: string | null;
  id_preserva: string | null;
  tratar_ate: string | null;
  tratar_ass: string | null;
  id_relacaoseg_ass: number | null;
  atendente_ass: string | null;
  mesma_pessoa: string | null;
  outro_seguro: string | null;
  rg_assina: string | null;
  rg_atendente: string | null;
  datavig_ini: string | null;
  datavig_fim: string | null;
}

async function buscarDadosCadastraisLocais(idSinistro: number): Promise<DadosCadastraisLocais | null> {
  const db = await getDb();
  return db.getFirstAsync<DadosCadastraisLocais>(
    `select nm_segurado, celular, fone, emailseg, id_cidade, id_estado, bairro, cep, contatoseg,
       coorde_log, coorde_lat, data_vistoria, id_produto, nro_sinistro, apolicie, data_ocor,
       id_causa, data_aviso, id_corretora, situacao, hora_ocor, hora_incerta, id_causa_que,
       sem_cobertura, envio_preliminar, justifica_envio, id_relacaoseg, atendente, id_preserva,
       tratar_ate, tratar_ass, id_relacaoseg_ass, atendente_ass, mesma_pessoa, outro_seguro,
       rg_assina, rg_atendente, datavig_ini, datavig_fim
     from sinimob where id_sinistro = ?`,
    [idSinistro],
  );
}

function campo(valor: string | number | null | undefined): string {
  return valor === null || valor === undefined ? '' : String(valor);
}

/**
 * Porta segura de EnviarServidorDataIndividual/DadosSinistro (transfere_sinistro_def_screen.js):
 * lê os campos cadastrais já salvos localmente e envia como campos individuais (nunca SQL
 * bruto) para atualiza_cadastro_sinistro.php, que grava no servidor com queries parametrizadas.
 */
export async function transferirDadosCadastrais(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const dados = await buscarDadosCadastraisLocais(idSinistro);
  if (!dados) {
    return { sucesso: false, mensagem: 'Sinistro não encontrado no banco local.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    nm_segurado: campo(dados.nm_segurado),
    celular: campo(dados.celular),
    fone: campo(dados.fone),
    emailseg: campo(dados.emailseg),
    id_cidade: campo(dados.id_cidade),
    id_estado: campo(dados.id_estado),
    bairro: campo(dados.bairro),
    cep: campo(dados.cep),
    contatoseg: campo(dados.contatoseg),
    coorde_log: campo(dados.coorde_log),
    coorde_lat: campo(dados.coorde_lat),
    data_vistoria: campo(dados.data_vistoria),
    id_produto: campo(dados.id_produto),
    nro_sinistro: campo(dados.nro_sinistro),
    apolicie: campo(dados.apolicie),
    data_ocor: campo(dados.data_ocor),
    id_causa: campo(dados.id_causa),
    data_aviso: campo(dados.data_aviso),
    id_corretora: campo(dados.id_corretora),
    situacao: campo(dados.situacao),
    hora_ocor: campo(dados.hora_ocor),
    hora_incerta: dados.hora_incerta ? '1' : '0',
    id_causa_que: campo(dados.id_causa_que),
    sem_cobertura: dados.sem_cobertura ? '1' : '0',
    envio_preliminar: campo(dados.envio_preliminar),
    justifica_envio: campo(dados.justifica_envio),
    id_relacaoseg: campo(dados.id_relacaoseg),
    atendente: campo(dados.atendente),
    id_preserva: campo(dados.id_preserva),
    tratar_ate: campo(dados.tratar_ate),
    tratar_ass: campo(dados.tratar_ass),
    id_relacaoseg_ass: campo(dados.id_relacaoseg_ass),
    atendente_ass: campo(dados.atendente_ass),
    mesma_pessoa: campo(dados.mesma_pessoa),
    outro_seguro: campo(dados.outro_seguro),
    rg_assina: campo(dados.rg_assina),
    rg_atendente: campo(dados.rg_atendente),
    datavig_ini: campo(dados.datavig_ini),
    datavig_fim: campo(dados.datavig_fim),
  };

  return postFormulario(ATUALIZA_CADASTRO_URL, campos, 'transferenciaCadastro');
}
