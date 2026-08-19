import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';

import { buscarMensagensPendentes, confirmarLeituraMensagem, type MensagemBroadcast } from '../src/services/mensagens';

function formatarDataHora(dataHora: string): string {
  const [data, hora] = dataHora.split(' ');
  if (!data) return dataHora;
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

export default function MensagensScreen() {
  const [carregando, setCarregando] = useState(true);
  const [mensagens, setMensagens] = useState<MensagemBroadcast[]>([]);
  const [aberta, setAberta] = useState<MensagemBroadcast | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await buscarMensagensPendentes();
      setMensagens(lista);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function abrirMensagem(mensagem: MensagemBroadcast) {
    setAberta(mensagem);
    setConfirmando(true);
    try {
      await confirmarLeituraMensagem(mensagem.id_mensagem);
      setMensagens((atual) => atual.filter((m) => m.id_mensagem !== mensagem.id_mensagem));
    } finally {
      setConfirmando(false);
    }
  }

  function voltar() {
    router.back();
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitulo}>Mensagens</Text>
        <Pressable onPress={carregar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </Pressable>
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color="#1c3d5a" />
        </View>
      ) : (
        <FlatList
          data={mensagens}
          keyExtractor={(item) => String(item.id_mensagem)}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <View style={styles.centro}>
              <Ionicons name="mail-open-outline" size={40} color="#c2ccd6" />
              <Text style={styles.vazioTexto}>Nenhuma mensagem nova.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => abrirMensagem(item)}>
              <View style={styles.cardTopo}>
                <Ionicons name="mail-unread-outline" size={18} color="#1c3d5a" />
                <Text style={styles.cardTitulo} numberOfLines={1}>
                  {item.titulo}
                </Text>
              </View>
              <Text style={styles.cardCorpo} numberOfLines={2}>
                {item.corpo}
              </Text>
              <Text style={styles.cardData}>{formatarDataHora(item.data_criacao)}</Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!aberta} transparent animationType="fade" onRequestClose={() => setAberta(null)}>
        <Pressable style={styles.modalFundo} onPress={() => setAberta(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {aberta && (
              <>
                <Text style={styles.modalTitulo}>{aberta.titulo}</Text>
                <Text style={styles.modalData}>{formatarDataHora(aberta.data_criacao)}</Text>
                <ScrollView>
                  <Text style={styles.modalCorpo}>{aberta.corpo}</Text>
                </ScrollView>
                <Pressable style={styles.botaoFechar} onPress={() => setAberta(null)} disabled={confirmando}>
                  <Text style={styles.botaoFecharTexto}>Fechar</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botaoVoltar: {
    marginTop: 2,
  },
  headerTitulo: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
  },
  lista: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1c3d5a',
  },
  cardTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitulo: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  cardCorpo: {
    fontSize: 13,
    color: '#48545e',
    marginTop: 2,
  },
  cardData: {
    fontSize: 12,
    color: '#8a97a3',
    marginTop: 6,
  },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
  },
  modalTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  modalData: {
    fontSize: 12,
    color: '#8a97a3',
    marginTop: 2,
    marginBottom: 12,
  },
  modalCorpo: {
    fontSize: 14,
    color: '#3a4650',
    lineHeight: 20,
  },
  botaoFechar: {
    marginTop: 18,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botaoFecharTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
