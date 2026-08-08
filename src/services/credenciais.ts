import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CHAVE_CREDENCIAIS = 'regulare_credenciais';

export interface Credenciais {
  usuario: string;
  senhaEnvio: string;
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
