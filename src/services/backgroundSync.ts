import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { idsMensagensJaNotificadas, marcarMensagensNotificadas } from '../db/mensagens';
import { buscarMensagensPendentes } from './mensagens';
import { verificarNovosSinistros } from './verificaSinistros';

const NOME_TAREFA = 'regulare-verifica-sinistros';
const CANAL_ANDROID = 'sinistros-novos';
const CANAL_MENSAGENS = 'mensagens-novas';
const TIPO_NOTIFICACAO_MENSAGENS = 'mensagens';

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

    await verificarMensagensNovas();

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (erro) {
    console.log('[backgroundSync] falha na verificação:', erro);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Busca mensagens de broadcast pendentes (ver mensagens.ts) e notifica só as que ainda não
 * foram notificadas neste aparelho (mensagem_notificada, local) — sem isso, uma mensagem que o
 * usuário ainda não abriu voltaria a notificar a cada checagem periódica de 15 em 15 min.
 * Chamada tanto pela tarefa em segundo plano quanto pelo login (ver auth.ts).
 */
export async function verificarMensagensNovas(): Promise<void> {
  const pendentes = await buscarMensagensPendentes();
  if (pendentes.length === 0) return;

  const jaNotificadas = await idsMensagensJaNotificadas();
  const novas = pendentes.filter((m) => !jaNotificadas.has(m.id_mensagem));
  if (novas.length === 0) return;

  await notificarMensagensNovas(novas.length);
  await marcarMensagensNotificadas(novas.map((m) => m.id_mensagem));
}

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

/**
 * Notifica (com vibração) que existem mensagens novas do servidor — mesmo padrão de
 * notificarSinistrosNovos. Leva o tipo 'mensagens' em `data` pra configurarRespostaNotificacoes
 * saber pra onde navegar quando o usuário tocar na notificação.
 */
export async function notificarMensagensNovas(quantidade: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Novas mensagens',
      body: quantidade === 1 ? 'Você tem uma nova mensagem.' : `Você tem ${quantidade} novas mensagens.`,
      data: { tipo: TIPO_NOTIFICACAO_MENSAGENS },
      vibrate: [0, 250, 250, 250],
      ...(Platform.OS === 'android' ? { channelId: CANAL_MENSAGENS } : null),
    },
    trigger: null,
  });
}

/** Pede permissão de notificação e cria os canais Android com vibração. Chamar na abertura do app. */
export async function configurarNotificacoes(): Promise<void> {
  await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });

  await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'Sinistros novos',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1c3d5a',
  });

  await Notifications.setNotificationChannelAsync(CANAL_MENSAGENS, {
    name: 'Mensagens novas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1c3d5a',
  });
}

/**
 * Registra o listener de toque na notificação: se for do tipo 'mensagens', abre a tela de
 * Mensagens. Chamar uma vez na raiz do app (_layout.tsx).
 */
export function configurarRespostaNotificacoes(): () => void {
  const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
    const tipo = resposta.notification.request.content.data?.tipo;
    if (tipo === TIPO_NOTIFICACAO_MENSAGENS) {
      router.push('/mensagens');
    }
  });
  return () => assinatura.remove();
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
