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
import {
  buscarDadosSegurado,
  buscarSeguradoraDoSinistro,
  excluirBeneficiario,
  existeCoberturaCadastrada,
  listarBancos,
  listarBeneficiarios,
  listarCoberturasDoSinistroPorTipo,
  listarFormasPagamento,
  listarTiposConta,
  listarTiposCoberturaDoSinistro,
  salvarBeneficiario,
  type BeneficiarioResumo,
  type DadosBeneficiario,
  type DadosSegurado,
} from '../../../src/db/beneficiarios';
import { buscarSinistroPorId } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { cnpjValido, cpfValido, formatarCNPJ, formatarCPF } from '../../../src/utils/documentos';

const OPCOES_QUEM: OpcaoSelecao[] = [
  { valor: 'Não Identificado', label: 'Não Identificado' },
  { valor: 'O segurado', label: 'O segurado' },
  { valor: 'Oficina', label: 'Oficina' },
  { valor: 'Credor Hipot.', label: 'Credor Hipot.' },
  { valor: 'Proprietário', label: 'Proprietário' },
  { valor: 'Terceiro', label: 'Terceiro' },
  { valor: 'Familiar', label: 'Familiar' },
  { valor: 'Administradora', label: 'Administradora' },
];

const OPCOES_TIPO_DOC: OpcaoSelecao[] = [
  { valor: 'F', label: 'CPF' },
  { valor: 'J', label: 'CNPJ' },
];

const OPCOES_NOTA_AVA: OpcaoSelecao[] = Array.from({ length: 11 }, (_, n) => ({ valor: n, label: String(n) }));

interface FormBeneficiario {
  id_beneficio: number | null;
  tipo_cob: string;
  id_cobertura: string;
  id_formapag: string;
  quem: string;
  nm_beneficiario: string;
  tipo_doc: string;
  cpf_beneficiario: string;
  id_banco: string;
  codban: string;
  agencia: string;
  conta: string;
  id_tipoconta: string;
  digage: string;
  digconta: string;
  nota_ava: string;
}

const FORM_VAZIO: FormBeneficiario = {
  id_beneficio: null,
  tipo_cob: '',
  id_cobertura: '',
  id_formapag: '',
  quem: '',
  nm_beneficiario: '',
  tipo_doc: 'F',
  cpf_beneficiario: '',
  id_banco: '',
  codban: '',
  agencia: '',
  conta: '',
  id_tipoconta: '',
  digage: '',
  digconta: '',
  nota_ava: '',
};

function formInicial(b: BeneficiarioResumo): FormBeneficiario {
  return {
    id_beneficio: b.id_beneficio,
    tipo_cob: b.tipo_cob,
    id_cobertura: String(b.id_cobertura),
    id_formapag: b.id_formapag != null ? String(b.id_formapag) : '',
    quem: b.quem,
    nm_beneficiario: b.nm_beneficiario,
    tipo_doc: b.tipo_doc || 'F',
    cpf_beneficiario: b.cpf_beneficiario,
    id_banco: b.id_banco != null ? String(b.id_banco) : '',
    codban: b.banco,
    agencia: b.agencia,
    conta: b.conta,
    id_tipoconta: b.id_tipoconta != null ? String(b.id_tipoconta) : '',
    digage: b.digage,
    digconta: b.digconta,
    nota_ava: b.nota_ava != null ? String(b.nota_ava) : '',
  };
}

