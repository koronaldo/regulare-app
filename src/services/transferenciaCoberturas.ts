import { listarCoberturasParaTransferencia } from '../db/coberturas';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_cobertura_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_COBERTURA_URL = new URL('atualiza_cobertura_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de ConferindoDuplicidadeCobertura/CarregaDadosCobertura + DadosCobertura
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda as coberturas
 * (sinimobcob) como lista estruturada — nunca SQL bruto — pra atualiza_cobertura_sinistro.php,
 * que chama a mesma função insere_cobertura_web(...) já usada em produção (ela mesma decide se
 * atualiza uma cobertura já existente ou insere uma nova, casando por id_sinistro+id_cobertura).
 */
export async function transferirCoberturas(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const coberturas = await listarCoberturasParaTransferencia(idSinistro);
  if (coberturas.length === 0) {
    return { sucesso: true, mensagem: 'Nenhuma cobertura para transferir.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    coberturas: JSON.stringify(coberturas),
  };

  return postFormulario(ATUALIZA_COBERTURA_URL, campos, 'transferenciaCoberturas');
}
