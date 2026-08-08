import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Secao } from '../../../src/components/form/Secao';
import { buscarRelato, salvarRelato, type SubtextoRelato } from '../../../src/db/relato';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';

/** Porta de ProximaTela (relsegurado_def.js): Relato (4) -> Constatações/Parecer (5) -> Controle. */
const PROXIMO_TEXTO: Record<number, number | null> = { 4: 5, 5: null };

const MENSAGEM_PLACEHOLDER =
  'O(s) texto(s) possui(em) vários pontos de interrogação ou reticência que deve(m) ser substituído por textos complementares do Regulador.';

export default function RelatoScreen() {
  const { id, texto } = useLocalSearchParams<{ id: string; texto: string }>();
  const idSinistro = Number(id);
  const idTexto = Number(texto);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [subtextos, setSubtextos] = useState<SubtextoRelato[]>([]);
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [sujo, setSujo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro || !idTexto) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, relato] = await Promise.all([buscarSinistroPorId(idSinistro), buscarRelato(idSinistro, idTexto)]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setTitulo(relato.titulo);
          setSubtextos(relato.subtextos);
          setRespostas(Object.fromEntries(relato.subtextos.map((s) => [s.id_mobile, s.resposta])));
          setSujo(false);
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      carregar();
      return () => {
        cancelado = true;
      };
    }, [idSinistro, idTexto]),
  );

  function atualizarResposta(idMobile: number, valor: string) {
    setRespostas((atual) => ({ ...atual, [idMobile]: valor }));
    setSujo(true);
  }

  function validarPlaceholders(): boolean {
    const pendente = subtextos.some((s) => {
      const v = respostas[s.id_mobile] ?? '';
      return v.includes('???') || v.includes('....');
    });
    if (pendente) {
      mostrarAlerta('Texto incompleto', MENSAGEM_PLACEHOLDER);
    }
    return !pendente;
  }

  function avancar() {
    const proximoTexto = PROXIMO_TEXTO[idTexto];
    if (proximoTexto) {
      router.replace({ pathname: '/sinistro/[id]/relato', params: { id: String(idSinistro), texto: String(proximoTexto) } });
      return;
    }
    if (idTexto === 5) {
      // Porta de ProximaTela (relsegurado_def.js): de Constatações (5) vai para Informações Gerais.
      router.replace({ pathname: '/sinistro/[id]/informacoes', params: { id: String(idSinistro) } });
      return;
    }
    router.back();
  }

  async function salvar() {
    if (!validarPlaceholders()) return;

    setSalvando(true);
    try {
      await salvarRelato(
        idSinistro,
        idTexto,
        subtextos.map((s) => ({ id_mobile: s.id_mobile, resposta: respostas[s.id_mobile] ?? '' })),
      );
      setSujo(false);
      avancar();
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando Relato segurado');
    } finally {
      setSalvando(false);
    }
  }

  function voltar() {
    if (sujo) {
      mostrarAlerta('Tela em edição', 'Clique em Salvar antes de voltar.');
      return;
    }
    router.back();
  }

  function proximo() {
    if (!validarPlaceholders()) return;
    if (sujo) {
      mostrarAlerta('Tela em edição', 'Clique em Salvar antes de continuar.');
      return;
    }
    avancar();
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

      <View style={styles.header}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo}>{titulo || (idTexto === 5 ? 'Constatações do Regulador' : 'Relato do Segurado')}</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {subtextos.length === 0 && <Text style={styles.vazioTexto}>Nenhum registro encontrado.</Text>}

        {subtextos.map((s) => (
          <Secao key={s.id_mobile} titulo={s.nm_mobile}>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              value={respostas[s.id_mobile] ?? ''}
              onChangeText={(v) => atualizarResposta(s.id_mobile, v)}
            />
          </Secao>
        ))}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={[styles.botaoRodape, styles.botaoNeutro]} onPress={voltar}>
          <Ionicons name="chevron-back" size={20} color="#1c3d5a" />
          <Text style={styles.botaoRodapeTexto}>Anterior</Text>
        </Pressable>
        <Pressable style={[styles.botaoRodape, styles.botaoSalvar]} onPress={salvar} disabled={salvando}>
          {salvando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
              <Text style={styles.botaoSalvarTexto}>Salvar</Text>
            </>
          )}
        </Pressable>
        <Pressable style={[styles.botaoRodape, styles.botaoNeutro]} onPress={proximo}>
          <Text style={styles.botaoRodapeTexto}>Próximo</Text>
          <Ionicons name="chevron-forward" size={20} color="#1c3d5a" />
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
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#dde3e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    minHeight: 120,
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e6e9ec',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  botaoRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  botaoNeutro: {
    backgroundColor: '#eef2f5',
  },
  botaoRodapeTexto: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 13,
  },
  botaoSalvar: {
    flex: 1,
    backgroundColor: '#1c3d5a',
    paddingHorizontal: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  botaoSalvarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
