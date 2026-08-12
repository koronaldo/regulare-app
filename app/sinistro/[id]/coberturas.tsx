import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Campo } from '../../../src/components/form/Campo';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import {
  OPCOES_TIPO_COBERTURA,
  excluirCobertura,
  listarCoberturas,
  listarCoberturasPorTipo,
  salvarCobertura,
  verificarPendenciasCobertura,
  type CoberturaResumo,
  type DadosCobertura,
} from '../../../src/db/coberturas';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { formatarMoeda, formatarMoedaDigitado, paraNumeroMoeda } from '../../../src/utils/moeda';
import { formatarPercentual, formatarPercentualDigitado, paraNumeroPercentual } from '../../../src/utils/percentual';

const OPCOES_DESTINO_LMI: OpcaoSelecao[] = [
  { valor: 'VER', label: 'Verba Única' },
  { valor: 'POR', label: 'Porteira Fechada - Propriedade Rural' },
];

const OPCOES_RISCO: OpcaoSelecao[] = [
  { valor: 'E', label: 'Excluído' },
  { valor: 'N', label: 'Coberto' },
  { valor: 'A', label: 'A verificar' },
  { valor: 'R', label: 'RF com termo' },
];

interface FormCobertura {
  id_sinicob: number | null;
  id_cobertura_anterior: number | null;
  tipo_cob: string;
  id_cobertura: string;
  destino_lmi: string;
  perc_predio: string;
  perc_conteudo: string;
  item_apolice: string;
  nro_cob: string;
  complemento: string;
  vlr_cobertura: string;
  perc_franquia: string;
  vlr_franquia: string;
  vlr_cob_estima: string;
  reclamado: string;
}

const FORM_VAZIO: FormCobertura = {
  id_sinicob: null,
  id_cobertura_anterior: null,
  tipo_cob: '',
  id_cobertura: '',
  destino_lmi: '',
  perc_predio: '',
  perc_conteudo: '',
  item_apolice: '',
  nro_cob: '',
  complemento: '',
  vlr_cobertura: '',
  perc_franquia: '',
  vlr_franquia: '',
  vlr_cob_estima: '',
  reclamado: '',
};

function formInicial(c: CoberturaResumo): FormCobertura {
  return {
    id_sinicob: c.id_sinicob,
    id_cobertura_anterior: c.id_cobertura,
    tipo_cob: c.tipo_cob,
    id_cobertura: String(c.id_cobertura),
    destino_lmi: c.verba_unica ? 'VER' : c.porteira ? 'POR' : '',
    perc_predio: formatarPercentual(c.perc_predio),
    perc_conteudo: formatarPercentual(c.perc_conteudo),
    item_apolice: c.item_apolice,
    nro_cob: c.nro_cob,
    complemento: c.complemento,
    vlr_cobertura: formatarMoeda(c.vlr_cobertura),
    perc_franquia: formatarPercentual(c.perc_franquia),
    vlr_franquia: formatarMoeda(c.vlr_franquia),
    vlr_cob_estima: formatarMoeda(c.vlr_cob_estima),
    reclamado: c.reclamado,
  };
}

