import { listarBeneficiariosParaTransferencia } from '../db/beneficiarios';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_beneficiario_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_BENEFICIARIO_URL = new URL('atualiza_beneficiario_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de ConferindoDuplicidadeBeneficiario/CarregaDadosBeneficiarios + DadosBeneficiario
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda os beneficiários
 * (sinicobbeni) como lista estruturada — nunca SQL bruto — pra
 * atualiza_beneficiario_sinistro.php, que chama a mesma função insere_beneficiario_web(...) já
 * usada em produção (ela mesma decide se atualiza um beneficiário existente ou insere um novo).
 */
export async function transferirBeneficiarios(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const beneficiarios = await listarBeneficiariosParaTransferencia(idSinistro);
  if (beneficiarios.length === 0) {
    return { sucesso: true, mensagem: 'Nenhum beneficiário para transferir.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    beneficiarios: JSON.stringify(beneficiarios),
  };

  return postFormulario(ATUALIZA_BENEFICIARIO_URL, campos, 'transferenciaBeneficiarios');
}