export default function BeneficiariosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [temCobertura, setTemCobertura] = useState(false);
  const [beneficiarios, setBeneficiarios] = useState<BeneficiarioResumo[]>([]);
  const [form, setForm] = useState<FormBeneficiario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroCampo, setErroCampo] = useState<{ campo: keyof FormBeneficiario; mensagem: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const refTipoCob = useRef<View>(null);
  const refIdCobertura = useRef<View>(null);
  const refNmBeneficiario = useRef<TextInput>(null);
  const refCpfBeneficiario = useRef<TextInput>(null);
  const refCodban = useRef<TextInput>(null);
  const refNotaAva = useRef<View>(null);

  function erroDoCampo(campo: keyof FormBeneficiario): string | undefined {
    return erroCampo?.campo === campo ? erroCampo.mensagem : undefined;
  }

  function focarCampoComErro(campo: keyof FormBeneficiario, mensagem: string) {
    setErroCampo({ campo, mensagem });

    const refsPorCampo: Partial<Record<keyof FormBeneficiario, RefObject<TextInput | View | null>>> = {
      tipo_cob: refTipoCob,
      id_cobertura: refIdCobertura,
      nm_beneficiario: refNmBeneficiario,
      cpf_beneficiario: refCpfBeneficiario,
      codban: refCodban,
      nota_ava: refNotaAva,
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

  const [dadosSegurado, setDadosSegurado] = useState<DadosSegurado | null>(null);
  const [idSeguradora, setIdSeguradora] = useState<number | null>(null);
  const [opcoesTipoCobertura, setOpcoesTipoCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesCobertura, setOpcoesCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesFormaPag, setOpcoesFormaPag] = useState<OpcaoSelecao[]>([]);
  const [opcoesTipoConta, setOpcoesTipoConta] = useState<OpcaoSelecao[]>([]);
  const [opcoesBancos, setOpcoesBancos] = useState<OpcaoSelecao[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, temCob, lista, segurado, idSeg, tiposCobertura, formasPag, bancos] = await Promise.all([
            buscarSinistroPorId(idSinistro),
            existeCoberturaCadastrada(idSinistro),
            listarBeneficiarios(idSinistro),
            buscarDadosSegurado(idSinistro),
            buscarSeguradoraDoSinistro(idSinistro),
            listarTiposCoberturaDoSinistro(idSinistro),
            listarFormasPagamento(idSinistro),
            listarBancos(),
          ]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setTemCobertura(temCob);
          setBeneficiarios(lista);
          setDadosSegurado(segurado);
          setIdSeguradora(idSeg);
          setOpcoesTipoCobertura(tiposCobertura);
          setOpcoesFormaPag(formasPag);
          setOpcoesBancos(bancos);
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

  function novoBeneficiario() {
    setOpcoesCobertura([]);
    setOpcoesTipoConta([]);
    setErroCampo(null);
    mostrarAlerta('Sugestão', 'O segurado é o beneficiário?', [
      {
        text: 'Não',
        onPress: () => setForm(FORM_VAZIO),
      },
      {
        text: 'Sim',
        onPress: () =>
          setForm({
            ...FORM_VAZIO,
            quem: 'O segurado',
            nm_beneficiario: dadosSegurado?.nome ?? '',
            tipo_doc: dadosSegurado?.tipoDoc || 'F',
            cpf_beneficiario: dadosSegurado?.cpf ?? '',
          }),
      },
    ]);
  }

  async function editarBeneficiario(b: BeneficiarioResumo) {
    const [coberturas, tiposConta] = await Promise.all([
      listarCoberturasDoSinistroPorTipo(idSinistro, b.tipo_cob),
      b.id_formapag && idSeguradora ? listarTiposConta(idSeguradora, b.id_formapag) : Promise.resolve([]),
    ]);
    setOpcoesCobertura(coberturas);
    setOpcoesTipoConta(tiposConta);
    setErroCampo(null);
    setForm(formInicial(b));
  }

  async function mudarTipoCobertura(tipo: string) {
    setForm((atual) => (atual ? { ...atual, tipo_cob: tipo, id_cobertura: '' } : atual));
    setErroCampo((atual) => (atual?.campo === 'tipo_cob' ? null : atual));
    const coberturas = await listarCoberturasDoSinistroPorTipo(idSinistro, tipo);
    setOpcoesCobertura(coberturas);
  }

  async function mudarFormaPagamento(idFormaPag: string) {
    setForm((atual) => (atual ? { ...atual, id_formapag: idFormaPag, id_tipoconta: '' } : atual));
    if (!idSeguradora || !idFormaPag) {
      setOpcoesTipoConta([]);
      return;
    }
    const tiposConta = await listarTiposConta(idSeguradora, Number(idFormaPag));
    setOpcoesTipoConta(tiposConta);
  }

  function mudarQuem(valor: string) {
    if (valor === 'O segurado' && dadosSegurado) {
      setForm((atual) =>
        atual
          ? {
              ...atual,
              quem: valor,
              nm_beneficiario: dadosSegurado.nome,
              tipo_doc: dadosSegurado.tipoDoc || 'F',
              cpf_beneficiario: dadosSegurado.cpf,
            }
          : atual,
      );
      return;
    }
    atualizarCampo('quem', valor);
  }

  function atualizarCampo<K extends keyof FormBeneficiario>(campo: K, valor: FormBeneficiario[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    setErroCampo((atual) => (atual?.campo === campo ? null : atual));
  }

  function validar(f: FormBeneficiario): { campo: keyof FormBeneficiario; mensagem: string } | null {
    if (!f.tipo_cob) return { campo: 'tipo_cob', mensagem: 'Informe o tipo da cobertura' };
    if (!f.id_cobertura) return { campo: 'id_cobertura', mensagem: 'Informe a cobertura' };
    if (!f.nm_beneficiario.trim()) return { campo: 'nm_beneficiario', mensagem: 'Informe o nome' };
    if (f.cpf_beneficiario.trim()) {
      const docInvalido = f.tipo_doc === 'J' ? !cnpjValido(f.cpf_beneficiario) : !cpfValido(f.cpf_beneficiario);
      if (docInvalido) {
        return { campo: 'cpf_beneficiario', mensagem: f.tipo_doc === 'J' ? 'CNPJ inválido' : 'CPF inválido' };
      }
    }
    if (!f.id_banco && !f.codban.trim()) {
      return { campo: 'codban', mensagem: 'Se o banco não for informado, digite o código do banco' };
    }
    if (dadosSegurado?.avaliaSegura && !f.nota_ava) {
      return { campo: 'nota_ava', mensagem: 'Informe a nota de recomendação' };
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

    const dados: DadosBeneficiario = {
      id_cobertura: Number(form.id_cobertura),
      id_formapag: form.id_formapag ? Number(form.id_formapag) : null,
      quem: form.quem,
      nm_beneficiario: form.nm_beneficiario.trim(),
      tipo_doc: form.tipo_doc,
      cpf_beneficiario: form.cpf_beneficiario,
      id_banco: form.id_banco ? Number(form.id_banco) : null,
      codban: form.codban,
      agencia: form.agencia,
      conta: form.conta,
      id_tipoconta: form.id_tipoconta ? Number(form.id_tipoconta) : null,
      digage: form.digage,
      digconta: form.digconta,
      nota_ava: form.nota_ava ? Number(form.nota_ava) : null,
    };

    setSalvando(true);
    try {
      await salvarBeneficiario(idSinistro, form.id_beneficio, dados);
      const lista = await listarBeneficiarios(idSinistro);
      setBeneficiarios(lista);
      setForm(null);
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando beneficiário.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao(b: BeneficiarioResumo) {
    mostrarAlerta('Remover Beneficiário?', b.nm_beneficiario, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirBeneficiario(idSinistro, b.id_cobertura, b.id_beneficio);
          const lista = await listarBeneficiarios(idSinistro);
          setBeneficiarios(lista);
          if (form?.id_beneficio === b.id_beneficio) setForm(null);
        },
      },
    ]);
  }

  function voltar() {
    if (form) {
      mostrarAlerta('Beneficiário em edição', 'Salve ou cancele o beneficiário em edição antes de continuar.');
      return;
    }
    router.back();
  }

  function proximo() {
    // Porta de ProximaTela (cadbeneficiario_def.js): Beneficiários -> Planilha de Apuração.
    if (form) {
      mostrarAlerta('Beneficiário em edição', 'Salve ou cancele o beneficiário em edição antes de continuar.');
      return;
    }
    router.replace({ pathname: '/sinistro/[id]/planilha', params: { id: String(idSinistro) } });
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
          <Text style={styles.headerTitulo}>Beneficiário(s)</Text>
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
        {!temCobertura && (
          <View style={styles.avisoCobertura}>
            <Ionicons name="alert-circle" size={20} color="#8f2b23" />
            <Text style={styles.avisoCoberturaTexto}>
              Cadastre ao menos uma cobertura antes de adicionar beneficiários — o beneficiário precisa estar vinculado a
              uma cobertura já existente.
            </Text>
          </View>
        )}

        {temCobertura && !form && (
          <Pressable style={styles.botaoAdicionar} onPress={novoBeneficiario}>
            <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
            <Text style={styles.botaoAdicionarTexto}>Novo beneficiário</Text>
          </Pressable>
        )}

        {!form && beneficiarios.length === 0 && <Text style={styles.vazioTexto}>Nenhum beneficiário encontrado.</Text>}

        {!form &&
          beneficiarios.map((b) => (
            <Pressable key={b.id_beneficio} style={styles.itemLista} onPress={() => editarBeneficiario(b)}>
              <Text style={styles.itemListaTexto} numberOfLines={1}>
                {b.nm_beneficiario} - {b.cpf_beneficiario}
              </Text>
              <Pressable hitSlop={10} onPress={() => confirmarExclusao(b)}>
                <Ionicons name="trash-outline" size={20} color="#d32f2f" />
              </Pressable>
            </Pressable>
          ))}

        {form && (
          <Secao titulo={form.id_beneficio ? 'Editar Beneficiário' : 'Novo Beneficiário'}>
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
              label="Pagamento"
              valor={form.id_formapag}
              opcoes={opcoesFormaPag}
              onChange={mudarFormaPagamento}
            />
            <Selecao label="Quem" valor={form.quem} opcoes={OPCOES_QUEM} onChange={mudarQuem} />
            <Campo
              ref={refNmBeneficiario}
              label="Nome"
              obrigatorio
              erro={erroDoCampo('nm_beneficiario')}
              value={form.nm_beneficiario}
              onChangeText={(v) => atualizarCampo('nm_beneficiario', v)}
            />
            <Selecao
              label="Tipo Documento"
              valor={form.tipo_doc}
              opcoes={OPCOES_TIPO_DOC}
              onChange={(v) => atualizarCampo('tipo_doc', v)}
            />
            <Campo
              ref={refCpfBeneficiario}
              label={form.tipo_doc === 'J' ? 'CNPJ' : 'CPF'}
              erro={erroDoCampo('cpf_beneficiario')}
              value={form.cpf_beneficiario}
              onChangeText={(v) =>
                atualizarCampo('cpf_beneficiario', form.tipo_doc === 'J' ? formatarCNPJ(v) : formatarCPF(v))
              }
              keyboardType={form.tipo_doc === 'J' ? 'default' : 'number-pad'}
              autoCapitalize={form.tipo_doc === 'J' ? 'characters' : 'none'}
              maxLength={form.tipo_doc === 'J' ? 18 : 14}
            />
            <Selecao
              label="Banco"
              valor={form.id_banco}
              opcoes={opcoesBancos}
              onChange={(v) => atualizarCampo('id_banco', v)}
            />
            <Campo
              ref={refCodban}
              label="Código do banco (se não estiver na lista)"
              erro={erroDoCampo('codban')}
              value={form.codban}
              onChangeText={(v) => atualizarCampo('codban', v)}
              keyboardType="numeric"
            />
            <View style={styles.linhaBancaria}>
              <View style={styles.flex1}>
                <Campo label="Agência" value={form.agencia} onChangeText={(v) => atualizarCampo('agencia', v)} />
              </View>
              <View style={styles.campoDigito}>
                <Campo
                  label="Dígito"
                  value={form.digage}
                  onChangeText={(v) => atualizarCampo('digage', v)}
                  maxLength={3}
                />
              </View>
            </View>
            <View style={styles.linhaBancaria}>
              <View style={styles.flex1}>
                <Campo label="Conta" value={form.conta} onChangeText={(v) => atualizarCampo('conta', v)} />
              </View>
              <View style={styles.campoDigito}>
                <Campo
                  label="Dígito"
                  value={form.digconta}
                  onChangeText={(v) => atualizarCampo('digconta', v)}
                  maxLength={3}
                />
              </View>
            </View>
            <Selecao
              label="Tipo Conta"
              valor={form.id_tipoconta}
              opcoes={opcoesTipoConta}
              onChange={(v) => atualizarCampo('id_tipoconta', v)}
            />
            <Selecao
              ref={refNotaAva}
              label="Nota de Recomendação"
              valor={form.nota_ava}
              opcoes={OPCOES_NOTA_AVA}
              onChange={(v) => atualizarCampo('nota_ava', v)}
              obrigatorio={!!dadosSegurado?.avaliaSegura}
              erro={erroDoCampo('nota_ava')}
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
                    <Text style={styles.botaoSalvarTexto}>Salvar Beneficiário</Text>
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
  linhaBancaria: {
    flexDirection: 'row',
    gap: 10,
  },
  campoDigito: {
    width: 80,
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
  itemListaTexto: {
    flex: 1,
    color: '#1c3d5a',
    fontWeight: '600',
    fontSize: 14,
    marginRight: 12,
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
