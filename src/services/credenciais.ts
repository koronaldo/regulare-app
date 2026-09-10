import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVE_CREDENCIAIS = 'regulare_credenciais';

export interface Credenciais {
  usuario: string;
  senhaEnvio: string;
  /** Token de sessão de 24h emitido por autentica_criptoX40.php — ver `sessao.php` no servidor. */
  token?: string;
  /** ISO da expiração do token, devolvida pelo servidor (`token_expira`). */
  tokenExpiraEm?: string;
  /** Dados do login guardados junto pra `index.tsx` poder pular a tela de login sem recarregar nada. */
  nomusu?: string;
  nomregula?: string;
  codreg?: string;
}

/**
 * Mesma regra do backend legado (autentica_criptoX40.php): senha com menos de 14
 * caracteres é hasheada em SHA256 e enviada no formato bytea do PostgreSQL ("\x" + hex).
 */
export async function prepararSenha(senha: string): Promise<string> {
  return senha.length < 14 ? '\\x' + (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, senha)) : senha;
}

/**
 * Guarda usuario + senha já preparada (nunca a senha em texto puro) no Keystore/Keychain
 * do aparelho, pra tarefa em segundo plano poder reautenticar sozinha e checar sinistros
 * novos sem o usuário precisar estar com o app aberto. Ver src/services/backgroundSync.ts.
 */
export async function salvarCredenciais(credenciais: Credenciais): Promise<void> {
  await SecureStore.setItemAsync(CHAVE_CREDENCIAIS, JSON.stringify(credenciais));
}

export async function lerCredenciais(): Promise<Credenciais | null> {
  const bruto = await SecureStore.getItemAsync(CHAVE_CREDENCIAIS);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as Credenciais;
  } catch {
    return null;
  }
}

export async function limparCredenciais(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE_CREDENCIAIS);
}

/**
 * Sessão pra pular a tela de login: só devolve a credencial salva se o token ainda estiver
 * dentro das 24h de validade. Vencido (ou nunca logado com token), limpa e devolve null — a
 * senha continua guardada à parte pra tarefa em segundo plano, então não apaga tudo, só invalida
 * a "sessão visível" que deixaria abrir direto no dashboard.
 */
export async function sessaoValida(): Promise<Credenciais | null> {
  const credenciais = await lerCredenciais();
  if (!credenciais?.token || !credenciais.tokenExpiraEm) return null;
  // token_expira vem do servidor já em UTC ISO-8601 com "Z" (ver criarSessaoMobile em
  // sessao.php) — sem isso, comparar string de timestamp do Postgres com a hora local do
  // aparelho é ambíguo e podia encurtar ou alongar as 24h de validade dependendo do fuso.
  const expiraEm = new Date(credenciais.tokenExpiraEm);
  if (Number.isNaN(expiraEm.getTime()) || expiraEm.getTime() <= Date.now()) return null;
  return credenciais;
}
