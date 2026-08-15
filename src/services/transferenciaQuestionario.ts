import { listarRespostasQuestionarioParaTransferencia } from '../db/questionario';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_questionario_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_QUESTIONARIO_URL = new URL('atualiza_questionario_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de LendoDadosQuestionario/CarregaDadosQuestionario + DadosQuestionario
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda as respostas do
 * questionário (sini_prod) como lista estruturada — nunca SQL bruto — pra
 * atualiza_questionario_sinistro.php, que regrava a tabela (apaga tudo do sinistro e reinsere,
 * igual ao legado) com queries parametrizadas.
 */
export async function transferirQuestionario(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const respostas = await listarRespostasQuestionarioParaTransferencia(idSinistro);
  if (respostas.length === 0) {
    return { sucesso: true, mensagem: 'Nenhuma resposta de questionário para transferir.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    respostas: JSON.stringify(respostas),
  };

  return postFormulario(ATUALIZA_QUESTIONARIO_URL, campos, 'transferenciaQuestionario');
}
