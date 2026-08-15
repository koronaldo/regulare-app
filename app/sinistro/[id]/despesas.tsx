import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { Campo } from '../../../src/components/form/Campo';
import { CampoData } from '../../../src/components/form/CampoData';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import {
  buscarConfiguracaoDespesa,
  buscarDeslocamento,
  buscarLimiteDespesa,
  excluirDespesa,
  excluirRecibo,
  listarDespesasDisponiveis,
  listarDespesasLancadas,
  salvarDeslocamento,
  salvarDespesa,
  salvarRecibo,
  type ConfiguracaoDespesa,
  type DespesaResumo,
  type LimiteDespesa,
} from '../../../src/db/despesas';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { reduzImagem } from '../../../src/utils/imagem';

function paraNumero(valor: string | null | undefined): number {
  if (!valor) return 0;
  const n = Number(valor.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function paraTexto(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarMoeda(valor: string): string {
  return paraNumero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function diretorioRecibos(idSinistro: number): Directory {
  return new Directory(Paths.document, 'RegulareFiles', String(idSinistro), 'Recibos');
}

interface FormDespesa {
  id_sinidesp: number | null;
  id_despesa: string;
  qtde: string;
  vlr_uni: string;
  comple: string;
  nro_despesa: string;
  data_desp: string | null;
}

const FORM_VAZIO: FormDespesa = {
  id_sinidesp: null,
  id_despesa: '',
  qtde: '',
  vlr_uni: '',
  comple: '',
  nro_despesa: '',
  data_desp: null,
};

export default function DespesasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [aba, setAba] = useState<'despesas' | 'deslocamento'>('despesas');
  const [config, setConfig] = useState<ConfiguracaoDespesa>({ obrigaIdentificacao: false, idSeguradora: null, idSucursal: null });
  const [despesas, setDespesas] = useState<DespesaResumo[]>([]);
  const [opcoesDespesa, setOpcoesDespesa] = useState<OpcaoSelecao[]>([]);
  const [limite, setLimite] = useState<LimiteDespesa | null>(null);
  const [form, setForm] = useState<FormDespesa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [processandoRecibo, setProcessandoRecibo] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const [deslocamento, setDeslocamento] = useState({ kmInicial: '', kmFinal: '' });
  const [salvandoKm, setSalvandoKm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, cfg, lista, desloc] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            buscarConfiguracaoDespesa(idSinistro),
            listarDespesasLancadas(idSinistro),
            buscarDeslocamento(idSinistro),
          ]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setConfig(cfg);
          setDespesas(lista);
          setDeslocamento(desloc);
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

  async function recarregarDespesas() {
    const lista = await listarDespesasLancadas(idSinistro);
    setDespesas(lista);
    return lista;
  }

  async function novaDespesa() {
    const opcoes = await listarDespesasDisponiveis(idSinistro, true);
    setOpcoesDespesa(opcoes);
    setLimite(null);
    setForm(FORM_VAZIO);
  }

  async function editarDespesa(d: DespesaResumo) {
    const opcoes = await listarDespesasDisponiveis(idSinistro, false);
    setOpcoesDespesa(opcoes);
    const lim = await buscarLimiteDespesa(d.id_despesa, config.idSeguradora, config.idSucursal);
    setLimite(lim);
    setForm({
      id_sinidesp: d.id_sinidesp,
      id_despesa: String(d.id_despesa),
      qtde: d.qtde,
      vlr_uni: d.vlr_uni,
      comple: d.comple,
      nro_despesa: d.nro_despesa,
      data_desp: d.data_desp || null,
    });
  }

  async function mudarDespesaSelecionada(valor: string) {
    setForm((atual) => (atual ? { ...atual, id_despesa: valor } : atual));
    if (!valor) {
      setLimite(null);
      return;
    }
    const lim = await buscarLimiteDespesa(Number(valor), config.idSeguradora, config.idSucursal);
    setLimite(lim);
  }

  function atualizarCampo<K extends keyof FormDespesa>(campo: K, valor: FormDespesa[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
  }

  function validar(f: FormDespesa): string | null {
    if (!f.id_despesa) return 'Informe a despesa';
    if (!f.qtde.trim()) return 'Informe a quantidade';
    if (paraNumero(f.vlr_uni) === 0) return 'Informe o valor unitário';
    if (config.obrigaIdentificacao && (!f.nro_despesa.trim() || !f.data_desp)) {
      return 'Essa seguradora exige a identificação da despesa: Nº da despesa e data de emissão';
    }
    if (limite) {
      const qtde = paraNumero(f.qtde);
      const qtdeIni = paraNumero(limite.qtdeIni);
      const qtdeFim = paraNumero(limite.qtdeFim);
      if (qtde < qtdeIni || qtde > qtdeFim) {
        return `Quantidade fora do limite. Valor permitido entre [${limite.qtdeIni} - ${limite.qtdeFim}]`;
      }
      const vlrUni = paraNumero(f.vlr_uni);
      const limiteIni = paraNumero(limite.limiteIni);
      const limiteFim = paraNumero(limite.limiteFim);
      if (vlrUni < limiteIni || vlrUni > limiteFim) {
        return `Valor fora do limite. Valor permitido entre [${limite.limiteIni} - ${limite.limiteFim}]`;
      }
    }
    return null;
  }

  async function salvar() {
    if (!form) return;
    const erro = validar(form);
    if (erro) {
      mostrarAlerta('Campo obrigatório', erro);
      return;
    }

    const total = paraTexto(paraNumero(form.qtde) * paraNumero(form.vlr_uni));

    setSalvando(true);
    try {
      await salvarDespesa(idSinistro, form.id_sinidesp, {
        id_despesa: Number(form.id_despesa),
        qtde: form.qtde,
        vlr_uni: form.vlr_uni,
        vlr_tot: total,
        comple: form.comple,
        nro_despesa: form.nro_despesa,
        data_desp: form.data_desp,
      });
      await recarregarDespesas();
      setForm(null);
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando despesa.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao(d: DespesaResumo) {
    mostrarAlerta('Remover Despesa?', d.nm_despesa, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            if (d.nome_recibo) {
              const arquivo = new File(d.nome_recibo);
              if (arquivo.exists) arquivo.delete();
            }
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirDespesa(idSinistro, d.id_sinidesp);
          await recarregarDespesas();
          if (form?.id_sinidesp === d.id_sinidesp) setForm(null);
        },
      },
    ]);
  }

  async function capturarRecibo(d: DespesaResumo) {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      mostrarAlerta('Permissão necessária', 'Autorize o uso da câmera para fotografar o comprovante.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];

    setProcessandoRecibo(true);
    try {
      const arquivo = await reduzImagem(asset.uri, asset.width, asset.height, diretorioRecibos(idSinistro), 'recibo');
      await salvarRecibo(idSinistro, d.id_sinidesp, arquivo);
      await recarregarDespesas();
    } catch {
      mostrarAlerta('Erro', 'Erro ao salvar o comprovante.');
    } finally {
      setProcessandoRecibo(false);
    }
  }

  function tocarRecibo(d: DespesaResumo) {
    if (!d.nome_recibo) {
      capturarRecibo(d);
      return;
    }
    mostrarAlerta('Comprovante da despesa', d.nm_despesa, [
      { text: 'Cancelar' },
      { text: 'Ver', onPress: () => setFotoAmpliada(d.nome_recibo) },
      { text: 'Substituir', onPress: () => capturarRecibo(d) },
      {
        text: 'Remover',
        onPress: async () => {
          try {
            const arquivo = new File(d.nome_recibo);
            if (arquivo.exists) arquivo.delete();
          } catch {
            // best-effort: se o arquivo já não existir, ignora
          }
          await excluirRecibo(idSinistro, d.id_sinidesp);
          await recarregarDespesas();
        },
      },
    ]);
  }

  function atualizarKm(campo: 'kmInicial' | 'kmFinal', valor: string) {
    setDeslocamento((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvarKm() {
    if (!deslocamento.kmInicial.trim()) {
      mostrarAlerta('Campo obrigatório', 'Informe o KM de Saída');
      return;
    }
    if (!deslocamento.kmFinal.trim()) {
      mostrarAlerta('Campo obrigatório', 'Informe o KM de Chegada');
      return;
    }
    if (paraNumero(deslocamento.kmInicial) > paraNumero(deslocamento.kmFinal)) {
      mostrarAlerta('Atenção', 'KM de saída não pode ser maior que a chegada');
      return;
    }

    setSalvandoKm(true);
    try {
      await salvarDeslocamento(idSinistro, deslocamento.kmInicial, deslocamento.kmFinal);
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!');
    } finally {
      setSalvandoKm(false);
    }
  }

  function voltar() {
    router.back();
  }

  const totalFormulario = form ? paraNumero(form.qtde) * paraNumero(form.vlr_uni) : 0;
  const kmTotal = paraNumero(deslocamento.kmFinal) - paraNumero(deslocamento.kmInicial);
  const totalGeral = despesas.reduce((soma, d) => soma + paraNumero(d.vlr_tot), 0);

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
          <Text style={styles.headerTitulo}>Despesas de Viagem</Text>
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

      <View style={styles.segmentado}>
        <Pressable style={[styles.segmentoBotao, aba === 'despesas' && styles.segmentoBotaoAtivo]} onPress={() => setAba('despesas')}>
          <Ionicons name="cash-outline" size={16} color={aba === 'despesas' ? '#fff' : '#1c3d5a'} />
          <Text style={[styles.segmentoTexto, aba === 'despesas' && styles.segmentoTextoAtivo]}>Despesas</Text>
        </Pressable>
        <Pressable style={[styles.segmentoBotao, aba === 'deslocamento' && styles.segmentoBotaoAtivo]} onPress={() => setAba('deslocamento')}>
          <Ionicons name="car-outline" size={16} color={aba === 'deslocamento' ? '#fff' : '#1c3d5a'} />
          <Text style={[styles.segmentoTexto, aba === 'deslocamento' && styles.segmentoTextoAtivo]}>Deslocamento</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {aba === 'despesas' && (
          <>
            {!form && (
              <Pressable style={styles.botaoAdicionar} onPress={novaDespesa}>
                <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
                <Text style={styles.botaoAdicionarTexto}>Nova despesa</Text>
              </Pressable>
            )}

            {!form && despesas.length === 0 && <Text style={styles.vazioTexto}>Nenhuma despesa encontrada.</Text>}

            {!form &&
              despesas.map((d) => (
                <View key={d.id_sinidesp} style={styles.cardDespesa}>
                  <Pressable style={styles.linhaDespesa} onPress={() => editarDespesa(d)}>
                    <View style={styles.infoDespesa}>
                      <Text style={styles.nomeDespesa} numberOfLines={1}>
                        {d.nm_despesa}
                        {d.comple ? ` - ${d.comple}` : ''}
                      </Text>
                      <Text style={styles.valorDespesa}>{formatarMoeda(d.vlr_tot)}</Text>
                    </View>
                    <Pressable hitSlop={10} onPress={() => confirmarExclusao(d)}>
                      <Ionicons name="trash-outline" size={20} color="#d32f2f" />
                    </Pressable>
                  </Pressable>
                  <Pressable style={styles.botaoRecibo} onPress={() => tocarRecibo(d)} disabled={processandoRecibo}>
                    {d.nome_recibo ? (
                      <Image source={{ uri: d.nome_recibo }} style={styles.miniaturaRecibo} />
                    ) : (
                      <Ionicons name="camera-outline" size={18} color="#1c3d5a" />
                    )}
                    <Text style={styles.botaoReciboTexto}>
                      {d.nome_recibo ? 'Comprovante anexado' : 'Fotografar comprovante'}
                    </Text>
                  </Pressable>
                </View>
              ))}

            {!form && despesas.length > 0 && (
              <View style={styles.linhaTotal}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValor}>
                  {totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </Text>
              </View>
            )}

            {form && (
              <Secao titulo={form.id_sinidesp ? 'Editar Despesa' : 'Nova Despesa'}>
                <Selecao
                  label="Despesa"
                  valor={form.id_despesa}
                  opcoes={opcoesDespesa}
                  onChange={mudarDespesaSelecionada}
                  obrigatorio
                />
                <Campo label="Quantidade" obrigatorio value={form.qtde} onChangeText={(v) => atualizarCampo('qtde', v)} keyboardType="numeric" />
                <Campo
                  label="Valor Unitário"
                  obrigatorio
                  value={form.vlr_uni}
                  onChangeText={(v) => atualizarCampo('vlr_uni', v)}
                  keyboardType="numeric"
                />
                {limite && (
                  <Text style={styles.dicaLimite}>
                    Qtde. permitida: {limite.qtdeIni} a {limite.qtdeFim} · Valor permitido: R$ {limite.limiteIni} a R${' '}
                    {limite.limiteFim}
                  </Text>
                )}
                <Text style={styles.totalCalculado}>Total: {totalFormulario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text>

                <Campo
                  label="Nº Despesa"
                  obrigatorio={config.obrigaIdentificacao}
                  value={form.nro_despesa}
                  onChangeText={(v) => atualizarCampo('nro_despesa', v)}
                />
                <CampoData
                  label="Data"
                  obrigatorio={config.obrigaIdentificacao}
                  valor={form.data_desp}
                  onChange={(v) => atualizarCampo('data_desp', v)}
                />
                <Campo label="Observações" value={form.comple} onChangeText={(v) => atualizarCampo('comple', v)} />

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
                        <Text style={styles.botaoSalvarTexto}>Salvar Despesa</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </Secao>
            )}
          </>
        )}

        {aba === 'deslocamento' && (
          <Secao titulo="Deslocamento">
            <Campo
              label="KM Saída"
              value={deslocamento.kmInicial}
              onChangeText={(v) => atualizarKm('kmInicial', v)}
              keyboardType="numeric"
            />
            <Campo
              label="KM Chegada"
              value={deslocamento.kmFinal}
              onChangeText={(v) => atualizarKm('kmFinal', v)}
              keyboardType="numeric"
            />
            <Text style={styles.totalCalculado}>Total KM: {paraTexto(kmTotal)}</Text>

            <Pressable style={styles.botaoSalvar} onPress={salvarKm} disabled={salvandoKm}>
              {salvandoKm ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.botaoSalvarTexto}>Salvar Deslocamento</Text>
                </>
              )}
            </Pressable>
          </Secao>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={!!fotoAmpliada} transparent animationType="fade" onRequestClose={() => setFotoAmpliada(null)}>
        <Pressable style={styles.modalFundo} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada && <Image source={{ uri: fotoAmpliada }} style={styles.modalImagem} resizeMode="contain" />}
        </Pressable>
      </Modal>
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
  segmentado: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segmentoBotao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#eef2f5',
  },
  segmentoBotaoAtivo: {
    backgroundColor: '#1c3d5a',
  },
  segmentoTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
  },
  segmentoTextoAtivo: {
    color: '#fff',
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
  cardDespesa: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  linhaDespesa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoDespesa: {
    flex: 1,
  },
  nomeDespesa: {
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
  },
  valorDespesa: {
    color: '#2a88ad',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 2,
  },
  botaoRecibo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2f5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  botaoReciboTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 12,
  },
  miniaturaRecibo: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#e6e9ec',
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
  dicaLimite: {
    fontSize: 12,
    color: '#8a97a3',
    marginBottom: 10,
    marginTop: -4,
  },
  totalCalculado: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c3d5a',
    marginBottom: 12,
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
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImagem: {
    width: '100%',
    height: '80%',
  },
});
