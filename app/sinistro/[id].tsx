import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buscarPermissoesBotoes,
  buscarSinistroPorId,
  marcarSinistroVisto,
  temQuestionario,
  type SinistroDetalhe,
} from '../../src/db/sinistros';
import { mostrarAlerta } from '../../src/utils/alerta';

/** Porta de MontaControle (controle_def.js): botão -> tela alvo (ainda não implementada nesta etapa). */
const BOTOES: { chave: string; label: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { chave: 'cadastro', label: 'Cadastro Geral', icone: 'create-outline' },
  { chave: 'relato', label: 'Relato Segurado', icone: 'chatbubble-ellipses-outline' },
  { chave: 'parecer', label: 'Constatações do regulador', icone: 'pencil-outline' },
  { chave: 'informacoes', label: 'Inf. Gerais e Benfeitorias', icone: 'checkmark-circle-outline' },
  { chave: 'coberturas', label: 'Coberturas', icone: 'lock-closed-outline' },
  { chave: 'beneficia', label: 'Beneficiários', icone: 'people-outline' },
  { chave: 'planilha', label: 'Planilha Apuração', icone: 'clipboard-outline' },
  { chave: 'outro', label: 'Outros Seguros', icone: 'file-tray-stacked-outline' },
  { chave: 'fotos', label: 'Álbum de Fotos', icone: 'camera-outline' },
  { chave: 'docs', label: 'Relação Documentos', icone: 'folder-outline' },
  { chave: 'despesas', label: 'Despesas Viagem', icone: 'receipt-outline' },
  { chave: 'videos', label: 'Vídeos e Áudios', icone: 'videocam-outline' },
  { chave: 'preliminar', label: 'Atas & Termos', icone: 'document-attach-outline' },
  { chave: 'apolice', label: 'Apólice & Cond. Geral', icone: 'reader-outline' },
];

export default function SinistroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [sinistro, setSinistro] = useState<SinistroDetalhe | null>(null);
  const [permissoes, setPermissoes] = useState<Record<string, boolean>>({});
  const [mostraQuestionario, setMostraQuestionario] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [dados, botoes] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            buscarPermissoesBotoes(idSinistro),
          ]);
          if (cancelado) return;

          setSinistro(dados);
          setPermissoes(botoes);

          if (dados) {
            const questoes = await temQuestionario(dados.id_seguradora, dados.id_produto);
            if (!cancelado) setMostraQuestionario(questoes);
          }

          await marcarSinistroVisto(idSinistro);
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

  const botoesVisiveis = mostraQuestionario
    ? [...BOTOES, { chave: 'questionario', label: 'Questionários', icone: 'help-circle-outline' as const }]
    : BOTOES;

  function acionarBotao(chave: string, label: string) {
    if (permissoes[chave] === false) return;

    if (chave === 'cadastro') {
      router.push({ pathname: '/sinistro/[id]/cadastro', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'relato' || chave === 'parecer') {
      const texto = chave === 'relato' ? '4' : '5';
      router.push({ pathname: '/sinistro/[id]/relato', params: { id: String(idSinistro), texto } });
      return;
    }

    if (chave === 'informacoes') {
      router.push({ pathname: '/sinistro/[id]/informacoes', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'coberturas') {
      router.push({ pathname: '/sinistro/[id]/coberturas', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'beneficia') {
      router.push({ pathname: '/sinistro/[id]/beneficiarios', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'planilha') {
      router.push({ pathname: '/sinistro/[id]/planilha', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'outro') {
      router.push({ pathname: '/sinistro/[id]/outros', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'fotos') {
      router.push({ pathname: '/sinistro/[id]/fotos', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'docs') {
      router.push({ pathname: '/sinistro/[id]/documentos', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'despesas') {
      router.push({ pathname: '/sinistro/[id]/despesas', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'videos') {
      router.push({ pathname: '/sinistro/[id]/videos', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'apolice') {
      router.push({ pathname: '/sinistro/[id]/apolice', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'preliminar') {
      router.push({ pathname: '/sinistro/[id]/atas', params: { id: String(idSinistro) } });
      return;
    }

    if (chave === 'questionario') {
      router.push({ pathname: '/sinistro/[id]/questionario', params: { id: String(idSinistro) } });
      return;
    }

    mostrarAlerta(label, 'Esta funcionalidade ainda será implementada em uma próxima etapa.');
  }

  function transferirDados() {
    router.push({ pathname: '/sinistro/[id]/transferencia', params: { id: String(idSinistro) } });
  }

  if (carregando) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#1c3d5a" />
      </View>
    );
  }

  if (!sinistro) {
    return (
      <View style={styles.centro}>
        <StatusBar style="dark" />
        <Text style={styles.vazioTexto}>Processo não encontrado no banco local.</Text>
        <Pressable style={styles.botaoVoltarVazio} onPress={() => router.back()}>
          <Text style={styles.botaoVoltarTexto}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerLabel}>Segurado</Text>
          <Text style={styles.headerValue} numberOfLines={1}>
            {sinistro.nm_segurado || '-'}
          </Text>
          <Text style={styles.headerLabel}>Sinistro</Text>
          <Text style={styles.headerValue} numberOfLines={1}>
            {sinistro.nro_sinistro} · {sinistro.nm_seguradora}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        {botoesVisiveis.map((botao) => {
          const habilitado = permissoes[botao.chave] !== false;
          return (
            <Pressable
              key={botao.chave}
              style={[styles.botao, !habilitado && styles.botaoDesabilitado]}
              onPress={() => acionarBotao(botao.chave, botao.label)}
              disabled={!habilitado}
            >
              <Ionicons name={botao.icone} size={28} color={habilitado ? '#1c3d5a' : '#c2ccd6'} />
              <Text style={[styles.botaoTexto, !habilitado && styles.botaoTextoDesabilitado]}>
                {botao.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={styles.botaoTransferir} onPress={transferirDados}>
          <Ionicons name="radio-outline" size={20} color="#fff" />
          <Text style={styles.botaoTransferirTexto}>Transferir para o servidor</Text>
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
    gap: 12,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
  },
  botaoVoltarVazio: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1c3d5a',
    borderRadius: 8,
  },
  botaoVoltarTexto: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 18,
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
  headerLabel: {
    color: '#9db3c7',
    fontSize: 11,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  headerValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  grid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  botao: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  botaoDesabilitado: {
    backgroundColor: '#f0f2f4',
  },
  botaoTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1c3d5a',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  botaoTextoDesabilitado: {
    color: '#a8b2bb',
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
    fontSize: 14,
  },
});
