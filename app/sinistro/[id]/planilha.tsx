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
import { Secao } from '../../../src/components/form/Secao';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import { listarCoberturasDoSinistroPorTipo, listarTiposCoberturaDoSinistro } from '../../../src/db/beneficiarios';
import {
  excluirItem,
  excluirSubItem,
  listarItensPlanilha,
  proximoGrupo,
  renomearItem,
  salvarSubItem,
  type ItemPlanilha,
} from '../../../src/db/planilha';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { formatarMoedaDigitado } from '../../../src/utils/moeda';
import { formatarDecimalDigitado } from '../../../src/utils/numero';

function paraNumero(valor: string | number | null | undefined): number {
  if (typeof valor === 'number') return Number.isNaN(valor) ? 0 : valor;
  // aceita "1.234,56" (formato salvo) e "R$ 1.234,56" (formato digitado com máscara na Quantidade/Valor Unitário)
  const limpo = (valor ?? '').toString().replace(/[^\d,]/g, '').replace(',', '.');
  const n = Number(limpo || '0');
  return Number.isNaN(n) ? 0 : n;
}

function paraTextoValor(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarMoeda(texto: string): string {
  return paraNumero(texto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface FormSubItem {
  modoNovoItem: boolean;
  id_planilha: number | null;
  grupoitem: string;
  nm_planilha_item: string;
  nm_planilha: string;
  qtde: string;
  vlr_uni_apr: string;
}

export default function PlanilhaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });

  const [opcoesTipoCobertura, setOpcoesTipoCobertura] = useState<OpcaoSelecao[]>([]);
  const [tipoCob, setTipoCob] = useState('');
  const [opcoesCobertura, setOpcoesCobertura] = useState<OpcaoSelecao[]>([]);
  const [idCobertura, setIdCobertura] = useState('');

  const [itens, setItens] = useState<ItemPlanilha[]>([]);
  const [itemExpandido, setItemExpandido] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<{ grupoitem: string; nome: string } | null>(null);

  const [form, setForm] = useState<FormSubItem | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroCampo, setErroCampo] = useState<{ campo: keyof FormSubItem; mensagem: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const refNmPlanilhaItem = useRef<TextInput>(null);
  const refNmPlanilha = useRef<TextInput>(null);
  const refQtde = useRef<TextInput>(null);
  const refVlrUniApr = useRef<TextInput>(null);

  function erroDoCampo(campo: keyof FormSubItem): string | undefined {
    return erroCampo?.campo === campo ? erroCampo.mensagem : undefined;
  }

  function focarCampoComErro(campo: keyof FormSubItem, mensagem: string) {
    setErroCampo({ campo, mensagem });

    const refsPorCampo: Partial<Record<keyof FormSubItem, RefObject<TextInput | null>>> = {
      nm_planilha_item: refNmPlanilhaItem,
      nm_planilha: refNmPlanilha,
      qtde: refQtde,
      vlr_uni_apr: refVlrUniApr,
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
    if (el) setTimeout(() => el.focus(), 400);
  }

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, tipos] = await Promise.all([buscarSinistroPorId(idSinistro), listarTiposCoberturaDoSinistro(idSinistro)]);
          if (cancelado) return;
          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setOpcoesTipoCobertura(tipos);
          setForm(null);
          setRenomeando(null);

          // Só um tipo/cobertura disponível: não faz sentido pedir pra escolher, já carrega direto.
          if (tipos.length === 1) {
            const tipoUnico = String(tipos[0].valor);
            setTipoCob(tipoUnico);
            const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, tipoUnico);
            if (cancelado) return;
            setOpcoesCobertura(coberturas);

            if (coberturas.length === 1) {
              const idCoberturaUnica = String(coberturas[0].valor);
              setIdCobertura(idCoberturaUnica);
              const lista = await listarItensPlanilha(idSinistro, Number(idCoberturaUnica));
              if (cancelado) return;
              setItens(lista);
            }
          }
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

  async function recarregarItens(idCob: number) {
    const lista = await listarItensPlanilha(idSinistro, idCob);
    setItens(lista);
  }

  async function mudarTipo(tipo: string) {
    setTipoCob(tipo);
    setIdCobertura('');
    setItens([]);
    setItemExpandido(null);
    const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, tipo);
    setOpcoesCobertura(coberturas);
  }

  async function mudarCobertura(valor: string) {
    setIdCobertura(valor);
    setItemExpandido(null);
    if (valor) await recarregarItens(Number(valor));
  }

  async function novoItem() {
    if (!idCobertura) {
      mostrarAlerta('Campo obrigatório', 'Informe o tipo e a cobertura antes de cadastrar um item.');
      return;
    }
    const grupo = await proximoGrupo(idSinistro, Number(idCobertura));
    setErroCampo(null);
    setForm({ modoNovoItem: true, id_planilha: null, grupoitem: grupo, nm_planilha_item: '', nm_planilha: '', qtde: '', vlr_uni_apr: '' });
  }

  function novoSubItem(item: ItemPlanilha) {
    setErroCampo(null);
    setForm({
      modoNovoItem: false,
      id_planilha: null,
      grupoitem: item.grupoitem,
      nm_planilha_item: item.nm_planilha_item,
      nm_planilha: '',
      qtde: '',
      vlr_uni_apr: '',
    });
  }

  function editarSubItem(item: ItemPlanilha, sub: ItemPlanilha['subitens'][number]) {
    setErroCampo(null);
    setForm({
      modoNovoItem: false,
      id_planilha: sub.id_planilha,
      grupoitem: item.grupoitem,
      nm_planilha_item: item.nm_planilha_item,
      nm_planilha: sub.nm_planilha,
      qtde: sub.qtde,
      vlr_uni_apr: formatarMoeda(sub.vlr_uni_apr),
    });
  }

  function atualizarCampo<K extends keyof FormSubItem>(campo: K, valor: FormSubItem[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    setErroCampo((atual) => (atual?.campo === campo ? null : atual));
  }

  const totalForm = form ? paraNumero(form.qtde) * paraNumero(form.vlr_uni_apr) : 0;

  function validar(f: FormSubItem): { campo: keyof FormSubItem; mensagem: string } | null {
    if (f.modoNovoItem && !f.nm_planilha_item.trim()) {
      return { campo: 'nm_planilha_item', mensagem: 'Informe o nome do item' };
    }
    if (!f.nm_planilha.trim()) return { campo: 'nm_planilha', mensagem: 'Informe a descrição' };
    if (!f.vlr_uni_apr.trim()) return { campo: 'vlr_uni_apr', mensagem: 'Informe o valor unitário' };
    if (!f.qtde.trim()) return { campo: 'qtde', mensagem: 'Informe a quantidade' };
    return null;
  }

  async function salvar() {
    if (!form || !idCobertura) return;
    const erro = validar(form);
    if (erro) {
      focarCampoComErro(erro.campo, erro.mensagem);
      return;
    }
    setErroCampo(null);

    setSalvando(true);
    try {
      await salvarSubItem(idSinistro, Number(idCobertura), form.id_planilha, {
        grupoitem: form.grupoitem,
        nm_planilha_item: form.modoNovoItem ? form.nm_planilha_item.trim() : form.nm_planilha_item,
        nm_planilha: form.nm_planilha.trim(),
        qtde: form.qtde,
        vlr_uni_apr: paraTextoValor(paraNumero(form.vlr_uni_apr)),
        vlr_tot_apr: paraTextoValor(totalForm),
      });
      await recarregarItens(Number(idCobertura));
      setItemExpandido(form.grupoitem);
      setForm(null);
      mostrarAlerta('Sucesso', form.id_planilha ? 'Atualizado com sucesso!!!' : 'Inserido com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando planilha.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusaoSubItem(item: ItemPlanilha, sub: ItemPlanilha['subitens'][number]) {
    mostrarAlerta('Remover Item da Planilha?', sub.nm_planilha, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirSubItem(idSinistro, Number(idCobertura), sub.id_planilha);
          await recarregarItens(Number(idCobertura));
        },
      },
    ]);
  }

  function confirmarExclusaoItem(item: ItemPlanilha) {
    mostrarAlerta('Remover item e todos os seus subitens?', item.nm_planilha_item, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirItem(idSinistro, Number(idCobertura), item.grupoitem);
          await recarregarItens(Number(idCobertura));
        },
      },
    ]);
  }

  function iniciarRenomeio(item: ItemPlanilha) {
    setRenomeando({ grupoitem: item.grupoitem, nome: item.nm_planilha_item });
  }

  async function confirmarRenomeio() {
    if (!renomeando) return;
    if (!renomeando.nome.trim()) {
      mostrarAlerta('Campo obrigatório', 'Informe o nome do item.');
      return;
    }
    await renomearItem(idSinistro, Number(idCobertura), renomeando.grupoitem, renomeando.nome.trim());
    await recarregarItens(Number(idCobertura));
    setRenomeando(null);
  }

  function voltar() {
    router.back();
  }

  function proximo() {
    // Porta de ProximaTela (cadplanilha_def.js): Planilha de Apuração -> Outros Seguros.
    router.replace({ pathname: '/sinistro/[id]/outros', params: { id: String(idSinistro) } });
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
          <Text style={styles.headerTitulo}>Planilha de Apuração</Text>
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
        <Secao titulo="Cobertura">
          <Selecao label="Tipo" valor={tipoCob} opcoes={opcoesTipoCobertura} onChange={mudarTipo} obrigatorio />
          <Selecao
            label="Cobertura"
            valor={idCobertura}
            opcoes={opcoesCobertura}
            onChange={mudarCobertura}
            obrigatorio
          />
        </Secao>

        {opcoesTipoCobertura.length === 0 && (
          <View style={styles.avisoCobertura}>
            <Ionicons name="alert-circle" size={20} color="#8f2b23" />
            <Text style={styles.avisoCoberturaTexto}>
              Cadastre ao menos uma cobertura antes de montar a planilha de apuração.
            </Text>
          </View>
        )}

        {idCobertura && !form && (
          <Pressable style={styles.botaoAdicionar} onPress={novoItem}>
            <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
            <Text style={styles.botaoAdicionarTexto}>Novo item</Text>
          </Pressable>
        )}

        {idCobertura && !form && itens.length === 0 && <Text style={styles.vazioTexto}>Nenhum item encontrado.</Text>}

        {!form &&
          itens.map((item) => {
            const expandido = itemExpandido === item.grupoitem;
            const estaRenomeando = renomeando?.grupoitem === item.grupoitem;
            return (
              <View key={item.grupoitem} style={styles.cardItem}>
                {estaRenomeando ? (
                  <View style={styles.linhaRenomeio}>
                    <Campo
                      label="Nome do item"
                      value={renomeando.nome}
                      onChangeText={(v) => setRenomeando({ grupoitem: item.grupoitem, nome: v })}
                      style={styles.campoRenomeio}
                    />
                    <Pressable hitSlop={10} onPress={confirmarRenomeio} style={styles.botaoIcone}>
                      <Ionicons name="checkmark-circle" size={24} color="#1fa971" />
                    </Pressable>
                    <Pressable hitSlop={10} onPress={() => setRenomeando(null)} style={styles.botaoIcone}>
                      <Ionicons name="close-circle" size={24} color="#8a97a3" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.cabecalhoItem}
                    onPress={() => setItemExpandido(expandido ? null : item.grupoitem)}
                  >
                    <Ionicons name={expandido ? 'chevron-down' : 'chevron-forward'} size={18} color="#1c3d5a" />
                    <Text style={styles.tituloItem} numberOfLines={1}>
                      {item.nm_planilha_item || '(sem nome)'}
                    </Text>
                    <Text style={styles.totalItem}>{item.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text>
                    <Pressable hitSlop={10} onPress={() => iniciarRenomeio(item)} style={styles.botaoIcone}>
                      <Ionicons name="pencil-outline" size={18} color="#5a6672" />
                    </Pressable>
                    <Pressable hitSlop={10} onPress={() => confirmarExclusaoItem(item)} style={styles.botaoIcone}>
                      <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                    </Pressable>
                  </Pressable>
                )}

                {expandido && !estaRenomeando && (
                  <View style={styles.listaSubitens}>
                    {item.subitens.map((sub) => (
                      <Pressable key={sub.id_planilha} style={styles.linhaSubitem} onPress={() => editarSubItem(item, sub)}>
                        <Text style={styles.subitemTexto} numberOfLines={1}>
                          {sub.nm_planilha}
                        </Text>
                        <Text style={styles.subitemValor}>{formatarMoeda(sub.vlr_tot_apr)}</Text>
                        <Pressable hitSlop={10} onPress={() => confirmarExclusaoSubItem(item, sub)} style={styles.botaoIcone}>
                          <Ionicons name="trash-outline" size={16} color="#d32f2f" />
                        </Pressable>
                      </Pressable>
                    ))}
                    <Pressable style={styles.botaoSubitem} onPress={() => novoSubItem(item)}>
                      <Ionicons name="add" size={16} color="#1c3d5a" />
                      <Text style={styles.botaoSubitemTexto}>Novo subitem</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

        {!form && itens.length > 0 && (
          <View style={styles.linhaTotal}>
            <Text style={styles.totalGeralLabel}>Total</Text>
            <Text style={styles.totalGeralValor}>
              {itens.reduce((s, i) => s + i.total, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </Text>
          </View>
        )}

        {form && (
          <Secao titulo={form.modoNovoItem ? 'Novo Item' : form.id_planilha ? 'Editar Subitem' : 'Novo Subitem'}>
            {erroCampo && (
              <View style={styles.bannerErro}>
                <Ionicons name="alert-circle" size={20} color="#b3261e" />
                <Text style={styles.bannerErroTexto}>{erroCampo.mensagem}</Text>
              </View>
            )}
            {form.modoNovoItem && (
              <Campo
                ref={refNmPlanilhaItem}
                label="Nome do item"
                obrigatorio
                erro={erroDoCampo('nm_planilha_item')}
                value={form.nm_planilha_item}
                onChangeText={(v) => atualizarCampo('nm_planilha_item', v)}
              />
            )}
            {!form.modoNovoItem && <Text style={styles.itemPaiLabel}>Item: {form.nm_planilha_item}</Text>}

            <Campo
              ref={refNmPlanilha}
              label="Descrição do subitem"
              obrigatorio
              erro={erroDoCampo('nm_planilha')}
              value={form.nm_planilha}
              onChangeText={(v) => atualizarCampo('nm_planilha', v)}
            />
            <Campo
              ref={refQtde}
              label="Quantidade"
              obrigatorio
              erro={erroDoCampo('qtde')}
              value={form.qtde}
              onChangeText={(v) => atualizarCampo('qtde', formatarDecimalDigitado(v))}
              keyboardType="numeric"
            />
            <Campo
              ref={refVlrUniApr}
              label="Valor Unitário"
              obrigatorio
              erro={erroDoCampo('vlr_uni_apr')}
              value={form.vlr_uni_apr}
              onChangeText={(v) => atualizarCampo('vlr_uni_apr', formatarMoedaDigitado(v))}
              keyboardType="numeric"
            />
            <View style={styles.linhaTotalForm}>
              <Text style={styles.totalFormLabel}>Valor Total</Text>
              <Text style={styles.totalFormValor}>{paraTextoValor(totalForm)}</Text>
            </View>

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
  avisoCobertura: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: '#f5c6c2',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  avisoCoberturaTexto: {
    flex: 1,
    color: '#8f2b23',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
  cardItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    overflow: 'hidden',
  },
  cabecalhoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  tituloItem: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 14,
  },
  totalItem: {
    color: '#2a88ad',
    fontWeight: '700',
    fontSize: 13,
    marginRight: 4,
  },
  botaoIcone: {
    padding: 4,
  },
  linhaRenomeio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  campoRenomeio: {
    flex: 1,
  },
  listaSubitens: {
    borderTopWidth: 1,
    borderTopColor: '#eef2f5',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  linhaSubitem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f6f8',
  },
  subitemTexto: {
    flex: 1,
    color: '#333',
    fontSize: 13,
  },
  subitemValor: {
    color: '#5a6672',
    fontSize: 13,
    fontWeight: '600',
  },
  botaoSubitem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  botaoSubitemTexto: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 13,
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
  totalGeralLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  totalGeralValor: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2a88ad',
  },
  itemPaiLabel: {
    fontSize: 13,
    color: '#5a6672',
    fontWeight: '600',
    marginBottom: 10,
  },
  linhaTotalForm: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#eef2f5',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  totalFormLabel: {
    fontSize: 13,
    color: '#5a6672',
    fontWeight: '600',
  },
  totalFormValor: {
    fontSize: 15,
    color: '#1c3d5a',
    fontWeight: '700',
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
