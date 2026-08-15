import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listarAtasDisponiveis, type AtaDisponivel } from '../../../src/db/atas';
import { buscarSinistroPorId } from '../../../src/db/sinistros';

export default function AtasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [atas, setAtas] = useState<AtaDisponivel[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, lista] = await Promise.all([buscarSinistroPorId(idSinistro), listarAtasDisponiveis(idSinistro)]);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setAtas(lista);
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      carregar();
      return () => {
        cancelado = true;
      };
    }, [idSinistro]),
  );

  function abrirAta(ata: AtaDisponivel) {
    router.push({
      pathname: '/sinistro/[id]/atas/[idModata]',
      params: { id: String(idSinistro), idModata: String(ata.id_modata), nome: ata.nome },
    });
  }

  function voltar() {
    router.back();
  }

  if (carregando) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#1c3d5a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo}>Atas & Termos</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoVoltar}
        >
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]/transferencia', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoVoltar}
        >
          <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        {atas.length === 0 && (
          <Text style={styles.vazioTexto}>Nenhum modelo de ata configurado para esta seguradora/produto.</Text>
        )}

        {atas.map((ata) => (
          <Pressable key={ata.id_modata} style={styles.card} onPress={() => abrirAta(ata)}>
            <Ionicons
              name={ata.assinada ? 'checkmark-circle' : 'document-text-outline'}
              size={26}
              color={ata.assinada ? '#2e7d32' : '#1c3d5a'}
            />
            <Text style={styles.cardTexto} numberOfLines={2}>
              {ata.nome}
            </Text>
            <Text style={[styles.cardStatus, ata.assinada && styles.cardStatusAssinada]}>
              {ata.assinada ? 'Assinada' : 'Não assinada'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#8a97a3" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f6f8',
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  botaoVoltar: {
    marginTop: 2,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitulo: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitulo: {
    color: '#9db3c7',
    fontSize: 13,
    marginTop: 2,
  },
  conteudo: {
    padding: 16,
    paddingBottom: 24,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
  },
  cardStatus: {
    color: '#8a97a3',
    fontSize: 12,
    fontWeight: '600',
  },
  cardStatusAssinada: {
    color: '#2e7d32',
  },
});
