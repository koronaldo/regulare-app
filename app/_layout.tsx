import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configurarNotificacoes, registrarVerificacaoPeriodica, testarVerificacaoAgora } from '../src/services/backgroundSync';
import { lerCredenciais } from '../src/services/credenciais';
import { inicializarBancoLocal } from '../src/db/schema';

export default function RootLayout() {
  useEffect(() => {
    inicializarBancoLocal().catch((error) => {
      console.error('Erro inicializando banco local:', error);
    });

    configurarNotificacoes().catch((error) => {
      console.log('Erro configurando notificações:', error);
    });

    // iOS não mantém o agendamento entre aberturas do app — reregistra se já havia login.
    lerCredenciais()
      .then((credenciais) => {
        if (credenciais) return registrarVerificacaoPeriodica();
      })
      .catch((error) => {
        console.log('Erro reregistrando verificação periódica:', error);
      });

    // TESTE TEMPORÁRIO: força a tarefa a rodar agora, sem esperar o SO decidir o horário.
    testarVerificacaoAgora().catch((error) => {
      console.log('[teste] falha forçando verificação:', error);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
