import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';

import { Campo } from '../../../src/components/form/Campo';
import { CampoData } from '../../../src/components/form/CampoData';
import { Interruptor } from '../../../src/components/form/Interruptor';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import {
  buscarCorretora,
  buscarSinistroPorId,
  listarCausas,
  listarCidadesPorEstado,
  listarCodigosTipoApolice,
  listarEstados,
  listarRelacoesSeg,
  listarTiposApolice,
  salvarCadastroSinistro,
  type CorretoraInfo,
  type TipoApoliceCodigo,
} from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { cnpjValido, cpfValido, formatarCNPJ, formatarCPF } from '../../../src/utils/documentos';
import { formatarTelefone } from '../../../src/utils/telefone';

const OPCOES_TIPO_DOC: OpcaoSelecao[] = [
  { valor: 'F', label: 'Física' },
  { valor: 'J', label: 'Jurídica' },
];

const OPCOES_TRATAMENTO: OpcaoSelecao[] = [
  { valor: 'pelo Sr.', label: 'Sr.' },
  { valor: 'pela Sra.', label: 'Sra.' },
  { valor: 'pelo Dr.', label: 'Dr.' },
  { valor: 'pela Dra.', label: 'Dra.' },
];

const OPCOES_SIM_NAO: OpcaoSelecao[] = [
  { valor: 'S', label: 'Sim' },
  { valor: 'N', label: 'Não' },
];

const OPCOES_PRESERVA: OpcaoSelecao[] = [
  { valor: 'S', label: 'Sim' },
  { valor: 'N', label: 'Não' },
  { valor: 'A', label: 'A verificar' },
];

interface FormState {
  nm_segurado: string;
  tipo_doc: string;
  nro_docto: string;
  endereco: string;
  nro_predio: string;
  nro_unidade: string;
  bairro: string;
  cep: string;
  id_estado: string;
  id_cidade: string;
  telefone: string;
  celular: string;
  email: string;
  contatoseg: string;
  proposta_seg: string;
  nro_sinistro: string;
  apolice: string;
  id_tipoapolice: string;
  local_determinado: boolean;
  territorio_nacional: boolean;
  tratar_ate: string;
  atendente: string;
  rg_atendente: string;
  id_relacaoseg: string;
  mesma_pessoa: string;
  tratar_ass: string;
  atendente_ass: string;
  rg_assina: string;
  id_relacaoass: string;
  id_causa_abe: string;
  id_causa: string;
  data_ocor: string;
  hora_incerta: boolean;
  hora_ocor: string;
  datavig_ini: string;
  datavig_fim: string;
  data_vistoria: string;
  data_aviso: string;
  id_preserva: string;
}

const FORM_VAZIO: FormState = {
  nm_segurado: '',
  tipo_doc: '',
  nro_docto: '',
  endereco: '',
  nro_predio: '',
  nro_unidade: '',
  bairro: '',
  cep: '',
  id_estado: '',
  id_cidade: '',
  telefone: '',
  celular: '',
  email: '',
  contatoseg: '',
  proposta_seg: '',
  nro_sinistro: '',
  apolice: '',
  id_tipoapolice: '',
  local_determinado: false,
  territorio_nacional: false,
  tratar_ate: '',
  atendente: '',
  rg_atendente: '',
  id_relacaoseg: '',
  mesma_pessoa: '',
  tratar_ass: '',
  atendente_ass: '',
  rg_assina: '',
  id_relacaoass: '',
  id_causa_abe: '',
  id_causa: '',
  data_ocor: '',
  hora_incerta: false,
  hora_ocor: '',
  datavig_ini: '',
  datavig_fim: '',
  data_vistoria: '',
  data_aviso: '',
  id_preserva: '',
};

