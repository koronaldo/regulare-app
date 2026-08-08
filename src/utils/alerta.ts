import { Alert, Platform } from 'react-native';

interface BotaoAlerta {
  text: string;
  onPress?: () => void;
}

/**
 * Alert.alert do react-native-web é um no-op (`static alert() {}`), então nada aparece
 * ao testar pelo navegador. Aqui usamos window.alert no web (que bloqueia a execução até
 * o usuário fechar, então dá pra disparar o callback do botão logo em seguida) e o Alert
 * nativo nas demais plataformas.
 */
export function mostrarAlerta(titulo: string, mensagem?: string, botoes?: BotaoAlerta[]) {
  if (Platform.OS === 'web') {
    window.alert(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
    const ultimoBotao = botoes?.[botoes.length - 1];
    ultimoBotao?.onPress?.();
    return;
  }

  Alert.alert(titulo, mensagem, botoes);
}
