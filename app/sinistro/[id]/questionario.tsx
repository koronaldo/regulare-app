import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Campo } from '../../../src/components/form/Campo';
import { Selecao } from '../../../src/components/form/Selecao';
import {
  buscarPerguntas,
  limparResposta,
  listarQuestionariosDisponiveis,
  salvarExtrasResposta,
  salvarResposta,
  type GrupoPerguntas,
  type OpcaoQuestionario,
} from '../../../src/db/questionario';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { formatarCPF } from '../../../src/utils/documentos';

interface ExtrasPergunta {
  nome: string;
  cpf: string;
  comentario: string;
}

/** Uma subpergunta (resposta_ref preenchido) só aparece se a resposta que a ativa estiver marcada em alguma pergunta. */
function perguntaVisivel(respostaRef: string | null, respostasMarcadas: Set<number>): boolean {
  if (!respostaRef) return true;
  return respostaRef
    .split(',')
    .map((parte) => Number(parte.trim()))
    .some((id) => respostasMarcadas.has(id));
}

export default function QuestionarioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [questionarios, setQuestionarios] = useState<OpcaoQuestionario[]>([]);
  const [idProdques, setIdProdques] = useState('');
  const [grupos, setGrupos] = useState<GrupoPerguntas[]>([]);
  const [respostas, setRespostas] = useState<Record<number, number>>({});
  const [extras, setExtras] = useState<Record<number, ExtrasPergunta>>({});

  const carregarPerguntas = useCallback(async (idSinistroAtual: number, idProdquesAtual: string) => {
    if (!idProdquesAtual) {
      setGrupos([]);
      setRespostas({});
      setExtras({});
      return;
    }
    const lista = await buscarPerguntas(idSinistroAtual, Number(idProdquesAtual));
    setGrupos(lista);

    const novasRespostas: Record<number, number> = {};
    const novosExtras: Record<number, ExtrasPergunta> = {};
    for (const grupo of lista) {
      for (const pergunta of grupo.perguntas) {
        if (pergunta.id_resprod_selecionado != null) {
          novasRespostas[pergunta.id_perprod] = pergunta.id_resprod_selecionado;
        }
        novosExtras[pergunta.id_perprod] = {
          nome: pergunta.nome_terceiro,
          cpf: pergunta.cpf_terceiro,
          comentario: pergunta.comentario,
        };
      }
    }
    setRespostas(novasRespostas);
    setExtras(novosExtras);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const sinistro = await buscarSinistroPorId(idSinistro);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });

          const lista = await listarQuestionariosDisponiveis(sinistro?.id_seguradora ?? null, sinistro?.id_produto ?? null);
          if (cancelado) return;
          setQuestionarios(lista);

          const idInicial = lista.length > 0 ? String(lista[0].id_prodques) : '';
          setIdProdques(idInicial);
          await carregarPerguntas(idSinistro, idInicial);
        } finally {
          if (!cancelado) setCarregando(false);
        }
      }

      carregar();
      return () => {
        cancelado = true;
      };
    }, [idSinistro, carregarPerguntas]),
  );

  async function mudarQuestionario(valor: string) {
    setIdProdques(valor);
    setCarregando(true);
    try {
      await carregarPerguntas(idSinistro, valor);
    } finally {
      setCarregando(false);
    }
  }

  function todasPerguntas(): GrupoPerguntas['perguntas'] {
    return grupos.flatMap((g) => g.perguntas);
  }

  async function selecionarResposta(idPerprod: number, idResprod: number) {
    const respostasAntes = new Set(Object.values(respostas));
    const novasRespostas = { ...respostas, [idPerprod]: idResprod };
    const extrasPergunta = extras[idPerprod];

    setRespostas(novasRespostas);
    await salvarResposta(idSinistro, idPerprod, idResprod, {
      nomeTerceiro: extrasPergunta?.nome,
      cpfTerceiro: extrasPergunta?.cpf,
      comentario: extrasPergunta?.comentario,
    });

    // Limpa subperguntas que dependiam de uma resposta anterior e não se aplicam mais à nova seleção.
    const respostasDepois = new Set(Object.values(novasRespostas));
    if (respostasAntes.size > 0) {
      let respostasAtuais = novasRespostas;
      let mudou = true;
      while (mudou) {
        mudou = false;
        for (const pergunta of todasPerguntas()) {
          if (!pergunta.resposta_ref) continue;
          if (respostasAtuais[pergunta.id_perprod] == null) continue;
          if (!perguntaVisivel(pergunta.resposta_ref, respostasDepois)) {
            const respostaAnulada = respostasAtuais[pergunta.id_perprod];
            const { [pergunta.id_perprod]: _removida, ...resto } = respostasAtuais;
            respostasAtuais = resto;
            respostasDepois.delete(respostaAnulada);
            await limparResposta(idSinistro, pergunta.id_perprod);
            mudou = true;
          }
        }
      }
      setRespostas(respostasAtuais);
    }
  }

  function atualizarExtra(idPerprod: number, campo: keyof ExtrasPergunta, valor: string) {
    setExtras((atual) => ({
      ...atual,
      [idPerprod]: { ...(atual[idPerprod] ?? { nome: '', cpf: '', comentario: '' }), [campo]: valor },
    }));
  }

  async function salvarExtra(idPerprod: number) {
    const extrasPergunta = extras[idPerprod];
    if (!extrasPergunta) return;
    if (respostas[idPerprod] != null) {
      await salvarExtrasResposta(idSinistro, idPerprod, {
        nomeTerceiro: extrasPergunta.nome,
        cpfTerceiro: extrasPergunta.cpf,
        comentario: extrasPergunta.comentario,
      });
    }
  }

  function voltar() {
    router.back();
  }

  const respostasMarcadas = new Set(Object.values(respostas));

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
          <Text style={styles.headerTitulo}>Questionário</Text>
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

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        {questionarios.length === 0 && <Text style={styles.vazioTexto}>Nenhum questionário disponível.</Text>}

        {questionarios.length > 1 && (
          <Selecao
            label="Questionário"
            valor={idProdques}
            opcoes={questionarios.map((q) => ({ valor: q.id_prodques, label: q.nm_prodques }))}
            onChange={mudarQuestionario}
          />
        )}

        {grupos.map((grupo) => (
          <View key={grupo.id_grupoper} style={styles.grupoBloco}>
            {!!grupo.nm_grupoper && (
              <View style={styles.grupoCabecalho}>
                <Text style={styles.grupoTitulo}>{grupo.nm_grupoper}</Text>
              </View>
            )}

            {grupo.perguntas
              .filter((p) => perguntaVisivel(p.resposta_ref, respostasMarcadas))
              .map((pergunta) => (
                <View key={pergunta.id_perprod} style={styles.cardPergunta}>
                  <Text style={styles.perguntaTexto}>{pergunta.nm_perprod}</Text>

                  {pergunta.opcoes.map((opcao) => {
                    const marcada = respostas[pergunta.id_perprod] === opcao.id_resprod;
                    return (
                      <Pressable
                        key={opcao.id_resprod}
                        style={styles.opcaoLinha}
                        onPress={() => selecionarResposta(pergunta.id_perprod, opcao.id_resprod)}
                      >
                        <Ionicons
                          name={marcada ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={marcada ? '#1c3d5a' : '#a8b2bb'}
                        />
                        <Text style={styles.opcaoTexto}>{opcao.nm_resprod}</Text>
                      </Pressable>
                    );
                  })}

                  {pergunta.comenta && (
                    <Campo
                      label="Comentários"
                      multiline
                      numberOfLines={3}
                      style={styles.textarea}
                      value={extras[pergunta.id_perprod]?.comentario ?? ''}
                      onChangeText={(v) => atualizarExtra(pergunta.id_perprod, 'comentario', v)}
                      onBlur={() => salvarExtra(pergunta.id_perprod)}
                    />
                  )}

                  {pergunta.nomcpf && (
                    <>
                      <Campo
                        label="Nome"
                        value={extras[pergunta.id_perprod]?.nome ?? ''}
                        onChangeText={(v) => atualizarExtra(pergunta.id_perprod, 'nome', v)}
                        onBlur={() => salvarExtra(pergunta.id_perprod)}
                      />
                      <Campo
                        label="CPF"
                        keyboardType="numeric"
                        value={extras[pergunta.id_perprod]?.cpf ?? ''}
                        onChangeText={(v) => atualizarExtra(pergunta.id_perprod, 'cpf', formatarCPF(v))}
                        onBlur={() => salvarExtra(pergunta.id_perprod)}
                      />
                    </>
                  )}
                </View>
              ))}
          </View>
        ))}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  flex1: {
    flex: 1,
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
  grupoBloco: {
    marginBottom: 16,
  },
  grupoCabecalho: {
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  grupoTitulo: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cardPergunta: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  perguntaTexto: {
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 10,
  },
  opcaoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  opcaoTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontSize: 14,
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
});
