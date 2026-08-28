import * as SecureStore from 'expo-secure-store';

const CHAVE_FOTO_PENDENTE = 'regulare_foto_pendente';

export interface FotoPendente {
  idSinistro: number;
  idLegenda: string;
}

/**
 * No Android o sistema pode destruir a MainActivity enquanto a câmera está aberta (pressão de
 * memória) — quando isso acontece, todo o estado da tela de fotos se perde, inclusive a legenda
 * que o usuário tinha escolhido, e a foto recém tirada ficaria órfã.
 *
 * O expo-image-picker devolve a foto depois, via getPendingResultAsync(), mas não guarda nada
 * nosso junto. Então a legenda escolhida fica aqui, fora da memória do processo, e é lida de
 * volta ao remontar a tela. Ver ImagePicker.getPendingResultAsync na documentação do Expo.
 */
export async function salvarFotoPendente(pendente: FotoPendente): Promise<void> {
  try {
    await SecureStore.setItemAsync(CHAVE_FOTO_PENDENTE, JSON.stringify(pendente));
  } catch {
    // Falhar aqui só significa perder a recuperação automática — a captura em si continua.
  }
}

export async function lerFotoPendente(): Promise<FotoPendente | null> {
  try {
    const bruto = await SecureStore.getItemAsync(CHAVE_FOTO_PENDENTE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as FotoPendente;
    return typeof dados?.idSinistro === 'number' && typeof dados?.idLegenda === 'string' ? dados : null;
  } catch {
    return null;
  }
}

export async function limparFotoPendente(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CHAVE_FOTO_PENDENTE);
  } catch {
    // idem: não impede o fluxo normal.
  }
}
