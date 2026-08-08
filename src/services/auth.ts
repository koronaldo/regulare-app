import { notificarSinistrosNovos, registrarVerificacaoPeriodica } from './backgroundSync';
import { prepararSenha, salvarCredenciais } from './credenciais';
import { importarDadosEstaticos, importarDadosLogin, precisaDadosEstaticos } from '../db/importLogin';
import { inicializarBancoLocal } from '../db/schema';
import { idsSinistrosLocais, listaSinistrosLocais } from '../db/sinistros';
import { resumoBancoLocal } from '../db/status';

function requireApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_URL não configurada. Defina-a em um arquivo .env na raiz do projeto (veja .env.example).',
    );
  }
  return url;
}

const LOGIN_URL = requireApiUrl();
/** dados_estaticos.php vive na mesma pasta de autentica_criptoX40.php. */
const DADOS_ESTATICOS_URL = new URL('dados_estaticos.php', LOGIN_URL).toString();

export type LoginResult =
  | {
      success: true;
      codusu: number;
      codreg: number;
      nomusu: string;
      nomregula: string;
      raw: unknown;
      banco: { tabelas: number; linhasTotal: number };
    }
  | { success: false; message: string };

/**
 * Tabelas de referência (estado, cidade, bancos, tipoapolice, etc.) quase nunca mudam,
 * então em vez de reenviar tudo a cada login (como o legado fazia — o gargalo real de
 * performance do login), só busca uma vez, na primeira vez que o app roda no aparelho.
 * Falha aqui não deve derrubar o login: o usuário já tem os dados dos sinistros dele.
 */
async function sincronizarDadosEstaticosSeNecessario(): Promise<void> {
  if (!(await precisaDadosEstaticos())) return;

  try {
    const response = await fetch(DADOS_ESTATICOS_URL, { method: 'POST' });
    if (!response.ok) return;

    const json = await response.json();
    await importarDadosEstaticos(json);
  } catch (erro) {
    console.log('[auth] falha buscando dados estáticos (tentaremos de novo no próximo login):', erro);
  }
}

/**
 * Replica a autenticação do app legado (autentica_criptoX40.php):
 * senha com menos de 14 caracteres é tratada como texto puro e hasheada em
 * SHA256, enviada no formato bytea do PostgreSQL ("\x" + hex), que é como o
 * backend compara via `sha256(senha::bytea)::varchar`. lista_sini leva os
 * sinistros já salvos localmente (ver listaSinistrosLocais).
 */
export async function autenticarLegado(usuario: string, senha: string): Promise<LoginResult> {
  const senhaEnvio = await prepararSenha(senha);

  const body = new URLSearchParams({
    acao: 'LoginWeb',
    usuario,
    senha: senhaEnvio,
    lista_sini: await listaSinistrosLocais(),
  }).toString();

  console.log('[auth] LOGIN_URL =', LOGIN_URL);
  console.log('[auth] body =', body);

  let response: Response;
  try {
    response = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=ISO-8859-1',
      },
      body,
    });
  } catch (erro) {
    console.log('[auth] fetch falhou:', erro);
    return { success: false, message: 'Sem conexão com servidor!!!' };
  }

  console.log('[auth] status =', response.status);

  if (!response.ok) {
    return { success: false, message: 'Sem conexão com servidor!!!' };
  }

  const textoResposta = await response.text();
  console.log('[auth] resposta bruta =', textoResposta);

  let json: any;
  try {
    json = JSON.parse(textoResposta);
  } catch (erro) {
    console.log('[auth] JSON.parse falhou:', erro);
    return { success: false, message: 'Resposta inválida do servidor.' };
  }

  if (json?.result === true) {
    await inicializarBancoLocal();
    const idsAntes = await idsSinistrosLocais();
    await importarDadosLogin(json, usuario);
    await sincronizarDadosEstaticosSeNecessario();
    await salvarCredenciais({ usuario, senhaEnvio });
    await registrarVerificacaoPeriodica();

    const sinistrosResposta: Array<{ id_sinistro: number }> = Array.isArray(json.dados_sini) ? json.dados_sini : [];
    const novos = sinistrosResposta.filter((s) => !idsAntes.has(Number(s.id_sinistro)));
    console.log(`[auth] sinistros novos neste login: ${novos.length}`);
    if (novos.length > 0) {
      await notificarSinistrosNovos(novos.length);
    }

    const { tabelas, linhasTotal } = await resumoBancoLocal();

    return {
      success: true,
      codusu: json.dados?.codusu,
      codreg: json.dados?.codreg,
      nomusu: json.dados?.nomusu ?? '',
      nomregula: json.dados?.nomregula ?? '',
      raw: json,
      banco: { tabelas, linhasTotal },
    };
  }

  console.log('[auth] json.result não é true, json.msg =', json?.msg);
  return { success: false, message: 'Login ou senha inválidos.' };
}