export default function CoberturasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [coberturas, setCoberturas] = useState<CoberturaResumo[]>([]);
  const [form, setForm] = useState<FormCobertura | null>(null);
  const [opcoesCoberturaDoTipo, setOpcoesCoberturaDoTipo] = useState<OpcaoSelecao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroCampo, setErroCampo] = useState<{ campo: keyof FormCobertura; mensagem: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const refTipoCob = useRef<View>(null);
  const refIdCobertura = useRef<View>(null);
  const refVlrCobertura = useRef<TextInput>(null);
  const refPercFranquia = useRef<TextInput>(null);
  const refVlrFranquia = useRef<TextInput>(null);
  const refVlrCobEstima = useRef<TextInput>(null);
  const refReclamado = useRef<View>(null);

  function erroDoCampo(campo: keyof FormCobertura): string | undefined {
    return erroCampo?.campo === campo ? erroCampo.mensagem : undefined;
  }

  function focarCampoComErro(campo: keyof FormCobertura, mensagem: string) {
    setErroCampo({ campo, mensagem });

    const refsPorCampo: Partial<Record<keyof FormCobertura, RefObject<TextInput | View | null>>> = {
      tipo_cob: refTipoCob,
      id_cobertura: refIdCobertura,
      vlr_cobertura: refVlrCobertura,
      perc_franquia: refPercFranquia,
      vlr_franquia: refVlrFranquia,
      vlr_cob_estima: refVlrCobEstima,
      reclamado: refReclamado,
    };

    const el = refsPorCampo[campo]?.current;
    const elHandle = el ? findNodeHandle(el) : null;
    const scrollHandle = scrollRef.current ? findNodeHandle(scrollRef.current) : null;
    if (elHandle && scrollHandle) {
      UIManager.measureLayout(
        elHandle,
        scrollHandle,
        () => {},
        (_x, y) => {
          scrollRef.current?.scrollTo({ y: Math.max(y - 24, 0), animated: true });
        },
      );
    }
    if (el && 'focus' in el && typeof el.focus === 'function') {
      setTimeout(() => el.focus(), 400);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, lista] = await Promise.all([buscarSinistroPorId(idSinistro), listarCoberturas(idSinistro)]);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setCoberturas(lista);
          setForm(null);
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

  function novaCobertura() {
    setOpcoesCoberturaDoTipo([]);
    setErroCampo(null);
    setForm(FORM_VAZIO);
  }

  async function editarCobertura(c: CoberturaResumo) {
    const opcoes = await listarCoberturasPorTipo(c.tipo_cob);
    setOpcoesCoberturaDoTipo(opcoes);
    setErroCampo(null);
    setForm(formInicial(c));
  }

  async function mudarTipo(tipo: string) {
    setForm((atual) => (atual ? { ...atual, tipo_cob: tipo, id_cobertura: '' } : atual));
    setErroCampo((atual) => (atual?.campo === 'tipo_cob' ? null : atual));
    const opcoes = await listarCoberturasPorTipo(tipo);
    setOpcoesCoberturaDoTipo(opcoes);
  }

  function atualizarCampo<K extends keyof FormCobertura>(campo: K, valor: FormCobertura[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    setErroCampo((atual) => (atual?.campo === campo ? null : atual));
  }

  function validar(f: FormCobertura): { campo: keyof FormCobertura; mensagem: string } | null {
    if (!f.tipo_cob) return { campo: 'tipo_cob', mensagem: 'Informe o tipo da cobertura' };
    if (!f.id_cobertura) return { campo: 'id_cobertura', mensagem: 'Informe a cobertura' };
    if (!f.vlr_cobertura.trim()) return { campo: 'vlr_cobertura', mensagem: 'Informe o L.M.I. da cobertura' };
    if (!f.vlr_franquia.trim()) return { campo: 'vlr_franquia', mensagem: 'Informe o valor franquia' };
    if (!f.perc_franquia.trim()) return { campo: 'perc_franquia', mensagem: 'Informe o % franquia' };
    if (!f.vlr_cob_estima.trim()) return { campo: 'vlr_cob_estima', mensagem: 'Informe a estimativa de prejuízo' };
    if (!f.reclamado) return { campo: 'reclamado', mensagem: 'Informe o tipo do risco' };
    return null;
  }

  async function salvar() {
    if (!form) return;
    const erro = validar(form);
    if (erro) {
      focarCampoComErro(erro.campo, erro.mensagem);
      return;
    }
    setErroCampo(null);

    const dados: DadosCobertura = {
      id_cobertura: Number(form.id_cobertura),
      destino_lmi: form.destino_lmi === 'VER' || form.destino_lmi === 'POR' ? form.destino_lmi : '',
      perc_predio: paraNumeroPercentual(form.perc_predio),
      perc_conteudo: paraNumeroPercentual(form.perc_conteudo),
      item_apolice: form.item_apolice,
      nro_cob: form.nro_cob,
      complemento: form.complemento,
      vlr_cobertura: paraNumeroMoeda(form.vlr_cobertura),
      perc_franquia: paraNumeroPercentual(form.perc_franquia),
      vlr_franquia: paraNumeroMoeda(form.vlr_franquia),
      vlr_cob_estima: paraNumeroMoeda(form.vlr_cob_estima),
      reclamado: form.reclamado,
    };

    setSalvando(true);
    try {
      await salvarCobertura(idSinistro, form.id_sinicob, form.id_cobertura_anterior, dados);
      const lista = await listarCoberturas(idSinistro);
      setCoberturas(lista);
      setForm(null);
      mostrarAlerta('Sucesso', form.id_sinicob ? 'Atualizado com sucesso!!!' : 'Inserido com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando cobertura.');
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao(c: CoberturaResumo) {
    const pendencias = await verificarPendenciasCobertura(idSinistro, c.id_cobertura);
    if (pendencias.length > 0) {
      mostrarAlerta('Não é possível remover', `Existem itens em: [${pendencias.join(';')}]`);
      return;
    }

    mostrarAlerta('Remover Cobertura?', c.nm_cobertura, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirCobertura(idSinistro, c.id_sinicob);
          const lista = await listarCoberturas(idSinistro);
          setCoberturas(lista);
          if (form?.id_sinicob === c.id_sinicob) setForm(null);
        },
      },
    ]);
  }

  function voltar() {
    router.back();
  }

  function proximo() {
    // Porta de ProximaTela (cadcobertura_def.js): Coberturas -> Beneficiários.
    if (coberturas.length === 0) {
      mostrarAlerta('Atenção', 'Confira os dados da cobertura antes de ir pra próxima tela.');
      return;
    }
    router.replace({ pathname: '/sinistro/[id]/beneficiarios', params: { id: String(idSinistro) } });
  }

  const total = coberturas.reduce((soma, c) => soma + Number((c.vlr_cobertura || '0').replace(',', '.') || 0), 0);

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
          <Text style={styles.headerTitulo}>Coberturas</Text>
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
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {!form && (
          <Pressable style={styles.botaoAdicionar} onPress={novaCobertura}>
            <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
            <Text style={styles.botaoAdicionarTexto}>Nova cobertura</Text>
          </Pressable>
        )}

        {!form && coberturas.length === 0 && <Text style={styles.vazioTexto}>Nenhuma cobertura encontrada.</Text>}

        {!form &&
          coberturas.map((c) => (
            <Pressable key={c.id_sinicob} style={styles.itemLista} onPress={() => editarCobertura(c)}>
              <View style={styles.itemListaConteudo}>
                <Text style={styles.itemListaTexto} numberOfLines={1}>
                  {c.nm_cobertura}
                </Text>
                <Text style={styles.itemListaSubtexto}>{formatarMoeda(c.vlr_cobertura) || 'R$ 0,00'}</Text>
              </View>
              <Pressable hitSlop={10} onPress={() => confirmarExclusao(c)}>
                <Ionicons name="trash-outline" size={20} color="#d32f2f" />
              </Pressable>
            </Pressable>
          ))}

        {!form && coberturas.length > 0 && (
          <View style={styles.linhaTotal}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValor}>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text>
          </View>
        )}

        {form && (
          <Secao titulo={form.id_sinicob ? 'Editar Cobertura' : 'Nova Cobertura'}>
            {erroCampo && (
              <View style={styles.bannerErro}>
                <Ionicons name="alert-circle" size={20} color="#b3261e" />
                <Text style={styles.bannerErroTexto}>{erroCampo.mensagem}</Text>
              </View>
            )}
            <Selecao
              ref={refTipoCob}
              label="Tipo"
              valor={form.tipo_cob}
              opcoes={OPCOES_TIPO_COBERTURA}
              onChange={mudarTipo}
              obrigatorio
              erro={erroDoCampo('tipo_cob')}
            />
            <Selecao
              ref={refIdCobertura}
              label="Cobertura"
              valor={form.id_cobertura}
              opcoes={opcoesCoberturaDoTipo}
              onChange={(v) => atualizarCampo('id_cobertura', v)}
              obrigatorio
              erro={erroDoCampo('id_cobertura')}
            />
            <Selecao
              label="Destina LMI"
              valor={form.destino_lmi}
              opcoes={OPCOES_DESTINO_LMI}
              onChange={(v) => atualizarCampo('destino_lmi', v)}
            />
            <Campo
              label="% Prédio"
              value={form.perc_predio}
              onChangeText={(v) => atualizarCampo('perc_predio', formatarPercentualDigitado(v))}
              keyboardType="numeric"
            />
            <Campo
              label="% Conteúdo"
              value={form.perc_conteudo}
              onChangeText={(v) => atualizarCampo('perc_conteudo', formatarPercentualDigitado(v))}
              keyboardType="numeric"
            />
            <Campo
              label="Item da Apólice número"
              value={form.item_apolice}
              onChangeText={(v) => atualizarCampo('item_apolice', v)}
            />
            <Campo label="Código" value={form.nro_cob} onChangeText={(v) => atualizarCampo('nro_cob', v)} />
            <Campo label="Complemento" value={form.complemento} onChangeText={(v) => atualizarCampo('complemento', v)} />
            <Campo
              ref={refVlrCobertura}
              label="LMI"
              obrigatorio
              erro={erroDoCampo('vlr_cobertura')}
              value={form.vlr_cobertura}
              onChangeText={(v) => atualizarCampo('vlr_cobertura', formatarMoedaDigitado(v))}
              keyboardType="numeric"
            />
            <Campo
              ref={refPercFranquia}
              label="Franquia %"
              obrigatorio
              erro={erroDoCampo('perc_franquia')}
              value={form.perc_franquia}
              onChangeText={(v) => atualizarCampo('perc_franquia', formatarPercentualDigitado(v))}
              keyboardType="numeric"
            />
            <Campo
              ref={refVlrFranquia}
              label="Franquia Mín"
              obrigatorio
              erro={erroDoCampo('vlr_franquia')}
              value={form.vlr_franquia}
              onChangeText={(v) => atualizarCampo('vlr_franquia', formatarMoedaDigitado(v))}
              keyboardType="numeric"
            />
            <Campo
              ref={refVlrCobEstima}
              label="Estimativa de Prejuízo"
              obrigatorio
              erro={erroDoCampo('vlr_cob_estima')}
              value={form.vlr_cob_estima}
              onChangeText={(v) => atualizarCampo('vlr_cob_estima', formatarMoedaDigitado(v))}
              keyboardType="numeric"
            />
            <Selecao
              ref={refReclamado}
              label="O risco é"
              valor={form.reclamado}
              opcoes={OPCOES_RISCO}
              onChange={(v) => atualizarCampo('reclamado', v)}
              obrigatorio
              erro={erroDoCampo('reclamado')}
            />

            <View style={styles.linhaBotoesForm}>
              <Pressable style={styles.botaoCancelar} onPress={() => setForm(null)}>
                <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.botaoSalvar, styles.botaoSalvarForm]} onPress={salvar} disabled={salvando}>
                {salvando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={styles.botaoSalvarTexto}>Salvar Cobertura</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Secao>
        )}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={[styles.botaoRodape, styles.botaoNeutro]} onPress={voltar}>
          <Ionicons name="chevron-back" size={20} color="#1c3d5a" />
          <Text style={styles.botaoRodapeTexto}>Anterior</Text>
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
  bannerErro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: '#f5c6c2',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  bannerErroTexto: {
    flex: 1,
    color: '#8f2b23',
    fontSize: 13,
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
    marginVertical: 12,
  },
  botaoAdicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#eef2f5',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 10,
  },
  botaoAdicionarTexto: {
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 14,
  },
  itemLista: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  itemListaConteudo: {
    flex: 1,
    marginRight: 12,
  },
  itemListaTexto: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
  },
  itemListaSubtexto: {
    color: '#2a88ad',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 2,
  },
  linhaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#dde3e8',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  totalValor: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2a88ad',
  },
  linhaBotoesForm: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  botaoCancelar: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#eef2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoCancelarTexto: {
    color: '#5a6672',
    fontWeight: '700',
    fontSize: 14,
  },
  botaoSalvar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 14,
  },
  botaoSalvarForm: {
    flex: 1,
  },
  botaoSalvarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
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
});
