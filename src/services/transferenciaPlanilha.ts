import { listarItensPlanilhaParaTransferencia } from '../db/planilha';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_planilha_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_PLANILHA_URL = new URL('atualiza_planilha_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de ConferindoPlanilhaApuracao/CarregaDadosPlanilha + DadosPlanilha
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda os itens da planilha de
 * apuração (planilha_apuracao) como lista estruturada — nunca SQL bruto — pra
 * atualiza_planilha_sinistro.php, que chama a mesma função
 * insere_planilha_item_web_grupo(...) já usada em produção (ela mesma decide se atualiza um item
 * existente ou insere um novo).
 */
export async function transferirPlanilha(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const itens = await listarItensPlanilhaParaTransferencia(idSinistro);
  if (itens.length === 0) {
    return { sucesso: true, mensagem: 'Nenhum item de planilha para transferir.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    itens: JSON.stringify(itens),
  };

  return postFormulario(ATUALIZA_PLANILHA_URL, campos, 'transferenciaPlanilha');
}
