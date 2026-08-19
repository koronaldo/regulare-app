import { lerCredenciais } from './credenciais';
import { postFormulario, requireApiUrl } from './apiTransferencia';

const MENSAGENS_PENDENTES_URL = new URL('mensagens_pendentes.php', requireApiUrl()).toString();
const CONFIRMA_LEITURA_URL = new URL('confirma_leitura_mensagem.php', requireApiUrl()).toString();

export interface MensagemBroadcast {
  id_mensagem: number;
  titulo: string;
  corpo: string;
  data_criacao: string;
}

/**
 * Busca as mensagens de broadcast ainda não lidas pelo usuário autenticado — usada tanto pela
 * tela "Mensagens" quanto pela checagem periódica em segundo plano (backgroundSync.ts). Cada
 * chamada já grava o log de "entregue" no servidor (ver mensagens_pendentes.php).
 */
export async function buscarMensagensPendentes(): Promise<MensagemBroadcast[]> {
  const credenciais = await lerCredenciais();
  if (!credenciais) return [];

  const resultado = await postFormulario(
    MENSAGENS_PENDENTES_URL,
    { usuario: credenciais.usuario, senha: credenciais.senhaEnvio },
    'mensagens-pendentes',
  );
  if (!resultado.sucesso || !Array.isArray(resultado.dados?.mensagens)) return [];
  return resultado.dados.mensagens;
}

/** Confirma que o usuário abriu/leu a mensagem — grava o log de leitura no servidor. */
export async function confirmarLeituraMensagem(idMensagem: number): Promise<boolean> {
  const credenciais = await lerCredenciais();
  if (!credenciais) return false;

  const resultado = await postFormulario(
    CONFIRMA_LEITURA_URL,
    { usuario: credenciais.usuario, senha: credenciais.senhaEnvio, id_mensagem: String(idMensagem) },
    'confirma-leitura-mensagem',
  );
  return resultado.sucesso;
}
