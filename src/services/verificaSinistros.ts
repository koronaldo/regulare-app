import { lerCredenciais } from './credenciais';
import { listaSinistrosLocais } from '../db/sinistros';

export interface SinistroNovo {
  id_sinistro: number;
  nro_sinistro: string;
  nm_segurado: string;
}

function requireApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error('EXPO_PUBLIC_API_URL não configurada.');
  return url;
}

/** verifica_novos_sinistros.php vive na mesma pasta de autentica_criptoX40.php. */
const VERIFICA_URL = new URL('verifica_novos_sinistros.php', requireApiUrl()).toString();

/**
 * Checagem leve usada pela tarefa periódica em segundo plano (ver backgroundSync.ts):
 * reautentica com a credencial salva no aparelho e pergunta ao servidor só "que sinistros
 * existem que eu ainda não tenho localmente" — sem baixar os dados completos deles (isso
 * só acontece quando o usuário abre o app e faz login de verdade).
 */
export async function verificarNovosSinistros(): Promise<SinistroNovo[]> {
  const credenciais = await lerCredenciais();
  if (!credenciais) return [];

  const body = new URLSearchParams({
    usuario: credenciais.usuario,
    senha: credenciais.senhaEnvio,
    ...(credenciais.token ? { token: credenciais.token } : {}),
    lista_sini: await listaSinistrosLocais(),
  }).toString();

  const response = await fetch(VERIFICA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=ISO-8859-1' },
    body,
  });
  if (!response.ok) return [];

  const json = await response.json();
  if (json?.result !== true || !Array.isArray(json.sinistros)) return [];

  return json.sinistros;
}
