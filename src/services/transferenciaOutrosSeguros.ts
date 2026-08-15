import { listarOutrosSegurosParaTransferencia } from '../db/outrosSeguros';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** atualiza_outroseg_sinistro.php vive na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_OUTROSEG_URL = new URL('atualiza_outroseg_sinistro.php', requireApiUrl()).toString();

/**
 * Porta segura de ConferindoOutrosSeguros/CarregaDadosOutrosSeguros + DadosOutroSeg
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda os registros de outros
 * seguros (sinimobcob_outro) como lista estruturada — nunca SQL bruto — pra
 * atualiza_outroseg_sinistro.php, que chama a mesma função insere_outseg_web(...) já usada em
 * produção (ela mesma decide, pelo id_outweb, se atualiza um registro existente ou insere um novo).
 */
export async function transferirOutrosSeguros(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const registros = await listarOutrosSegurosParaTransferencia(idSinistro);
  if (registros.length === 0) {
    return { sucesso: true, mensagem: 'Nenhum registro de outro seguro para transferir.' };
  }

  const campos = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    registros: JSON.stringify(registros),
  };

  return postFormulario(ATUALIZA_OUTROSEG_URL, campos, 'transferenciaOutrosSeguros');
}
