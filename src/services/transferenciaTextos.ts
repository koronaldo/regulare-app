import { montarTextoConcatenado } from '../db/relato';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_texto_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_TEXTO_URL = new URL('atualiza_texto_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de CarregaDadosConstatacoes/CarregaDadosTextos + DadosTextos
 * (transfere_sinistro_def_screen.js): aglutina localmente os subtextos (sinitextomob) do relato
 * (id_texto=4) ou das constatações (id_texto=5) e envia o texto final pra
 * atualiza_texto_sinistro.php, que grava em sinitexto com query parametrizada — nunca SQL bruto.
 */
export async function transferirTexto(idSinistro: number, idTexto: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const resposta = await montarTextoConcatenado(idSinistro, idTexto);

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    id_texto: String(idTexto),
    resposta,
  };

  return postFormulario(ATUALIZA_TEXTO_URL, campos, 'transferenciaTextos');
}