export default function CadastroSinistroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [estados, setEstados] = useState<OpcaoSelecao[]>([]);
  const [cidades, setCidades] = useState<OpcaoSelecao[]>([]);
  const [causas, setCausas] = useState<OpcaoSelecao[]>([]);
  const [relacoes, setRelacoes] = useState<OpcaoSelecao[]>([]);
  const [tiposApolice, setTiposApolice] = useState<OpcaoSelecao[]>([]);
  const [codigosTipoApolice, setCodigosTipoApolice] = useState<TipoApoliceCodigo[]>([]);
  const [corretora, setCorretora] = useState<CorretoraInfo | null>(null);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [erroCampo, setErroCampo] = useState<{ campo: keyof FormState; mensagem: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const refNmSegurado = useRef<TextInput>(null);
  const refNroDocto = useRef<TextInput>(null);
  const refEndereco = useRef<TextInput>(null);
  const refIdEstado = useRef<View>(null);
  const refIdCidade = useRef<View>(null);
  const refTelefone = useRef<TextInput>(null);
  const refIdCausa = useRef<View>(null);
  const refIdCausaAbe = useRef<View>(null);
  const refDataOcor = useRef<View>(null);
  const refDataVistoria = useRef<View>(null);
  const refDataAviso = useRef<View>(null);
  const refTratarAte = useRef<View>(null);
  const refAtendente = useRef<TextInput>(null);
  const refIdRelacaoseg = useRef<View>(null);
  const refRgAtendente = useRef<TextInput>(null);
  const refMesmaPessoa = useRef<View>(null);
  const refTratarAss = useRef<View>(null);
  const refAtendenteAss = useRef<TextInput>(null);
  const refIdRelacaoass = useRef<View>(null);
  const refRgAssina = useRef<TextInput>(null);
  const refIdPreserva = useRef<View>(null);

  function erroDoCampo(campo: keyof FormState): string | undefined {
    return erroCampo?.campo === campo ? erroCampo.mensagem : undefined;
  }

  useEffect(() => {
    if (!idSinistro) return;
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      try {
        const [sinistro, listaEstados, listaCausas, listaRelacoes, listaTiposApolice, listaCodigosTipoApolice] =
          await Promise.all([
            buscarSinistroPorId(idSinistro),
            listarEstados(),
            listarCausas(),
            listarRelacoesSeg(),
            listarTiposApolice(),
            listarCodigosTipoApolice(),
          ]);
        if (cancelado || !sinistro) return;

        setEstados(listaEstados);
        setCausas(listaCausas);
        setRelacoes(listaRelacoes);
        setTiposApolice(listaTiposApolice);
        setCodigosTipoApolice(listaCodigosTipoApolice);
        setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });

        if (sinistro.id_estado) {
          const listaCidades = await listarCidadesPorEstado(sinistro.id_estado);
          if (!cancelado) setCidades(listaCidades);
        }

        if (sinistro.id_corretora) {
          const dadosCorretora = await buscarCorretora(sinistro.id_corretora);
          if (!cancelado) setCorretora(dadosCorretora);
        }

        if (!cancelado) {
          setForm({
            nm_segurado: sinistro.nm_segurado ?? '',
            tipo_doc: sinistro.tipo_doc ?? '',
            nro_docto: sinistro.cpf ?? '',
            endereco: sinistro.endereco ?? '',
            nro_predio: sinistro.nro_predio ?? '',
            nro_unidade: sinistro.nro_unidade ?? '',
            bairro: sinistro.bairro ?? '',
            cep: sinistro.cep ?? '',
            id_estado: sinistro.id_estado ?? '',
            id_cidade: '', // preenchido abaixo após confirmar que pertence à lista carregada
            telefone: sinistro.fone ?? '',
            celular: sinistro.celular ?? '',
            email: sinistro.emailseg ?? '',
            contatoseg: sinistro.contatoseg ?? '',
            proposta_seg: sinistro.proposta_seg ?? '',
            nro_sinistro: sinistro.nro_sinistro ?? '',
            apolice: sinistro.apolice ?? '',
            id_tipoapolice: sinistro.id_tipoapolice != null ? String(sinistro.id_tipoapolice) : '',
            local_determinado: !!sinistro.local_determinado,
            territorio_nacional: !!sinistro.territorio_nacional,
            tratar_ate: sinistro.tratar_ate?.trim() ?? '',
            atendente: sinistro.atendente ?? '',
            rg_atendente: sinistro.rg_atendente ?? '',
            id_relacaoseg: sinistro.id_relacaoseg != null ? String(sinistro.id_relacaoseg) : '',
            mesma_pessoa: sinistro.mesma_pessoa ?? '',
            tratar_ass: sinistro.tratar_ass?.trim() ?? '',
            atendente_ass: sinistro.atendente_ass ?? '',
            rg_assina: sinistro.rg_assina ?? '',
            id_relacaoass: sinistro.id_relacaoseg_ass != null ? String(sinistro.id_relacaoseg_ass) : '',
            id_causa_abe: sinistro.id_causa_abe != null ? String(sinistro.id_causa_abe) : '',
            id_causa: sinistro.id_causa != null ? String(sinistro.id_causa) : '',
            data_ocor: sinistro.data_ocor ?? '',
            hora_incerta: !!sinistro.hora_incerta,
            hora_ocor: sinistro.hora_ocor ?? '',
            datavig_ini: sinistro.datavig_ini ?? '',
            datavig_fim: sinistro.datavig_fim ?? '',
            data_vistoria: sinistro.data_vistoria ?? '',
            data_aviso: sinistro.data_aviso ?? '',
            id_preserva: sinistro.id_preserva ?? '',
          });
          // id_cidade setado à parte pra garantir que a lista já está carregada
          setForm((atual) => ({ ...atual, id_cidade: sinistro.id_cidade != null ? String(sinistro.id_cidade) : '' }));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [idSinistro]);

  const atualizar = useCallback(<K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErroCampo((atual) => (atual?.campo === campo ? null : atual));
  }, []);

  async function mudarEstado(novoEstado: string) {
    atualizar('id_estado', novoEstado);
    atualizar('id_cidade', '');
    const lista = await listarCidadesPorEstado(novoEstado);
    setCidades(lista);
  }

  /** Local Determinado/Território Nacional só fazem sentido pra apólice de Máquina — troca pra outro tipo desmarca os dois. */
  function mudarTipoApolice(valor: string) {
    atualizar('id_tipoapolice', valor);
    const codigo = codigosTipoApolice.find((t) => String(t.id_tipoapolice) === valor)?.tipo_apolice;
    if (codigo !== 'MAQ') {
      atualizar('local_determinado', false);
      atualizar('territorio_nacional', false);
    }
  }

  function mudarLocalDeterminado(valor: boolean) {
    atualizar('local_determinado', valor);
    if (valor) atualizar('territorio_nacional', false);
  }

  function mudarTerritorioNacional(valor: boolean) {
    atualizar('territorio_nacional', valor);
    if (valor) atualizar('local_determinado', false);
  }

  function mudarMesmaPessoa(valor: string) {
    atualizar('mesma_pessoa', valor);
    if (valor === 'S') {
      setForm((atual) => ({
        ...atual,
        mesma_pessoa: valor,
        tratar_ass: atual.tratar_ate,
        atendente_ass: atual.atendente,
        rg_assina: atual.rg_atendente,
        id_relacaoass: atual.id_relacaoseg,
      }));
    } else {
      setForm((atual) => ({
        ...atual,
        mesma_pessoa: valor,
        tratar_ass: '',
        atendente_ass: '',
        rg_assina: '',
        id_relacaoass: '',
      }));
    }
  }

  /** Porta de GravarDados (cadprocesso_def_screen.js): mesma ordem e mensagens do sistema legado. */
  function validar(): { campo: keyof FormState; mensagem: string } | null {
    if (!form.nm_segurado.trim()) return { campo: 'nm_segurado', mensagem: 'Informe o nome do segurado' };
    if (form.nro_docto.trim()) {
      const docInvalido = form.tipo_doc === 'J' ? !cnpjValido(form.nro_docto) : !cpfValido(form.nro_docto);
      if (docInvalido) {
        return {
          campo: 'nro_docto',
          mensagem: form.tipo_doc === 'J' ? 'CNPJ inválido' : 'CPF inválido',
        };
      }
    }
    if (!form.endereco.trim()) return { campo: 'endereco', mensagem: 'Informe a endereço' };
    if (!form.id_estado) return { campo: 'id_estado', mensagem: 'Informe a UF' };
    if (!form.id_cidade) return { campo: 'id_cidade', mensagem: 'Informe a cidade' };
    if (!form.telefone.trim()) return { campo: 'telefone', mensagem: 'Informe o telefone' };
    if (!form.id_causa) return { campo: 'id_causa', mensagem: 'Informe a causa segundo o Regulador' };
    if (!form.id_causa_abe) return { campo: 'id_causa_abe', mensagem: 'Informe a causa segundo o Segurado' };
    if (!form.data_ocor) return { campo: 'data_ocor', mensagem: 'Informe a data da ocorrência' };
    if (!form.data_vistoria) return { campo: 'data_vistoria', mensagem: 'Informe a data da visita' };
    if (!form.data_aviso) return { campo: 'data_aviso', mensagem: 'Informe a data do aviso' };
    if (!form.tratar_ate) return { campo: 'tratar_ate', mensagem: 'Informe a tratativa do atendente' };
    if (!form.atendente.trim()) return { campo: 'atendente', mensagem: 'Informe o atendente' };
    if (!form.id_relacaoseg)
      return { campo: 'id_relacaoseg', mensagem: 'Informe a relação do atendente com o segurado' };
    if (!form.rg_atendente.trim()) return { campo: 'rg_atendente', mensagem: 'Informe o CPF do atendente' };
    if (!cpfValido(form.rg_atendente)) return { campo: 'rg_atendente', mensagem: 'CPF do atendente inválido' };
    if (!form.mesma_pessoa)
      return { campo: 'mesma_pessoa', mensagem: 'Informe se quem atendeu é mesma pessoa que assinou' };
    if (!form.tratar_ass) return { campo: 'tratar_ass', mensagem: 'Informe a tratativa do assinante' };
    if (!form.atendente_ass.trim()) return { campo: 'atendente_ass', mensagem: 'Informe quem assinou' };
    if (!form.id_relacaoass)
      return { campo: 'id_relacaoass', mensagem: 'Informe a relação do assinante com o segurado' };
    if (!form.rg_assina.trim()) return { campo: 'rg_assina', mensagem: 'Informe o CPF do assinante' };
    if (!cpfValido(form.rg_assina)) return { campo: 'rg_assina', mensagem: 'CPF do assinante inválido' };
    if (!form.id_preserva) return { campo: 'id_preserva', mensagem: 'Informe se os bens estão preservados' };
    return null;
  }

  function focarCampoComErro(campo: keyof FormState, mensagem: string) {
    setErroCampo({ campo, mensagem });

    const refsPorCampo: Partial<Record<keyof FormState, RefObject<TextInput | View | null>>> = {
      nm_segurado: refNmSegurado,
      nro_docto: refNroDocto,
      endereco: refEndereco,
      id_estado: refIdEstado,
      id_cidade: refIdCidade,
      telefone: refTelefone,
      id_causa: refIdCausa,
      id_causa_abe: refIdCausaAbe,
      data_ocor: refDataOcor,
      data_vistoria: refDataVistoria,
      data_aviso: refDataAviso,
      tratar_ate: refTratarAte,
      atendente: refAtendente,
      id_relacaoseg: refIdRelacaoseg,
      rg_atendente: refRgAtendente,
      mesma_pessoa: refMesmaPessoa,
      tratar_ass: refTratarAss,
      atendente_ass: refAtendenteAss,
      id_relacaoass: refIdRelacaoass,
      rg_assina: refRgAssina,
      id_preserva: refIdPreserva,
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

  async function salvar() {
    const erro = validar();
    if (erro) {
      focarCampoComErro(erro.campo, erro.mensagem);
      return;
    }

    setErroCampo(null);
    setSalvando(true);
    try {
      await salvarCadastroSinistro(idSinistro, {
        nm_segurado: form.nm_segurado.trim(),
        tipo_doc: form.tipo_doc || null,
        cpf: form.nro_docto || null,
        endereco: form.endereco.trim(),
        nro_predio: form.nro_predio || null,
        nro_unidade: form.nro_unidade || null,
        bairro: form.bairro || null,
        cep: form.cep || null,
        id_estado: form.id_estado,
        id_cidade: Number(form.id_cidade),
        fone: form.telefone.trim(),
        celular: form.celular || null,
        emailseg: form.email || null,
        contatoseg: form.contatoseg || null,
        proposta_seg: form.proposta_seg || null,
        nro_sinistro: form.nro_sinistro || null,
        apolice: form.apolice || null,
        id_tipoapolice: form.id_tipoapolice ? Number(form.id_tipoapolice) : null,
        local_determinado: form.local_determinado,
        territorio_nacional: form.territorio_nacional,
        tratar_ate: form.tratar_ate,
        atendente: form.atendente.trim(),
        rg_atendente: form.rg_atendente.trim(),
        id_relacaoseg: Number(form.id_relacaoseg),
        mesma_pessoa: form.mesma_pessoa,
        tratar_ass: form.tratar_ass,
        atendente_ass: form.atendente_ass.trim(),
        rg_assina: form.rg_assina.trim(),
        id_relacaoseg_ass: Number(form.id_relacaoass),
        id_causa_abe: Number(form.id_causa_abe),
        id_causa: Number(form.id_causa),
        data_ocor: form.data_ocor,
        hora_incerta: form.hora_incerta,
        hora_ocor: form.hora_ocor || null,
        datavig_ini: form.datavig_ini || null,
        datavig_fim: form.datavig_fim || null,
        data_vistoria: form.data_vistoria,
        data_aviso: form.data_aviso,
        id_preserva: form.id_preserva,
      });
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!', [
        {
          text: 'OK',
          onPress: () =>
            router.replace({ pathname: '/sinistro/[id]/relato', params: { id: String(idSinistro), texto: '4' } }),
        },
      ]);
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando processo');
    } finally {
      setSalvando(false);
    }
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
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitulo}>Cadastro Geral</Text>
          <Text style={styles.headerSubtitulo} numberOfLines={1}>
            {cabecalho.segurado} · Sinistro {cabecalho.sinistro}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]/coordenadas', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoCoordenadas}
        >
          <Ionicons name="location-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoCoordenadas}
        >
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/sinistro/[id]/transferencia', params: { id: String(idSinistro) } })}
          hitSlop={10}
          style={styles.botaoCoordenadas}
        >
          <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {erroCampo && (
          <View style={styles.bannerErro}>
            <Ionicons name="alert-circle" size={20} color="#b3261e" />
            <Text style={styles.bannerErroTexto}>{erroCampo.mensagem}</Text>
          </View>
        )}

        <Secao titulo="Informações do Segurado">
          <Campo
            ref={refNmSegurado}
            label="Segurado"
            obrigatorio
            erro={erroDoCampo('nm_segurado')}
            value={form.nm_segurado}
            onChangeText={(v) => atualizar('nm_segurado', v)}
          />
          <Selecao label="Tipo Doc." valor={form.tipo_doc} opcoes={OPCOES_TIPO_DOC} onChange={(v) => atualizar('tipo_doc', v)} />
          <Campo
            ref={refNroDocto}
            label={form.tipo_doc === 'J' ? 'CNPJ' : 'CPF'}
            erro={erroDoCampo('nro_docto')}
            value={form.nro_docto}
            onChangeText={(v) =>
              atualizar('nro_docto', form.tipo_doc === 'J' ? formatarCNPJ(v) : formatarCPF(v))
            }
            keyboardType={form.tipo_doc === 'J' ? 'default' : 'number-pad'}
            autoCapitalize={form.tipo_doc === 'J' ? 'characters' : 'none'}
            maxLength={form.tipo_doc === 'J' ? 18 : 14}
          />
          <Campo
            ref={refEndereco}
            label="Endereço"
            obrigatorio
            erro={erroDoCampo('endereco')}
            value={form.endereco}
            onChangeText={(v) => atualizar('endereco', v)}
          />
          <Campo label="Nº prédio" value={form.nro_predio} onChangeText={(v) => atualizar('nro_predio', v)} />
          <Campo label="Nº unidade" value={form.nro_unidade} onChangeText={(v) => atualizar('nro_unidade', v)} />
          <Campo label="Bairro" value={form.bairro} onChangeText={(v) => atualizar('bairro', v)} />
          <Campo label="CEP" value={form.cep} onChangeText={(v) => atualizar('cep', v)} keyboardType="number-pad" />
          <Selecao
            ref={refIdEstado}
            label="UF"
            valor={form.id_estado}
            opcoes={estados}
            onChange={mudarEstado}
            obrigatorio
            erro={erroDoCampo('id_estado')}
          />
          <Selecao
            ref={refIdCidade}
            label="Cidade"
            valor={form.id_cidade}
            opcoes={cidades}
            onChange={(v) => atualizar('id_cidade', v)}
            obrigatorio
            erro={erroDoCampo('id_cidade')}
          />
          <Campo
            ref={refTelefone}
            label="Telefone"
            obrigatorio
            erro={erroDoCampo('telefone')}
            value={form.telefone}
            onChangeText={(v) => atualizar('telefone', formatarTelefone(v))}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <Campo
            label="Celular"
            value={form.celular}
            onChangeText={(v) => atualizar('celular', formatarTelefone(v))}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <Campo label="Email" value={form.email} onChangeText={(v) => atualizar('email', v)} keyboardType="email-address" autoCapitalize="none" />
          <Campo
            label="Representante contato com o Segurado"
            value={form.contatoseg}
            onChangeText={(v) => atualizar('contatoseg', v)}
          />
          <Campo label="Nº proposta" value={form.proposta_seg} onChangeText={(v) => atualizar('proposta_seg', v)} />
        </Secao>

        <Secao titulo="Identificação do Sinistro">
          <Campo label="Nº Sinistro" value={form.nro_sinistro} onChangeText={(v) => atualizar('nro_sinistro', v)} />
          <Campo label="Apólice" value={form.apolice} onChangeText={(v) => atualizar('apolice', v)} />
          <Selecao
            label="Tipo de apólice"
            valor={form.id_tipoapolice}
            opcoes={tiposApolice}
            onChange={mudarTipoApolice}
          />
          <Interruptor label="Local Determinado" valor={form.local_determinado} onChange={mudarLocalDeterminado} />
          <Interruptor label="Território Nacional" valor={form.territorio_nacional} onChange={mudarTerritorioNacional} />
        </Secao>

        <Secao titulo="Quem atendeu?">
          <Selecao
            ref={refTratarAte}
            label="Tratamento"
            valor={form.tratar_ate}
            opcoes={OPCOES_TRATAMENTO}
            onChange={(v) => atualizar('tratar_ate', v)}
            obrigatorio
            erro={erroDoCampo('tratar_ate')}
          />
          <Campo
            ref={refAtendente}
            label="Nome"
            obrigatorio
            erro={erroDoCampo('atendente')}
            value={form.atendente}
            onChangeText={(v) => atualizar('atendente', v)}
          />
          <Campo
            ref={refRgAtendente}
            label="CPF"
            obrigatorio
            erro={erroDoCampo('rg_atendente')}
            value={form.rg_atendente}
            onChangeText={(v) => atualizar('rg_atendente', formatarCPF(v))}
            keyboardType="number-pad"
            maxLength={14}
          />
          <Selecao
            ref={refIdRelacaoseg}
            label="Vínculo"
            valor={form.id_relacaoseg}
            opcoes={relacoes}
            onChange={(v) => atualizar('id_relacaoseg', v)}
            obrigatorio
            erro={erroDoCampo('id_relacaoseg')}
          />
          <Selecao
            ref={refMesmaPessoa}
            label="Quem atendeu foi quem assinou?"
            valor={form.mesma_pessoa}
            opcoes={OPCOES_SIM_NAO}
            onChange={mudarMesmaPessoa}
            obrigatorio
            erro={erroDoCampo('mesma_pessoa')}
          />
        </Secao>

        <Secao titulo="Quem assina?">
          <Selecao
            ref={refTratarAss}
            label="Tratamento"
            valor={form.tratar_ass}
            opcoes={OPCOES_TRATAMENTO}
            onChange={(v) => atualizar('tratar_ass', v)}
            obrigatorio
            erro={erroDoCampo('tratar_ass')}
          />
          <Campo
            ref={refAtendenteAss}
            label="Nome"
            obrigatorio
            erro={erroDoCampo('atendente_ass')}
            value={form.atendente_ass}
            onChangeText={(v) => atualizar('atendente_ass', v)}
          />
          <Campo
            ref={refRgAssina}
            label="CPF"
            obrigatorio
            erro={erroDoCampo('rg_assina')}
            value={form.rg_assina}
            onChangeText={(v) => atualizar('rg_assina', formatarCPF(v))}
            keyboardType="number-pad"
            maxLength={14}
          />
          <Selecao
            ref={refIdRelacaoass}
            label="Vínculo"
            valor={form.id_relacaoass}
            opcoes={relacoes}
            onChange={(v) => atualizar('id_relacaoass', v)}
            obrigatorio
            erro={erroDoCampo('id_relacaoass')}
          />
        </Secao>

        <Secao titulo="Causa, Cronologia e Preservação">
          <Selecao
            ref={refIdCausaAbe}
            label="Causa (segundo o Segurado)"
            valor={form.id_causa_abe}
            opcoes={causas}
            onChange={(v) => atualizar('id_causa_abe', v)}
            obrigatorio
            erro={erroDoCampo('id_causa_abe')}
          />
          <Selecao
            ref={refIdCausa}
            label="Causa (segundo o Regulador)"
            valor={form.id_causa}
            opcoes={causas}
            onChange={(v) => atualizar('id_causa', v)}
            obrigatorio
            erro={erroDoCampo('id_causa')}
          />
          <CampoData
            ref={refDataOcor}
            label="Data Ocorrência"
            valor={form.data_ocor}
            onChange={(v) => atualizar('data_ocor', v)}
            obrigatorio
            erro={erroDoCampo('data_ocor')}
          />
          <Interruptor label="Hora incerta" valor={form.hora_incerta} onChange={(v) => atualizar('hora_incerta', v)} />
          {!form.hora_incerta && (
            <CampoData label="Hora Ocorrência" modo="time" valor={form.hora_ocor} onChange={(v) => atualizar('hora_ocor', v)} />
          )}
          <CampoData label="Início Vigência" valor={form.datavig_ini} onChange={(v) => atualizar('datavig_ini', v)} />
          <CampoData label="Fim Vigência" valor={form.datavig_fim} onChange={(v) => atualizar('datavig_fim', v)} />
          <CampoData
            ref={refDataVistoria}
            label="Data Vistoria"
            valor={form.data_vistoria}
            onChange={(v) => atualizar('data_vistoria', v)}
            obrigatorio
            erro={erroDoCampo('data_vistoria')}
          />
          <CampoData
            ref={refDataAviso}
            label="Data Aviso"
            valor={form.data_aviso}
            onChange={(v) => atualizar('data_aviso', v)}
            obrigatorio
            erro={erroDoCampo('data_aviso')}
          />
          <Selecao
            ref={refIdPreserva}
            label="Bens preservados"
            valor={form.id_preserva}
            opcoes={OPCOES_PRESERVA}
            onChange={(v) => atualizar('id_preserva', v)}
            obrigatorio
            erro={erroDoCampo('id_preserva')}
          />
        </Secao>

        {corretora && (
          <Secao titulo="Dados da Corretora">
            <InfoLinha label="Nome" valor={corretora.nm_corretora} />
            <InfoLinha label="Endereço" valor={corretora.endereco} />
            <InfoLinha label="Bairro" valor={corretora.bairro} />
            <InfoLinha label="UF" valor={corretora.id_estado} />
            <InfoLinha label="Telefone" valor={corretora.telefone} />
            <InfoLinha label="Email" valor={corretora.email} />
          </Secao>
        )}

        <Pressable style={[styles.botaoSalvar, salvando && styles.botaoDesabilitado]} onPress={salvar} disabled={salvando}>
          {salvando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.botaoSalvarTexto}>Salvar</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function InfoLinha({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <View style={styles.infoLinha}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor}>{valor}</Text>
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
  botaoCoordenadas: {
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
    paddingBottom: 40,
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
    fontWeight: '600',
  },
  botaoSalvar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1c3d5a',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 4,
  },
  botaoDesabilitado: {
    opacity: 0.7,
  },
  botaoSalvarTexto: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  infoLinha: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: '#8a97a3',
    textTransform: 'uppercase',
  },
  infoValor: {
    fontSize: 14,
    color: '#2a88ad',
    fontWeight: '600',
  },
});
