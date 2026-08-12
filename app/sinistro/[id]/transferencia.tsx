import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ID_TIPOTRANS_INFORMACOES,
  informacoesCompletas,
  listarStatusTransferencia,
  type ItemTransferencia,
} from '../../../src/db/transferencia';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';

export default function TransferenciaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [itens, setItens] = useState<ItemTransferencia[]>([]);
  const [informacoesOk, setInformacoesOk] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, lista, completas] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            listarStatusTransferencia(idSinistro),
            informacoesCompletas(idSinistro),
          ]);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setItens(lista);
          setInformacoesOk(completas);
          setSelecionados(new Set(lista.filter((item) => item.status_trans !== 'S').map((item) => item.id_tipotrans)));
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

  function alternarSelecao(idTipotrans: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(idTipotrans)) {
        novo.delete(idTipotrans);
      } else {
        novo.add(idTipotrans);
      }
      return novo;
    });
  }

  function transferir() {
    if (selecionados.size === 0) {
      mostrarAlerta('Nada selecionado', 'Selecione ao menos um item para transferir.');
      return;
    }
    mostrarAlerta('Transferir para o servidor', 'Esta funcionalidade ainda será implementada em uma próxima etapa.');
  }

  function voltar() {
    router.back();
  }

  function statusVisual(item: ItemTransferencia): { icone: keyof typeof Ionicons.glyphMap; cor: string; texto: string } {
    if (item.status_trans === 'S') return { icone: 'checkmark-circle', cor: '#2e7d32', texto: 'OK' };
    if (item.status_trans === 'E') return { icone: 'close-circle', cor: '#d32f2f', texto: 'Erro' };
    return { icone: 'time-outline', cor: '#8a97a3', texto: 'Pendente' };
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
          <Text style={styles.headerTitulo}>Transferência</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.instrucao}>Selecione os itens e toque em Transferir</Text>

        {itens.map((item) => {
          const selecionado = selecionados.has(item.id_tipotrans);
          const status = statusVisual(item);
          const obrigatorio = item.id_tipotrans === ID_TIPOTRANS_INFORMACOES && !informacoesOk;
          return (
            <View key={item.id_tipotrans} style={styles.linha}>
              <Switch
                value={selecionado}
                onValueChange={() => alternarSelecao(item.id_tipotrans)}
                trackColor={{ true: '#1c3d5a' }}
              />
              <View style={styles.linhaTexto}>
                <Text style={styles.linhaLabel}>{item.nm_tipotrans}</Text>
                {obrigatorio && <Text style={styles.linhaObrigatorio}>Obrigatório</Text>}
              </View>
              <View style={styles.linhaStatus}>
                <Ionicons name={status.icone} size={18} color={status.cor} />
                <Text style={[styles.linhaStatusTexto, { color: status.cor }]}>{status.texto}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={styles.botaoTransferir} onPress={transferir}>
          <Ionicons name="radio-outline" size={20} color="#fff" />
          <Text style={styles.botaoTransferirTexto}>Transferir</Text>
        </Pressable>
      </View>
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
  instrucao: {
    color: '#8a97a3',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  linhaTexto: {
    flex: 1,
  },
  linhaLabel: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
  },
  linhaObrigatorio: {
    color: '#d32f2f',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  linhaStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linhaStatusTexto: {
    fontSize: 12,
    fontWeight: '700',
  },
  rodape: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f5',
  },
  botaoTransferir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 14,
  },
  botaoTransferirTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
