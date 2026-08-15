import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { buscarLogs, type LogRegistro } from '../src/db/logs';

const ICONE_POR_ACAO: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Importado o aplicativo': 'download-outline',
  'Vistoria realizada': 'checkmark-done-outline',
  'Transferido para servidor': 'cloud-upload-outline',
};

function formatarDataHora(dataHora: string): string {
  const [data, hora] = dataHora.split(' ');
  if (!data) return dataHora;
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

export default function LogsScreen() {
  const [busca, setBusca] = useState('');
  const [registros, setRegistros] = useState<LogRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      try {
        const lista = await buscarLogs(busca);
        if (!cancelado) setRegistros(lista);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    const timeout = setTimeout(carregar, 250);
    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [busca]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitulo}>Consultar Logs</Text>
      </View>

      <View style={styles.buscaContainer}>
        <Ionicons name="search-outline" size={18} color="#8a97a3" />
        <TextInput
          style={styles.buscaInput}
          placeholder="Número do processo ou nome do segurado..."
          value={busca}
          onChangeText={setBusca}
          autoCapitalize="none"
        />
        {busca.length > 0 && (
          <Pressable onPress={() => setBusca('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color="#8a97a3" />
          </Pressable>
        )}
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color="#1c3d5a" />
        </View>
      ) : (
        <FlatList
          data={registros}
          keyExtractor={(item) => String(item.id_log)}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <View style={styles.centro}>
              <Ionicons name="document-text-outline" size={40} color="#c2ccd6" />
              <Text style={styles.vazioTexto}>Nenhum registro encontrado.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTopo}>
                <Ionicons name={ICONE_POR_ACAO[item.acao] ?? 'time-outline'} size={18} color="#1c3d5a" />
                <Text style={styles.cardAcao}>{item.acao}</Text>
              </View>
              <Text style={styles.cardLinha}>
                Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                {item.nm_segurado ? `  ·  ${item.nm_segurado}` : ''}
              </Text>
              <Text style={styles.cardData}>{formatarDataHora(item.data_hora)}</Text>
            </View>
          )}
        />
      )}
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
    gap: 12,
  },
  botaoVoltar: {
    marginTop: 2,
  },
  headerTitulo: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  buscaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e3e8ed',
  },
  buscaInput: {
    flex: 1,
    fontSize: 14,
  },
  lista: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
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
  cardAcao: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  cardLinha: {
    fontSize: 13,
    color: '#48545e',
    marginTop: 2,
  },
  cardDestaque: {
    color: '#2a88ad',
    fontWeight: '600',
  },
  cardData: {
    fontSize: 12,
    color: '#8a97a3',
    marginTop: 6,
  },
});
