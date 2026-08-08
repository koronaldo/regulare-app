import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { verificarNovosSinistros } from './verificaSinistros';

const NOME_TAREFA = 'regulare-verifica-sinistros';
const CANAL_ANDROID = 'sinistros-novos';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

TaskManager.defineTask(NOME_TAREFA, async () => {
  try {
    const novos = await verificarNovosSinistros();
    console.log(`[backgroundSync] verificação rodou, ${novos.length} sinistro(s) novo(s)`);
    if (novos.length > 0) {
      await notificarSinistrosNovos(novos.length);
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (erro) {
    console.log('[backgroundSync] falha na verificação:', erro);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Notifica (com vibração) que existem processos novos — usada tanto pela checagem
 * periódica em segundo plano quanto pelo login (ver auth.ts), com app ativo ou minimizado:
 * uma notificação local aparece nos dois casos, só a tarefa periódica em si (o agendamento
 * de 15 em 15 min) que não roda com o app em primeiro plano.
 */
export async function notificarSinistrosNovos(quantidade: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Novos processos',
      body:
        quantidade === 1
          ? 'Você possui um novo processo.'
          : `Você possui ${quantidade} novos processos.`,
      vibrate: [0, 250, 250, 250],
      ...(Platform.OS === 'android' ? { channelId: CANAL_ANDROID } : null),
    },
    trigger: null,
  });
}

/** Pede permissão de notificação e cria o canal Android com vibração. Chamar na abertura do app. */
export async function configurarNotificacoes(): Promise<void> {
  await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });

  await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'Sinistros novos',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1c3d5a',
  });
}

/**
 * Registra a checagem periódica de sinistros novos. Chamado após login. O mínimo permitido
 * pelo Android/iOS é 15 minutos — o sistema operacional decide o intervalo real (nunca é
 * garantido rodar exatamente nesse tempo, principalmente com o app fechado).
 */
export async function registrarVerificacaoPeriodica(): Promise<void> {
  const jaRegistrada = await TaskManager.isTaskRegisteredAsync(NOME_TAREFA);
  if (jaRegistrada) return;

  await BackgroundTask.registerTaskAsync(NOME_TAREFA, { minimumInterval: 15 });
}

/** Cancela a checagem periódica — chamar no logout. */
export async function cancelarVerificacaoPeriodica(): Promise<void> {
  const jaRegistrada = await TaskManager.isTaskRegisteredAsync(NOME_TAREFA);
  if (!jaRegistrada) return;

  await BackgroundTask.unregisterTaskAsync(NOME_TAREFA);
}
