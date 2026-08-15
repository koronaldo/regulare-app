import {
  listarBenfeitoriasParaTransferencia,
  listarChecklistMaquinasParaTransferencia,
  marcarBenfeitoriasTransferidas,
} from '../db/informacoes';
import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl, type ResultadoTransferencia } from './apiTransferencia';

/** As duas APIs vivem na mesma pasta de autentica_criptoX40.php. */
const ATUALIZA_BENFEITORIA_URL = new URL('atualiza_benfeitoria_sinistro.php', requireApiUrl()).toString();
const ATUALIZA_MAQUINA_URL = new URL('atualiza_maquina_sinistro.php', requireApiUrl()).toString();

interface ChaveBenfeitoria {
  id_bemmob: number;
  id_benmaq: number;
}

/**
 * Porta segura de ConferindoDuplicidadeBenfeitoria/CarregaDadosBenfeitoria + DadosBenfeitoria
 * (transfere_sinistro_def_screen.js / sicroniza_sinistro_new.php): manda o cadastro base das
 * benfeitorias e máquinas (sinibenfe, tipo_bene='PRE' e 'MAQ') como lista estruturada — nunca SQL
 * bruto — pra atualiza_benfeitoria_sinistro.php, que chama a mesma função
 * insere_benfeitoria_web(...) já usada em produção, só que com parâmetros. Grava localmente o
 * id_benfeweb (chave real do servidor) devolvido pra cada item, igual ao AtualizaChavesBenfeitoria
 * do legado, e então sincroniza o checklist das máquinas (sinistro_maquina), que depende desse
 * id_benfeweb já resolvido pra referenciar a máquina certa no servidor.
 */
export async function transferirBenfeitorias(idSinistro: number): Promise<ResultadoTransferencia> {
  const credenciais = await lerCredenciais();
  if (!credenciais) {
    return { sucesso: false, mensagem: 'Nenhuma sessão salva. Faça login novamente.' };
  }

  const benfeitorias = await listarBenfeitoriasParaTransferencia(idSinistro);
  if (benfeitorias.length === 0) {
    return { sucesso: true, mensagem: 'Nenhuma benfeitoria ou máquina para transferir.' };
  }

  const camposBenfe = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    benfeitorias: JSON.stringify(benfeitorias),
  };

  const resultadoBenfe = await postFormulario(ATUALIZA_BENFEITORIA_URL, camposBenfe, 'transferenciaBenfeitorias');
  if (!resultadoBenfe.sucesso) return resultadoBenfe;

  const chaves: ChaveBenfeitoria[] = Array.isArray(resultadoBenfe.dados?.chaves) ? resultadoBenfe.dados.chaves : [];
  await marcarBenfeitoriasTransferidas(
    idSinistro,
    chaves.map((c) => ({ id_sinibenfe: c.id_bemmob, id_benfeweb: c.id_benmaq })),
  );

  const checklist = await listarChecklistMaquinasParaTransferencia(idSinistro);
  if (checklist.length === 0) {
    return resultadoBenfe;
  }

  const camposMaquina = {
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    id_sinistro: String(idSinistro),
    itens: JSON.stringify(checklist),
  };

  const resultadoMaquina = await postFormulario(ATUALIZA_MAQUINA_URL, camposMaquina, 'transferenciaMaquinas');
  if (!resultadoMaquina.sucesso) {
    return { sucesso: false, mensagem: `${resultadoBenfe.mensagem} Checklist de máquinas: ${resultadoMaquina.mensagem}` };
  }

  return { sucesso: true, mensagem: `${resultadoBenfe.mensagem} ${resultadoMaquina.mensagem}` };
}
