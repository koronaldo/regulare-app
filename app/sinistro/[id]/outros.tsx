import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  KeyboardAvoidingView,
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
import { CampoData } from '../../../src/components/form/CampoData';
import { Interruptor } from '../../../src/components/form/Interruptor';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import { listarCoberturasDoSinistroPorTipo, listarTiposCoberturaDoSinistro } from '../../../src/db/beneficiarios';
import {
  buscarCoberturaDefault,
  buscarSituacaoOutrosSeguros,
  definirPossuiOutrosSeguros,
  excluirOutroSeguro,
  listarOutrosSeguros,
  listarSeguradoras,
  salvarOutroSeguro,
  type DadosOutroSeguro,
  type OutroSeguroResumo,
} from '../../../src/db/outrosSeguros';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { formatarMoedaDigitado } from '../../../src/utils/moeda';
import { formatarPercentualDigitado } from '../../../src/utils/percentual';

function formatarMoeda(valor: string): string {
  const n = Number((valor || '0').replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** aceita "1.234,56" (formato salvo) e "R$ 1.234,56"/"1,50%" (formato digitado com máscara) */
function paraNumero(valor: string): number {
  const limpo = valor.replace(/[^\d,]/g, '').replace(',', '.');
  const n = Number(limpo || '0');
  return Number.isNaN(n) ? 0 : n;
}

function paraTextoValor(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarPercentualSalvo(valor: string): string {
  return `${paraTextoValor(paraNumero(valor || '0'))}%`;
}

/** Soma 1 ano a uma data ISO "YYYY-MM-DD". */
function maisUmAno(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const d = new Date(ano + 1, (mes || 1) - 1, dia || 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface FormOutroSeguro {
  id_outro: number | null;
  tipo_cob: string;
  id_cobertura: string;
  id_seguradora: string;
  data_ini_vig: string | null;
  data_fim_vig: string | null;
  apolice: string;
  vlr_lmi: string;
  vlr_franquia: string;
  perc_franquia: string;
}

const FORM_VAZIO: FormOutroSeguro = {
  id_outro: null,
  tipo_cob: '',
  id_cobertura: '',
  id_seguradora: '',
  data_ini_vig: null,
  data_fim_vig: null,
  apolice: '',
  vlr_lmi: '',
  vlr_franquia: '',
  perc_franquia: '',
};

function formInicial(o: OutroSeguroResumo): FormOutroSeguro {
  return {
    id_outro: o.id_outro,
    tipo_cob: o.tipo_cob,
    id_cobertura: String(o.id_cobertura),
    id_seguradora: String(o.id_seguradora),
    data_ini_vig: o.data_ini_vig || null,
    data_fim_vig: o.data_fim_vig || null,
    apolice: o.apolice,
    vlr_lmi: formatarMoeda(o.vlr_lmi),
    vlr_franquia: formatarMoeda(o.vlr_franquia),
    perc_franquia: formatarPercentualSalvo(o.perc_franquia),
  };
}

export default function OutrosSegurosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [possuiOutros, setPossuiOutros] = useState(false);
  const [outrosSeguros, setOutrosSeguros] = useState<OutroSeguroResumo[]>([]);
  const [form, setForm] = useState<FormOutroSeguro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroCampo, setErroCampo] = useState<{ campo: keyof FormOutroSeguro; mensagem: string } | null>(null);

  const [opcoesTipoCobertura, setOpcoesTipoCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesCobertura, setOpcoesCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesSeguradoras, setOpcoesSeguradoras] = useState<OpcaoSelecao[]>([]);

  const scrollRef = useRef<ScrollView>(null);
  const refTipoCob = useRef<View>(null);
  const refIdCobertura = useRef<View>(null);
  const refIdSeguradora = useRef<View>(null);
  const refDataFimVig = useRef<View>(null);
  const refVlrLmi = useRef<TextInput>(null);
  const refVlrFranquia = useRef<TextInput>(null);
  const refPercFranquia = useRef<TextInput>(null);

  function erroDoCampo(campo: keyof FormOutroSeguro): string | undefined {
    return erroCampo?.campo === campo ? erroCampo.mensagem : undefined;
  }

  function focarCampoComErro(campo: keyof FormOutroSeguro, mensagem: string) {
    setErroCampo({ campo, mensagem });

    const refsPorCampo: Partial<Record<keyof FormOutroSeguro, RefObject<TextInput | View | null>>> = {
      tipo_cob: refTipoCob,
      id_cobertura: refIdCobertura,
      id_seguradora: refIdSeguradora,
      data_fim_vig: refDataFimVig,
      vlr_lmi: refVlrLmi,
      vlr_franquia: refVlrFranquia,
      perc_franquia: refPercFranquia,
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
          const [sinistro, possui, lista, tiposCobertura, seguradoras] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            buscarSituacaoOutrosSeguros(idSinistro),
            listarOutrosSeguros(idSinistro),
            listarTiposCoberturaDoSinistro(idSinistro),
            listarSeguradoras(),
          ]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setPossuiOutros(possui);
          setOutrosSeguros(lista);
          setOpcoesTipoCobertura(tiposCobertura);
          setOpcoesSeguradoras(seguradoras);
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

  async function mudarPossuiOutros(valor: boolean) {
    if (!valor && outrosSeguros.length > 0) {
      mostrarAlerta('Remover outros seguros?', 'Ao marcar Não, os registros de outros seguros já cadastrados serão apagados.', [
        { text: 'Cancelar' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await definirPossuiOutrosSeguros(idSinistro, false);
            setPossuiOutros(false);
            setOutrosSeguros([]);
            setForm(null);
          },
        },
      ]);
      return;
    }

    setPossuiOutros(valor);
    setForm(null);
    await definirPossuiOutrosSeguros(idSinistro, valor);
  }

  async function novoOutroSeguro() {
    setOpcoesCobertura([]);
    setErroCampo(null);
    const padrao = await buscarCoberturaDefault(idSinistro);
    if (padrao) {
      const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, padrao.tipoCob);
      setOpcoesCobertura(coberturas);
      setForm({ ...FORM_VAZIO, tipo_cob: padrao.tipoCob, id_cobertura: String(padrao.idCobertura) });
    } else {
      setForm(FORM_VAZIO);
    }
  }

  async function editarOutroSeguro(o: OutroSeguroResumo) {
    const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, o.tipo_cob);
    setOpcoesCobertura(coberturas);
    setErroCampo(null);
    setForm(formInicial(o));
  }

  async function mudarTipoCobertura(tipo: string) {
    setForm((atual) => (atual ? { ...atual, tipo_cob: tipo, id_cobertura: '' } : atual));
    setErroCampo((atual) => (atual?.campo === 'tipo_cob' ? null : atual));
    const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, tipo);
    setOpcoesCobertura(coberturas);
  }

  function atualizarCampo<K extends keyof FormOutroSeguro>(campo: K, valor: FormOutroSeguro[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    setErroCampo((atual) => (atual?.campo === campo ? null : atual));
  }

  /** Ao escolher a data inicial, sugere a data final um ano depois. */
  function mudarDataInicial(v: string) {
    setForm((atual) => (atual ? { ...atual, data_ini_vig: v, data_fim_vig: maisUmAno(v) } : atual));
    setErroCampo((atual) => (atual?.campo === 'data_ini_vig' || atual?.campo === 'data_fim_vig' ? null : atual));
  }

  function validar(f: FormOutroSeguro): { campo: keyof FormOutroSeguro; mensagem: string } | null {
    if (!f.tipo_cob) return { campo: 'tipo_cob', mensagem: 'Informe o tipo da cobertura' };
    if (!f.id_cobertura) return { campo: 'id_cobertura', mensagem: 'Informe a cobertura' };
    if (!f.vlr_lmi.trim()) return { campo: 'vlr_lmi', mensagem: 'Informe o LMI ou zero' };
    if (!f.vlr_franquia.trim()) return { campo: 'vlr_franquia', mensagem: 'Informe o valor da Franquia ou zero' };
    if (!f.perc_franquia.trim()) return { campo: 'perc_franquia', mensagem: 'Informe o % da Franquia ou zero' };
    if (!f.id_seguradora) return { campo: 'id_seguradora', mensagem: 'Informe a seguradora' };
    if (f.data_ini_vig && f.data_fim_vig && f.data_fim_vig <= f.data_ini_vig) {
      return { campo: 'data_fim_vig', mensagem: 'Data final deve ser maior que a inicial' };
    }
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

    const dados: DadosOutroSeguro = {
      id_cobertura: Number(form.id_cobertura),
      id_seguradora: Number(form.id_seguradora),
      data_ini_vig: form.data_ini_vig,
      data_fim_vig: form.data_fim_vig,
      apolice: form.apolice,
      vlr_lmi: paraTextoValor(paraNumero(form.vlr_lmi)),
      vlr_franquia: paraTextoValor(paraNumero(form.vlr_franquia)),
      perc_franquia: paraTextoValor(paraNumero(form.perc_franquia)),
    };

    setSalvando(true);
    try {
      await salvarOutroSeguro(idSinistro, form.id_outro, dados);
      const lista = await listarOutrosSeguros(idSinistro);
      setOutrosSeguros(lista);
      setPossuiOutros(true);
      setForm(null);
      mostrarAlerta('Sucesso', form.id_outro ? 'Atualizado com sucesso!!!' : 'Inserido com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando Outros Seguros.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao(o: OutroSeguroResumo) {
    mostrarAlerta('Remover registro de outros seguros?', o.apelido, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirOutroSeguro(idSinistro, o.id_cobertura, o.id_outro);
          const lista = await listarOutrosSeguros(idSinistro);
          setOutrosSeguros(lista);
          if (form?.id_outro === o.id_outro) setForm(null);
        },
      },
    ]);
  }

  function voltar() {
    router.back();
  }

  function proximo() {
    // Porta de ProximaTela (cadoutroseg_def.js): Outros Seguros -> Relação de Documentos.
    router.replace({ pathname: '/sinistro/[id]/documentos', params: { id: String(idSinistro) } });
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
          <Text style={styles.headerTitulo}>Outros Seguros</Text>
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
      <ScrollView ref={scrollRef} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Secao titulo="Possui outros seguros?">
          <Interruptor label="Possui outros seguros?" valor={possuiOutros} onChange={mudarPossuiOutros} />
        </Secao>

        {possuiOutros && (
          <>
            {!form && (
              <Pressable style={styles.botaoAdicionar} onPress={novoOutroSeguro}>
                <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
                <Text style={styles.botaoAdicionarTexto}>Novo seguro</Text>
              </Pressable>
            )}

            {!form && outrosSeguros.length === 0 && (
              <Text style={styles.vazioTexto}>Nenhum outro seguro encontrado.</Text>
            )}

            {!form &&
              outrosSeguros.map((o) => (
                <Pressable key={o.id_outro} style={styles.itemLista} onPress={() => editarOutroSeguro(o)}>
                  <View style={styles.itemListaConteudo}>
                    <Text style={styles.itemListaTexto} numberOfLines={1}>
                      {o.apelido}
                    </Text>
                    <Text style={styles.itemListaSubtexto} numberOfLines={1}>
                      Apólice {o.apolice || '-'} · LMI {formatarMoeda(o.vlr_lmi)}
                    </Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => confirmarExclusao(o)}>
                    <Ionicons name="trash-outline" size={20} color="#d32f2f" />
                  </Pressable>
                </Pressable>
              ))}

            {form && (
              <Secao titulo={form.id_outro ? 'Editar Outro Seguro' : 'Novo Outro Seguro'}>
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
                  opcoes={opcoesTipoCobertura}
                  onChange={mudarTipoCobertura}
                  obrigatorio
                  erro={erroDoCampo('tipo_cob')}
                />
                <Selecao
                  ref={refIdCobertura}
                  label="Cobertura"
                  valor={form.id_cobertura}
                  opcoes={opcoesCobertura}
                  onChange={(v) => atualizarCampo('id_cobertura', v)}
                  obrigatorio
                  erro={erroDoCampo('id_cobertura')}
                />
                <Selecao
                  ref={refIdSeguradora}
                  label="Seguradora"
                  valor={form.id_seguradora}
                  opcoes={opcoesSeguradoras}
                  onChange={(v) => atualizarCampo('id_seguradora', v)}
                  obrigatorio
                  erro={erroDoCampo('id_seguradora')}
                />
                <CampoData label="Data Inicial" valor={form.data_ini_vig} onChange={mudarDataInicial} />
                <CampoData
                  ref={refDataFimVig}
                  label="Data Final"
                  valor={form.data_fim_vig}
                  onChange={(v) => atualizarCampo('data_fim_vig', v)}
                  erro={erroDoCampo('data_fim_vig')}
                />
                <Campo label="Apólice" value={form.apolice} onChangeText={(v) => atualizarCampo('apolice', v)} />
                <Campo
                  ref={refVlrLmi}
                  label="L.M.I."
                  obrigatorio
                  erro={erroDoCampo('vlr_lmi')}
                  value={form.vlr_lmi}
                  onChangeText={(v) => atualizarCampo('vlr_lmi', formatarMoedaDigitado(v))}
                  keyboardType="numeric"
                />
                <Campo
                  ref={refVlrFranquia}
                  label="R$ Franquia"
                  obrigatorio
                  erro={erroDoCampo('vlr_franquia')}
                  value={form.vlr_franquia}
                  onChangeText={(v) => atualizarCampo('vlr_franquia', formatarMoedaDigitado(v))}
                  keyboardType="numeric"
                />
                <Campo
                  ref={refPercFranquia}
                  label="% Franquia"
                  obrigatorio
                  erro={erroDoCampo('perc_franquia')}
                  value={form.perc_franquia}
                  onChangeText={(v) => atualizarCampo('perc_franquia', formatarPercentualDigitado(v))}
                  keyboardType="numeric"
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
                        <Text style={styles.botaoSalvarTexto}>Salvar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </Secao>
            )}
          </>
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
