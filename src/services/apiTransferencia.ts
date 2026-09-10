import { lerCredenciais } from './credenciais';

export function requireApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_URL não configurada. Defina-a em um arquivo .env na raiz do projeto (veja .env.example).',
    );
  }
  return url;
}

export interface ResultadoTransferencia {
  sucesso: boolean;
  mensagem: string;
  /** JSON completo devolvido pelo servidor, pra quando o chamador precisa de mais que result/msg (ex.: chaves geradas). */
  dados?: any;
}

/**
 * POST compartilhado pelos serviços de transferência (dados cadastrais, textos, ...): todos os
 * endpoints em mobile-auth-v2 seguem o mesmo contrato (form-urlencoded na entrada, JSON
 * {result,msg} na saída). Se a resposta não for JSON válido — normalmente um erro do PHP
 * impresso antes do json_encode — devolve o texto cru (limitado) em vez de esconder a causa.
 */
export async function postFormulario(
  url: string,
  campos: Record<string, string>,
  contexto: string,
): Promise<ResultadoTransferencia> {
  // Injeta o token de sessão (se houver) em toda chamada, sem exigir que os ~18 serviços de
  // transferência mudem — eles continuam mandando usuario/senha, que o servidor usa como
  // fallback caso o token esteja ausente ou vencido (ver autenticarOuToken em sessao.php).
  const credenciais = await lerCredenciais();
  const camposComToken = credenciais?.token ? { ...campos, token: credenciais.token } : campos;
  const body = new URLSearchParams(camposComToken).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=ISO-8859-1' },
      body,
    });
  } catch {
    return { sucesso: false, mensagem: 'Sem conexão com servidor!!!' };
  }

  const textoResposta = await response.text();
  console.log(`[${contexto}] status =`, response.status);
  console.log(`[${contexto}] resposta bruta =`, textoResposta);

  if (!response.ok) {
    return { sucesso: false, mensagem: `Sem conexão com servidor!!! (HTTP ${response.status})` };
  }

  let json: any;
  try {
    json = JSON.parse(textoResposta);
  } catch {
    const trecho = textoResposta.trim().slice(0, 500) || '(resposta vazia)';
    return { sucesso: false, mensagem: `Resposta inválida do servidor: ${trecho}` };
  }

  return { sucesso: json?.result === true, mensagem: json?.msg ?? 'Erro desconhecido.', dados: json };
}
