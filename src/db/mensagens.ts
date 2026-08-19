import { getDb } from './client';

/** Ids de mensagem_broadcast já notificadas neste aparelho — ver notificarMensagensNovas em backgroundSync.ts. */
export async function idsMensagensJaNotificadas(): Promise<Set<number>> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ id_mensagem: number }>('select id_mensagem from mensagem_notificada');
  return new Set(linhas.map((l) => l.id_mensagem));
}

export async function marcarMensagensNotificadas(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('insert or ignore into mensagem_notificada (id_mensagem) values (?)', [id]);
    }
  });
}
