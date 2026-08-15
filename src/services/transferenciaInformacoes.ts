import { listarItensApoliceParaTransferencia, listarRiscosParaTransferencia } from '../db/informacoes';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_informacoes_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_INFORMACOES_URL = new URL('atualiza_informacoes_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de LendoDadosInformacoes/CarregaDadosInformacoes +
 * LendoDadosInformacoesNovas/CarregaDadosInformacoesNovas + DadosInformacoes
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda os riscos (sinirisco) e
 * os itens da apólice conferidos (sinistro_apolice) como listas estruturadas — nunca SQL bruto —
 * pra atualiza_informacoes_sinistro.php, que regrava as duas tabelas (apaga tudo do sinistro e
 * reinsere, igual ao legado) com queries parametrizadas.
 */
export async function transferirInformacoesGerais(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const [riscos, itens] = await Promise.all([
    listarRiscosParaTransferencia(idSinistro),
    listarItensApoliceParaTransferencia(idSinistro),
  ]);

  if (riscos.length === 0 && itens.length === 0) {
    return { sucesso: true, mensagem: 'Nenhuma informação geral para transferir.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    riscos: JSON.stringify(riscos),
    itens: JSON.stringify(itens),
  };

  return postFormulario(ATUALIZA_INFORMACOES_URL, campos, 'transferenciaInformacoes');
}
