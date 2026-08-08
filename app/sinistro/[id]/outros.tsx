import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

function formatarMoeda(valor: string): string {
  const n = Number((valor || '0').replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    vlr_lmi: o.vlr_lmi,
    vlr_franquia: o.vlr_franquia,
    perc_franquia: o.perc_franquia,
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

  const [opcoesTipoCobertura, setOpcoesTipoCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesCobertura, setOpcoesCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesSeguradoras, setOpcoesSeguradoras] = useState<OpcaoSelecao[]>([]);

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
    setForm(formInicial(o));
  }

  async function mudarTipoCobertura(tipo: string) {
    setForm((atual) => (atual ? { ...atual, tipo_cob: tipo, id_cobertura: '' } : atual));
    const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, tipo);
    setOpcoesCobertura(coberturas);
  }

  function atualizarCampo<K extends keyof FormOutroSeguro>(campo: K, valor: FormOutroSeguro[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
  }

  function validar(f: FormOutroSeguro): string | null {
    if (!f.tipo_cob) return 'Informe o tipo da cobertura';
    if (!f.id_cobertura) return 'Informe a cobertura';
    if (!f.vlr_lmi.trim()) return 'Informe o LMI ou zero';
    if (!f.vlr_franquia.trim()) return 'Informe o valor da Franquia ou zero';
    if (!f.perc_franquia.trim()) return 'Informe o % da Franquia ou zero';
    if (!f.id_seguradora) return 'Informe a seguradora';
    return null;
  }

  async function salvar() {
    if (!form) return;
    const erro = validar(form);
    if (erro) {
      mostrarAlerta('Campo obrigatório', erro);
      return;
    }

    const dados: DadosOutroSeguro = {
      id_cobertura: Number(form.id_cobertura),
      id_seguradora: Number(form.id_seguradora),
      data_ini_vig: form.data_ini_vig,
      data_fim_vig: form.data_fim_vig,
      apolice: form.apolice,
      vlr_lmi: form.vlr_lmi,
      vlr_franquia: form.vlr_franquia,
      perc_franquia: form.perc_franquia,
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
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
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
                <Selecao
                  label="Tipo"
                  valor={form.tipo_cob}
                  opcoes={opcoesTipoCobertura}
                  onChange={mudarTipoCobertura}
                  obrigatorio
                />
                <Selecao
                  label="Cobertura"
                  valor={form.id_cobertura}
                  opcoes={opcoesCobertura}
                  onChange={(v) => atualizarCampo('id_cobertura', v)}
                  obrigatorio
                />
                <Selecao
                  label="Seguradora"
                  valor={form.id_seguradora}
                  opcoes={opcoesSeguradoras}
                  onChange={(v) => atualizarCampo('id_seguradora', v)}
                  obrigatorio
                />
                <CampoData
                  label="Data Inicial"
                  valor={form.data_ini_vig}
                  onChange={(v) => atualizarCampo('data_ini_vig', v)}
                />
                <CampoData
                  label="Data Final"
                  valor={form.data_fim_vig}
                  onChange={(v) => atualizarCampo('data_fim_vig', v)}
                />
                <Campo label="Apólice" value={form.apolice} onChangeText={(v) => atualizarCampo('apolice', v)} />
                <Campo
                  label="L.M.I."
                  obrigatorio
                  value={form.vlr_lmi}
                  onChangeText={(v) => atualizarCampo('vlr_lmi', v)}
                  keyboardType="numeric"
                />
                <Campo
                  label="R$ Franquia"
                  obrigatorio
                  value={form.vlr_franquia}
                  onChangeText={(v) => atualizarCampo('vlr_franquia', v)}
                  keyboardType="numeric"
                />
                <Campo
                  label="% Franquia"
                  obrigatorio
                  value={form.perc_franquia}
                  onChangeText={(v) => atualizarCampo('perc_franquia', v)}
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
