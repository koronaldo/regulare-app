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
import * as Location from 'expo-location';

import { Campo } from '../../../src/components/form/Campo';
import { Interruptor } from '../../../src/components/form/Interruptor';
import { Secao } from '../../../src/components/form/Secao';
import { Selecao, type OpcaoSelecao } from '../../../src/components/form/Selecao';
import {
  buscarDadosBasicosMaquina,
  buscarDadosEnderecoSinistro,
  buscarItensApolice,
  buscarRespostasMaquina,
  buscarTipoApolice,
  criarMaquina,
  excluirBenfeitoria,
  excluirMaquina,
  listarBenfeitorias,
  listarCoberturasSinistro,
  listarMaquinaItens,
  listarMaquinas,
  listarOpcoesEsquadria,
  listarOpcoesEstrutura,
  listarOpcoesOcupacao,
  listarOpcoesParede,
  listarOpcoesTipoCobertura,
  salvarBenfeitoria,
  salvarItensApolice,
  salvarMaquina,
  type Benfeitoria,
  type DadosBasicosMaquina,
  type DadosBenfeitoria,
  type DadosEnderecoSinistro,
  type ItemApolice,
  type MaquinaItem,
  type MaquinaResumo,
  type RespostaCampoMaquina,
  type RespostaItemApolice,
  type RespostaMaquina,
} from '../../../src/db/informacoes';
import { buscarSinistroPorId, listarCidadesPorEstado, listarEstados } from '../../../src/db/sinistros';
import { mostrarAlerta } from '../../../src/utils/alerta';
import { paraCoordenadasGrau } from '../../../src/utils/coordenadas';

interface ValorItemApolice {
  descricao: string;
  confere: boolean | null;
  complemento: string;
  id_estado: string;
  id_cidade: string;
  id_estado_ori: string;
  id_cidade_ori: string;
}

const VALOR_ITEM_VAZIO: ValorItemApolice = {
  descricao: '',
  confere: null,
  complemento: '',
  id_estado: '',
  id_cidade: '',
  id_estado_ori: '',
  id_cidade_ori: '',
};

function usaTextoLivre(item: ItemApolice) {
  return item.referencia === 'N' || item.referencia === 'A';
}

function usaCidade(item: ItemApolice) {
  return !usaTextoLivre(item) && !item.lista_selecao;
}

/**
 * Valor padrão sugerido pra itens de endereço, a partir do que já foi preenchido no
 * Cadastro Geral — só usado enquanto o item não tiver resposta salva em sinistro_apolice.
 */
function descricaoPadrao(descricaoItem: string, endereco: DadosEnderecoSinistro | null): string {
  if (!endereco) return '';
  const texto = descricaoItem.toLowerCase();
  if (texto.includes('bairro')) return endereco.bairro ?? '';
  if (texto.includes('logradouro')) return endereco.endereco ?? '';
  if (texto.includes('cep')) return endereco.cep ?? '';
  if (texto.includes('prédio') || texto.includes('predio')) return endereco.nro_predio ?? '';
  if (texto.includes('ocupação') || texto.includes('ocupacao')) return endereco.ocupacao ?? '';
  if (texto.includes('construção') || texto.includes('construcao')) return endereco.construcao ?? '';
  return '';
}

function valorInicialItem(item: ItemApolice, endereco: DadosEnderecoSinistro | null): ValorItemApolice {
  const descricaoSalva = item.descricao;
  const usaCid = usaCidade(item);

  return {
    descricao:
      descricaoSalva || item.lista_selecao ? descricaoSalva : usaCid ? '' : descricaoPadrao(item.descricao_item, endereco),
    confere: item.confere,
    complemento: item.complemento,
    id_estado: item.id_estado ?? (usaCid ? (endereco?.id_estado ?? '') : ''),
    id_cidade:
      item.id_cidade != null
        ? String(item.id_cidade)
        : usaCid && endereco?.id_estado && endereco.id_cidade != null
          ? String(endereco.id_cidade)
          : '',
    id_estado_ori: item.id_estado_ori ?? '',
    id_cidade_ori: item.id_cidade_ori != null ? String(item.id_cidade_ori) : '',
  };
}

const RESPOSTA_MAQUINA_VAZIA: RespostaCampoMaquina = { descricao: '', confere: null, complemento: '' };

const DADOS_MAQUINA_VAZIO: DadosBasicosMaquina = {
  item_apolice: '',
  nm_benfeito: '',
  marca: '',
  modelo: '',
  ano: '',
  nro_serie: '',
  chassi: '',
  placa: '',
  total_km: '',
  construcao: '',
};

/**
 * Cada campo do checklist de máquina corresponde a uma coluna de sinibenfe — usado tanto pra
 * sugerir o valor padrão (máquina importada) quanto pra gravar de volta ao salvar, já que o
 * checklist é o único lugar onde esses dados são editados (sem formulário duplicado por cima).
 */
function chaveDadoBasicoMaquina(descricaoItem: string): keyof DadosBasicosMaquina | null {
  const texto = descricaoItem.toLowerCase();
  if (texto.includes('operador') || texto.includes('contratante')) return null;
  if (texto.includes('item')) return 'item_apolice';
  if (texto.includes('nome') || texto.includes('maq') || texto.includes('equip')) return 'nm_benfeito';
  if (texto.includes('marca')) return 'marca';
  if (texto.includes('modelo')) return 'modelo';
  if (texto.includes('ano')) return 'ano';
  if (texto.includes('série') || texto.includes('serie')) return 'nro_serie';
  if (texto.includes('chassi')) return 'chassi';
  if (texto.includes('placa')) return 'placa';
  if (texto.includes('km')) return 'total_km';
  if (texto.includes('construção') || texto.includes('construcao')) return 'construcao';
  return null;
}

function valorPadraoMaquina(descricaoItem: string, dados: DadosBasicosMaquina): string {
  const chave = chaveDadoBasicoMaquina(descricaoItem);
  return chave ? dados[chave] : '';
}

interface FormBenfeitoria {
  id_sinibenfe: number | null;
  nm_benfeito: string;
  id_ocupacao: string;
  area: string;
  idade: string;
  danos: boolean;
  id_estrutura: string;
  id_parede: string;
  id_tipocobertura: string;
  id_esquadria: string;
  coord_lat: string;
  coord_long: string;
  construcao: string;
  id_cobertura: string;
}

const FORM_BENFEITORIA_VAZIO: FormBenfeitoria = {
  id_sinibenfe: null,
  nm_benfeito: '',
  id_ocupacao: '',
  area: '',
  idade: '',
  danos: false,
  id_estrutura: '',
  id_parede: '',
  id_tipocobertura: '',
  id_esquadria: '',
  coord_lat: '',
  coord_long: '',
  construcao: '',
  id_cobertura: '',
};

function formInicialBenfeitoria(b: Benfeitoria): FormBenfeitoria {
  return {
    id_sinibenfe: b.id_sinibenfe,
    nm_benfeito: b.nm_benfeito,
    id_ocupacao: b.id_ocupacao != null ? String(b.id_ocupacao) : '',
    area: b.area,
    idade: b.idade,
    danos: b.danos,
    id_estrutura: b.id_estrutura != null ? String(b.id_estrutura) : '',
    id_parede: b.id_parede != null ? String(b.id_parede) : '',
    id_tipocobertura: b.id_tipocobertura != null ? String(b.id_tipocobertura) : '',
    id_esquadria: b.id_esquadria != null ? String(b.id_esquadria) : '',
    coord_lat: b.coord_lat,
    coord_long: b.coord_long,
    construcao: b.construcao,
    id_cobertura: b.id_cobertura != null ? String(b.id_cobertura) : '',
  };
}

export default function InformacoesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idSinistro = Number(id);
  const insets = useSafeAreaInsets();

  const [carregando, setCarregando] = useState(true);
  const [cabecalho, setCabecalho] = useState({ segurado: '', sinistro: '' });
  const [tipoApolice, setTipoApolice] = useState<string | null>(null);

  const [itens, setItens] = useState<ItemApolice[]>([]);
  const [valores, setValores] = useState<Record<number, ValorItemApolice>>({});
  const [salvandoApolice, setSalvandoApolice] = useState(false);
  const [erroItem, setErroItem] = useState<{ idItem: number; mensagem: string } | null>(null);
  const refsItens = useRef<Record<number, View | null>>({});

  const [estados, setEstados] = useState<OpcaoSelecao[]>([]);
  const [cidadesRef, setCidadesRef] = useState<Record<number, OpcaoSelecao[]>>({});
  const [cidadesOri, setCidadesOri] = useState<Record<number, OpcaoSelecao[]>>({});

  const [benfeitorias, setBenfeitorias] = useState<Benfeitoria[]>([]);
  const [formBenfeitoria, setFormBenfeitoria] = useState<FormBenfeitoria | null>(null);
  const [salvandoBenfeitoria, setSalvandoBenfeitoria] = useState(false);
  const [erroBenfeitoria, setErroBenfeitoria] = useState<{ campo: keyof FormBenfeitoria; mensagem: string } | null>(
    null,
  );
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const refNmBenfeito = useRef<TextInput>(null);
  const refIdOcupacao = useRef<View>(null);
  const refIdEstrutura = useRef<View>(null);
  const refIdParede = useRef<View>(null);
  const refIdTipocobertura = useRef<View>(null);
  const refIdEsquadria = useRef<View>(null);

  function erroDoCampoBenfeitoria(campo: keyof FormBenfeitoria): string | undefined {
    return erroBenfeitoria?.campo === campo ? erroBenfeitoria.mensagem : undefined;
  }

  function focarCampoBenfeitoriaComErro(campo: keyof FormBenfeitoria, mensagem: string) {
    setErroBenfeitoria({ campo, mensagem });

    const refsPorCampo: Partial<Record<keyof FormBenfeitoria, RefObject<TextInput | View | null>>> = {
      nm_benfeito: refNmBenfeito,
      id_ocupacao: refIdOcupacao,
      id_estrutura: refIdEstrutura,
      id_parede: refIdParede,
      id_tipocobertura: refIdTipocobertura,
      id_esquadria: refIdEsquadria,
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

  const [opcoesOcupacao, setOpcoesOcupacao] = useState<OpcaoSelecao[]>([]);
  const [opcoesEstrutura, setOpcoesEstrutura] = useState<OpcaoSelecao[]>([]);
  const [opcoesParede, setOpcoesParede] = useState<OpcaoSelecao[]>([]);
  const [opcoesTipoCobertura, setOpcoesTipoCobertura] = useState<OpcaoSelecao[]>([]);
  const [opcoesEsquadria, setOpcoesEsquadria] = useState<OpcaoSelecao[]>([]);
  const [opcoesCobertura, setOpcoesCobertura] = useState<OpcaoSelecao[]>([]);

  const [maquinas, setMaquinas] = useState<MaquinaResumo[]>([]);
  const [maquinaItens, setMaquinaItens] = useState<MaquinaItem[]>([]);
  const [maquinaSelecionada, setMaquinaSelecionada] = useState<MaquinaResumo | null>(null);
  const [dadosMaquina, setDadosMaquina] = useState<DadosBasicosMaquina>(DADOS_MAQUINA_VAZIO);
  const [respostasMaquina, setRespostasMaquina] = useState<Record<number, RespostaCampoMaquina>>({});
  const [salvandoMaquina, setSalvandoMaquina] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!idSinistro) return;
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        try {
          const [sinistro, tipo, listaEstados, listaBenfeitorias, ocupacao, estrutura, parede, tipoCobertura, esquadria, cobertura] =
            await Promise.all([
              buscarSinistroPorId(idSinistro),
              buscarTipoApolice(idSinistro),
              listarEstados(),
              listarBenfeitorias(idSinistro),
              listarOpcoesOcupacao(),
              listarOpcoesEstrutura(),
              listarOpcoesParede(),
              listarOpcoesTipoCobertura(),
              listarOpcoesEsquadria(),
              listarCoberturasSinistro(idSinistro),
            ]);
          if (cancelado) return;

          if (sinistro) setCabecalho({ segurado: sinistro.nm_segurado ?? '', sinistro: sinistro.nro_sinistro ?? '' });
          setTipoApolice(tipo);
          setEstados(listaEstados);
          setBenfeitorias(listaBenfeitorias);
          setOpcoesOcupacao(ocupacao);
          setOpcoesEstrutura(estrutura);
          setOpcoesParede(parede);
          setOpcoesTipoCobertura(tipoCobertura);
          setOpcoesEsquadria(esquadria);
          setOpcoesCobertura(cobertura);
          setFormBenfeitoria(null);

          if (tipo === 'PRE') {
            const [listaItens, endereco] = await Promise.all([
              buscarItensApolice(idSinistro),
              buscarDadosEnderecoSinistro(idSinistro),
            ]);
            if (cancelado) return;
            setItens(listaItens);
            const valoresIniciais = Object.fromEntries(listaItens.map((i) => [i.id_item, valorInicialItem(i, endereco)]));
            setValores(valoresIniciais);

            const cidadesRefCarregadas: Record<number, OpcaoSelecao[]> = {};
            const cidadesOriCarregadas: Record<number, OpcaoSelecao[]> = {};
            for (const item of listaItens) {
              const uf = valoresIniciais[item.id_item]?.id_estado;
              if (uf) cidadesRefCarregadas[item.id_item] = await listarCidadesPorEstado(uf);
              if (item.id_estado_ori) cidadesOriCarregadas[item.id_item] = await listarCidadesPorEstado(item.id_estado_ori);
            }
            if (cancelado) return;
            setCidadesRef(cidadesRefCarregadas);
            setCidadesOri(cidadesOriCarregadas);
            setMaquinas([]);
            setMaquinaItens([]);
          } else {
            setItens([]);
            setValores({});
          }

          if (tipo === 'MAQ') {
            const [listaMaquinas, listaMaquinaItens] = await Promise.all([listarMaquinas(idSinistro), listarMaquinaItens()]);
            if (cancelado) return;
            setMaquinas(listaMaquinas);
            setMaquinaItens(listaMaquinaItens);
          }
          setMaquinaSelecionada(null);
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

  function atualizarValorItem(idItem: number, patch: Partial<ValorItemApolice>) {
    setValores((atual) => ({ ...atual, [idItem]: { ...(atual[idItem] ?? VALOR_ITEM_VAZIO), ...patch } }));
    setErroItem((atual) => (atual?.idItem === idItem ? null : atual));
  }

  function validarInformacoes(): { idItem: number; mensagem: string } | null {
    for (const item of itens) {
      const valor = valores[item.id_item] ?? VALOR_ITEM_VAZIO;

      if (item.conferencia) {
        if (valor.confere == null) return { idItem: item.id_item, mensagem: 'Marque se confere (Sim ou Não)' };
        if (valor.confere === false) {
          if (usaTextoLivre(item) && !valor.complemento.trim()) {
            return { idItem: item.id_item, mensagem: 'Informe o que foi encontrado' };
          }
          if (usaCidade(item) && !valor.id_cidade_ori) {
            return { idItem: item.id_item, mensagem: 'Informe a cidade encontrada' };
          }
        }
        continue;
      }

      // Sem opção Sim/Não pra esse item: o campo de valor em si vira obrigatório.
      const temLista = !!item.lista_selecao;
      if (temLista && !valor.descricao) return { idItem: item.id_item, mensagem: 'Selecione um valor' };
      if (!temLista && usaTextoLivre(item) && !valor.descricao.trim()) {
        return { idItem: item.id_item, mensagem: 'Preencha o valor' };
      }
      if (usaCidade(item) && !valor.id_cidade) return { idItem: item.id_item, mensagem: 'Selecione a cidade' };
    }
    return null;
  }

  function focarItemComErro(idItem: number, mensagem: string) {
    setErroItem({ idItem, mensagem });

    const el = refsItens.current[idItem];
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
  }

  async function mudarEstadoRefItem(idItem: number, uf: string) {
    atualizarValorItem(idItem, { id_estado: uf, id_cidade: '' });
    const lista = await listarCidadesPorEstado(uf);
    setCidadesRef((atual) => ({ ...atual, [idItem]: lista }));
  }

  async function mudarEstadoOriItem(idItem: number, uf: string) {
    atualizarValorItem(idItem, { id_estado_ori: uf, id_cidade_ori: '' });
    const lista = await listarCidadesPorEstado(uf);
    setCidadesOri((atual) => ({ ...atual, [idItem]: lista }));
  }


  /** Porta de GravarItemApolices (cadinformacoes_def.js). */
  async function salvarInformacoes() {
    const erro = validarInformacoes();
    if (erro) {
      focarItemComErro(erro.idItem, erro.mensagem);
      return;
    }
    setErroItem(null);

    const respostas: RespostaItemApolice[] = itens.map((item) => {
      const valor = valores[item.id_item] ?? VALOR_ITEM_VAZIO;
      return {
        id_item: item.id_item,
        descricao: valor.descricao,
        confere: valor.confere,
        complemento: valor.complemento,
        id_estado: valor.id_estado || null,
        id_cidade: valor.id_cidade ? Number(valor.id_cidade) : null,
        id_estado_ori: valor.id_estado_ori || null,
        id_cidade_ori: valor.id_cidade_ori ? Number(valor.id_cidade_ori) : null,
      };
    });

    setSalvandoApolice(true);
    try {
      await salvarItensApolice(idSinistro, respostas);
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando Informações Gerais.');
    } finally {
      setSalvandoApolice(false);
    }
  }

  function novaBenfeitoria() {
    setErroBenfeitoria(null);
    setFormBenfeitoria(FORM_BENFEITORIA_VAZIO);
  }

  function editarBenfeitoria(b: Benfeitoria) {
    setErroBenfeitoria(null);
    setFormBenfeitoria(formInicialBenfeitoria(b));
  }

  function atualizarFormBenfeitoria<K extends keyof FormBenfeitoria>(campo: K, valor: FormBenfeitoria[K]) {
    setFormBenfeitoria((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    setErroBenfeitoria((atual) => (atual?.campo === campo ? null : atual));
  }

  /** Preenche Latitude/Longitude com a localização atual, em graus/minutos/segundos (porta de getDms/ddToDms). */
  async function preencherCoordenadasAtuais() {
    setBuscandoLocalizacao(true);
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (!permissao.granted) {
        mostrarAlerta('Localização', 'Permissão de localização não concedida.');
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({});
      const grau = paraCoordenadasGrau(posicao.coords.latitude, posicao.coords.longitude);
      atualizarFormBenfeitoria('coord_lat', grau.latitude);
      atualizarFormBenfeitoria('coord_long', grau.longitude);
    } catch {
      mostrarAlerta('Localização', 'Erro identificando o local. Verifique se o GPS está ativado.');
    } finally {
      setBuscandoLocalizacao(false);
    }
  }

  function validarBenfeitoria(f: FormBenfeitoria): { campo: keyof FormBenfeitoria; mensagem: string } | null {
    if (!f.id_ocupacao) return { campo: 'id_ocupacao', mensagem: 'Informe a ocupação' };
    if (!f.nm_benfeito.trim()) return { campo: 'nm_benfeito', mensagem: 'Informe o nome' };
    if (!f.id_estrutura) return { campo: 'id_estrutura', mensagem: 'Informe a estrutura' };
    if (!f.id_parede) return { campo: 'id_parede', mensagem: 'Informe a parede' };
    if (!f.id_tipocobertura) return { campo: 'id_tipocobertura', mensagem: 'Informe o tipo de cobertura' };
    if (!f.id_esquadria) return { campo: 'id_esquadria', mensagem: 'Informe o tipo de esquadria' };
    return null;
  }

  /** Porta de GravarBenfeitoria + AtualizaBenfeitoria (cadinformacoes_def.js). */
  async function salvarFormBenfeitoria() {
    if (!formBenfeitoria) return;

    const erro = validarBenfeitoria(formBenfeitoria);
    if (erro) {
      focarCampoBenfeitoriaComErro(erro.campo, erro.mensagem);
      return;
    }
    setErroBenfeitoria(null);

    const dados: DadosBenfeitoria = {
      construcao: formBenfeitoria.construcao,
      id_ocupacao: Number(formBenfeitoria.id_ocupacao),
      area: formBenfeitoria.area,
      idade: formBenfeitoria.idade,
      danos: formBenfeitoria.danos,
      nm_benfeito: formBenfeitoria.nm_benfeito.trim(),
      id_estrutura: Number(formBenfeitoria.id_estrutura),
      id_parede: Number(formBenfeitoria.id_parede),
      id_tipocobertura: Number(formBenfeitoria.id_tipocobertura),
      id_esquadria: Number(formBenfeitoria.id_esquadria),
      coord_lat: formBenfeitoria.coord_lat,
      coord_long: formBenfeitoria.coord_long,
      id_cobertura: formBenfeitoria.id_cobertura ? Number(formBenfeitoria.id_cobertura) : null,
    };

    setSalvandoBenfeitoria(true);
    try {
      await salvarBenfeitoria(idSinistro, formBenfeitoria.id_sinibenfe, dados);
      const lista = await listarBenfeitorias(idSinistro);
      setBenfeitorias(lista);
      setFormBenfeitoria(null);
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando Benfeitoria.');
    } finally {
      setSalvandoBenfeitoria(false);
    }
  }

  function confirmarExclusaoBenfeitoria(b: Benfeitoria) {
    mostrarAlerta('Remover Benfeitoria?', b.nm_benfeito, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirBenfeitoria(idSinistro, b.id_sinibenfe);
          const lista = await listarBenfeitorias(idSinistro);
          setBenfeitorias(lista);
          if (formBenfeitoria?.id_sinibenfe === b.id_sinibenfe) setFormBenfeitoria(null);
        },
      },
    ]);
  }

  async function abrirMaquina(m: MaquinaResumo) {
    const [dados, respostas] = await Promise.all([
      buscarDadosBasicosMaquina(m.id_benmaq),
      buscarRespostasMaquina(idSinistro, m.id_benmaq),
    ]);
    setDadosMaquina(dados ?? DADOS_MAQUINA_VAZIO);
    setRespostasMaquina(respostas);
    setMaquinaSelecionada(m);
  }

  async function novaMaquina() {
    const idBenmaq = await criarMaquina(idSinistro);
    const nova: MaquinaResumo = { id_benmaq: idBenmaq, nm_benfeito: '(sem nome)', importada: false };
    setMaquinas((atual) => [...atual, nova]);
    setDadosMaquina(DADOS_MAQUINA_VAZIO);
    // Porta do modo "Novo Item" (MontaEstruturaMaquina1): confere já vem "Sim" marcado por padrão.
    setRespostasMaquina(
      Object.fromEntries(
        maquinaItens.filter((item) => item.conferencia).map((item) => [item.id_item, { ...RESPOSTA_MAQUINA_VAZIA, confere: true }]),
      ),
    );
    setMaquinaSelecionada(nova);
  }

  function atualizarRespostaMaquina(idItem: number, patch: Partial<RespostaCampoMaquina>) {
    setRespostasMaquina((atual) => ({
      ...atual,
      [idItem]: { ...(atual[idItem] ?? RESPOSTA_MAQUINA_VAZIA), ...patch },
    }));
  }

  async function salvarMaquinaAtual() {
    if (!maquinaSelecionada) return;

    const dadosBasicos: DadosBasicosMaquina = { ...DADOS_MAQUINA_VAZIO };
    const respostas: RespostaMaquina[] = maquinaItens.map((item) => {
      const resposta = respostasMaquina[item.id_item];
      const valorAtual = resposta?.descricao || valorPadraoMaquina(item.descricao_item, dadosMaquina);
      const chave = chaveDadoBasicoMaquina(item.descricao_item);
      if (chave) dadosBasicos[chave] = valorAtual;

      return {
        id_item: item.id_item,
        descricao: valorAtual,
        confere: resposta?.confere ?? null,
        complemento: resposta?.complemento ?? '',
      };
    });

    if (!dadosBasicos.nm_benfeito.trim()) {
      mostrarAlerta('Campo obrigatório', 'Informe o nome/descrição da máquina.');
      return;
    }

    setSalvandoMaquina(true);
    try {
      await salvarMaquina(idSinistro, maquinaSelecionada.id_benmaq, dadosBasicos, respostas);
      const lista = await listarMaquinas(idSinistro);
      setMaquinas(lista);
      setMaquinaSelecionada(null);
      mostrarAlerta('Sucesso', 'Atualizado com sucesso!!!');
    } catch {
      mostrarAlerta('Erro', 'Erro atualizando máquina.');
    } finally {
      setSalvandoMaquina(false);
    }
  }

  function confirmarExclusaoMaquina(m: MaquinaResumo) {
    mostrarAlerta('Remover Máquina?', m.nm_benfeito, [
      { text: 'Não' },
      {
        text: 'Sim',
        onPress: async () => {
          await excluirMaquina(idSinistro, m.id_benmaq);
          const lista = await listarMaquinas(idSinistro);
          setMaquinas(lista);
          if (maquinaSelecionada?.id_benmaq === m.id_benmaq) setMaquinaSelecionada(null);
        },
      },
    ]);
  }

  function voltar() {
    router.back();
  }

  function proximo() {
    // Porta de ProximaTela (cadinformacoes_def.js): Informações -> Coberturas.
    router.replace({ pathname: '/sinistro/[id]/coberturas', params: { id: String(idSinistro) } });
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
          <Text style={styles.headerTitulo}>Inf. Gerais e Benfeitorias</Text>
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
        <Text style={styles.tituloSecao}>INFORMAÇÕES</Text>

        {tipoApolice !== 'PRE' && (
          <Text style={styles.vazioTexto}>
            Checklist de informações disponível apenas para apólices do tipo Predial nesta etapa.
          </Text>
        )}

        {tipoApolice === 'PRE' && itens.length === 0 && (
          <Text style={styles.vazioTexto}>Nenhum registro encontrado.</Text>
        )}

        {tipoApolice === 'PRE' &&
          itens.map((item) => {
            const valor = valores[item.id_item] ?? VALOR_ITEM_VAZIO;
            const opcoesLista: OpcaoSelecao[] = item.lista_selecao
              ? item.lista_selecao
                  .split(';')
                  .filter(Boolean)
                  .map((v) => ({ valor: v, label: v }))
              : [];

            const erroDesteItem = erroItem?.idItem === item.id_item ? erroItem.mensagem : undefined;

            return (
              <View key={item.id_item} ref={(el) => { refsItens.current[item.id_item] = el; }}>
                <Secao titulo={item.descricao_item}>
                  {opcoesLista.length > 0 && (
                    <Selecao
                      label="Valor"
                      valor={valor.descricao}
                      opcoes={opcoesLista}
                      onChange={(v) => atualizarValorItem(item.id_item, { descricao: v })}
                      obrigatorio={!item.conferencia}
                      erro={erroDesteItem}
                    />
                  )}
                  {opcoesLista.length === 0 && usaTextoLivre(item) && (
                    <Campo
                      label="Valor"
                      value={valor.descricao}
                      onChangeText={(v) => atualizarValorItem(item.id_item, { descricao: v })}
                      obrigatorio={!item.conferencia}
                      erro={erroDesteItem}
                    />
                  )}
                  {usaCidade(item) && (
                    <>
                      <Selecao
                        label="UF"
                        valor={valor.id_estado}
                        opcoes={estados}
                        onChange={(uf) => mudarEstadoRefItem(item.id_item, uf)}
                      />
                      <Selecao
                        label="Cidade"
                        valor={valor.id_cidade}
                        opcoes={cidadesRef[item.id_item] ?? []}
                        onChange={(v) => atualizarValorItem(item.id_item, { id_cidade: v })}
                        obrigatorio={!item.conferencia}
                        erro={erroDesteItem}
                      />
                    </>
                  )}

                  {item.conferencia && (
                    <>
                      <Text style={styles.labelConfere}>
                        Confere? <Text style={styles.asteriscoConfere}>*</Text>
                      </Text>
                      <View style={styles.linhaConfere}>
                        <Pressable
                          style={styles.opcaoConfere}
                          onPress={() => atualizarValorItem(item.id_item, { confere: true })}
                        >
                          <Ionicons
                            name={valor.confere === true ? 'checkbox' : 'square-outline'}
                            size={22}
                            color="#1c3d5a"
                          />
                          <Text style={styles.opcaoConfereTexto}>Sim</Text>
                        </Pressable>
                        <Pressable
                          style={styles.opcaoConfere}
                          onPress={() => atualizarValorItem(item.id_item, { confere: false })}
                        >
                          <Ionicons
                            name={valor.confere === false ? 'checkbox' : 'square-outline'}
                            size={22}
                            color="#1c3d5a"
                          />
                          <Text style={styles.opcaoConfereTexto}>Não</Text>
                        </Pressable>
                      </View>
                      {valor.confere == null && erroDesteItem && <Text style={styles.erroConfereTexto}>{erroDesteItem}</Text>}
                      {valor.confere === false && usaTextoLivre(item) && (
                        <Campo
                          label="O que foi encontrado"
                          value={valor.complemento}
                          onChangeText={(v) => atualizarValorItem(item.id_item, { complemento: v })}
                          obrigatorio
                          erro={erroDesteItem}
                        />
                      )}
                      {valor.confere === false && usaCidade(item) && (
                        <>
                          <Selecao
                            label="UF encontrado"
                            valor={valor.id_estado_ori}
                            opcoes={estados}
                            onChange={(uf) => mudarEstadoOriItem(item.id_item, uf)}
                          />
                          <Selecao
                            label="Cidade encontrada"
                            valor={valor.id_cidade_ori}
                            opcoes={cidadesOri[item.id_item] ?? []}
                            onChange={(v) => atualizarValorItem(item.id_item, { id_cidade_ori: v })}
                            obrigatorio
                            erro={erroDesteItem}
                          />
                        </>
                      )}
                    </>
                  )}
                </Secao>
              </View>
            );
          })}

        {tipoApolice === 'PRE' && itens.length > 0 && (
          <Pressable style={styles.botaoSalvar} onPress={salvarInformacoes} disabled={salvandoApolice}>
            {salvandoApolice ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.botaoSalvarTexto}>Salvar Informações</Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={[styles.tituloSecao, styles.tituloSecaoEspacada]}>BENFEITORIA(S)</Text>

        {!formBenfeitoria && (
          <Pressable style={styles.botaoAdicionar} onPress={novaBenfeitoria}>
            <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
            <Text style={styles.botaoAdicionarTexto}>Nova benfeitoria</Text>
          </Pressable>
        )}

        {formBenfeitoria && (
          <Secao titulo={formBenfeitoria.id_sinibenfe ? 'Editar Benfeitoria' : 'Nova Benfeitoria'}>
            {erroBenfeitoria && (
              <View style={styles.bannerErro}>
                <Ionicons name="alert-circle" size={20} color="#b3261e" />
                <Text style={styles.bannerErroTexto}>{erroBenfeitoria.mensagem}</Text>
              </View>
            )}
            <Campo
              ref={refNmBenfeito}
              label="Descrição"
              obrigatorio
              erro={erroDoCampoBenfeitoria('nm_benfeito')}
              value={formBenfeitoria.nm_benfeito}
              onChangeText={(v) => atualizarFormBenfeitoria('nm_benfeito', v)}
            />
            <Selecao
              ref={refIdOcupacao}
              label="Ocupação"
              valor={formBenfeitoria.id_ocupacao}
              opcoes={opcoesOcupacao}
              onChange={(v) => atualizarFormBenfeitoria('id_ocupacao', v)}
              obrigatorio
              erro={erroDoCampoBenfeitoria('id_ocupacao')}
            />
            <Campo
              label="Área"
              value={formBenfeitoria.area}
              onChangeText={(v) => atualizarFormBenfeitoria('area', v)}
              keyboardType="numeric"
            />
            <Campo
              label="Idade"
              value={formBenfeitoria.idade}
              onChangeText={(v) => atualizarFormBenfeitoria('idade', v)}
              keyboardType="numeric"
            />
            <Interruptor label="Danos?" valor={formBenfeitoria.danos} onChange={(v) => atualizarFormBenfeitoria('danos', v)} />
            <Selecao
              ref={refIdEstrutura}
              label="Estrutura"
              valor={formBenfeitoria.id_estrutura}
              opcoes={opcoesEstrutura}
              onChange={(v) => atualizarFormBenfeitoria('id_estrutura', v)}
              obrigatorio
              erro={erroDoCampoBenfeitoria('id_estrutura')}
            />
            <Selecao
              ref={refIdParede}
              label="Parede"
              valor={formBenfeitoria.id_parede}
              opcoes={opcoesParede}
              onChange={(v) => atualizarFormBenfeitoria('id_parede', v)}
              obrigatorio
              erro={erroDoCampoBenfeitoria('id_parede')}
            />
            <Selecao
              ref={refIdTipocobertura}
              label="Tipo Cobertura"
              valor={formBenfeitoria.id_tipocobertura}
              opcoes={opcoesTipoCobertura}
              onChange={(v) => atualizarFormBenfeitoria('id_tipocobertura', v)}
              obrigatorio
              erro={erroDoCampoBenfeitoria('id_tipocobertura')}
            />
            <Selecao
              ref={refIdEsquadria}
              label="Esquadria"
              valor={formBenfeitoria.id_esquadria}
              opcoes={opcoesEsquadria}
              onChange={(v) => atualizarFormBenfeitoria('id_esquadria', v)}
              obrigatorio
              erro={erroDoCampoBenfeitoria('id_esquadria')}
            />
            <Pressable
              style={styles.botaoLocalizacao}
              onPress={preencherCoordenadasAtuais}
              disabled={buscandoLocalizacao}
            >
              {buscandoLocalizacao ? (
                <ActivityIndicator color="#1c3d5a" />
              ) : (
                <>
                  <Ionicons name="location-outline" size={18} color="#1c3d5a" />
                  <Text style={styles.botaoLocalizacaoTexto}>Usar localização atual</Text>
                </>
              )}
            </Pressable>
            <Campo
              label="Latitude"
              value={formBenfeitoria.coord_lat}
              onChangeText={(v) => atualizarFormBenfeitoria('coord_lat', v)}
            />
            <Campo
              label="Longitude"
              value={formBenfeitoria.coord_long}
              onChangeText={(v) => atualizarFormBenfeitoria('coord_long', v)}
            />
            <Campo
              label="Observação"
              value={formBenfeitoria.construcao}
              onChangeText={(v) => atualizarFormBenfeitoria('construcao', v)}
            />
            <Selecao
              label="Cobertura"
              valor={formBenfeitoria.id_cobertura}
              opcoes={opcoesCobertura}
              onChange={(v) => atualizarFormBenfeitoria('id_cobertura', v)}
            />

            <View style={styles.linhaBotoesForm}>
              <Pressable style={styles.botaoCancelar} onPress={() => setFormBenfeitoria(null)}>
                <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.botaoSalvar, styles.botaoSalvarForm]} onPress={salvarFormBenfeitoria} disabled={salvandoBenfeitoria}>
                {salvandoBenfeitoria ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={styles.botaoSalvarTexto}>Salvar Benfeitoria</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Secao>
        )}

        {benfeitorias.length === 0 && <Text style={styles.vazioTexto}>Nenhuma benfeitoria encontrada.</Text>}

        {benfeitorias.map((b) => (
          <Pressable key={b.id_sinibenfe} style={styles.itemLista} onPress={() => editarBenfeitoria(b)}>
            <Text style={styles.itemListaTexto} numberOfLines={1}>
              {b.nm_benfeito}
            </Text>
            <Pressable hitSlop={10} onPress={() => confirmarExclusaoBenfeitoria(b)}>
              <Ionicons name="trash-outline" size={20} color="#d32f2f" />
            </Pressable>
          </Pressable>
        ))}

        {tipoApolice === 'MAQ' && (
          <>
            <Text style={[styles.tituloSecao, styles.tituloSecaoEspacada]}>MÁQUINAS</Text>

            {!maquinaSelecionada && (
              <Pressable style={styles.botaoAdicionar} onPress={novaMaquina}>
                <Ionicons name="add-circle-outline" size={20} color="#1c3d5a" />
                <Text style={styles.botaoAdicionarTexto}>Nova máquina</Text>
              </Pressable>
            )}

            {!maquinaSelecionada && maquinas.length === 0 && (
              <Text style={styles.vazioTexto}>Nenhuma máquina encontrada.</Text>
            )}

            {!maquinaSelecionada &&
              maquinas.map((m) => (
                <Pressable key={m.id_benmaq} style={styles.itemLista} onPress={() => abrirMaquina(m)}>
                  <View style={styles.itemListaConteudo}>
                    <Text style={styles.itemListaTexto} numberOfLines={1}>
                      {m.nm_benfeito}
                    </Text>
                    <Text style={styles.itemListaSubtexto}>{m.importada ? 'Importada — conferir' : 'Cadastrada localmente'}</Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => confirmarExclusaoMaquina(m)}>
                    <Ionicons name="trash-outline" size={20} color="#d32f2f" />
                  </Pressable>
                </Pressable>
              ))}

            {maquinaSelecionada &&
              (() => {
                const maquina = maquinaSelecionada;
                return (
                  <Secao titulo={maquina.importada ? 'Conferir Máquina' : 'Nova Máquina'}>
                    {maquinaItens.map((item) => {
                      const resposta = respostasMaquina[item.id_item];
                      const valorAtual = resposta?.descricao || valorPadraoMaquina(item.descricao_item, dadosMaquina);
                      const opcoesLista: OpcaoSelecao[] = item.lista_selecao
                        ? item.lista_selecao
                            .split(';')
                            .filter(Boolean)
                            .map((v) => ({ valor: v, label: v }))
                        : [];

                      return (
                        <View key={item.id_item} style={styles.campoMaquina}>
                          {opcoesLista.length > 0 ? (
                            <Selecao
                              label={item.descricao_item}
                              valor={valorAtual}
                              opcoes={opcoesLista}
                              onChange={(v) => atualizarRespostaMaquina(item.id_item, { descricao: v })}
                            />
                          ) : (
                            <Campo
                              label={item.descricao_item}
                              value={valorAtual}
                              onChangeText={(v) => atualizarRespostaMaquina(item.id_item, { descricao: v })}
                            />
                          )}

                          {item.conferencia && (
                            <>
                              <Text style={styles.labelConfere}>Confere?</Text>
                              <View style={styles.linhaConfere}>
                                <Pressable
                                  style={styles.opcaoConfere}
                                  onPress={() => atualizarRespostaMaquina(item.id_item, { confere: true })}
                                >
                                  <Ionicons
                                    name={resposta?.confere === true ? 'checkbox' : 'square-outline'}
                                    size={22}
                                    color="#1c3d5a"
                                  />
                                  <Text style={styles.opcaoConfereTexto}>Sim</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.opcaoConfere}
                                  onPress={() => atualizarRespostaMaquina(item.id_item, { confere: false })}
                                >
                                  <Ionicons
                                    name={resposta?.confere === false ? 'checkbox' : 'square-outline'}
                                    size={22}
                                    color="#1c3d5a"
                                  />
                                  <Text style={styles.opcaoConfereTexto}>Não</Text>
                                </Pressable>
                              </View>
                              {resposta?.confere === false && (
                                <Campo
                                  label="O que foi encontrado"
                                  value={resposta?.complemento ?? ''}
                                  onChangeText={(v) => atualizarRespostaMaquina(item.id_item, { complemento: v })}
                                />
                              )}
                            </>
                          )}
                        </View>
                      );
                    })}

                    <View style={styles.linhaBotoesForm}>
                      <Pressable style={styles.botaoCancelar} onPress={() => setMaquinaSelecionada(null)}>
                        <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.botaoSalvar, styles.botaoSalvarForm]}
                        onPress={salvarMaquinaAtual}
                        disabled={salvandoMaquina}
                      >
                        {salvandoMaquina ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                            <Text style={styles.botaoSalvarTexto}>Salvar Máquina</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </Secao>
                );
              })()}
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
  tituloSecao: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  tituloSecaoEspacada: {
    marginTop: 22,
  },
  labelConfere: {
    fontSize: 12,
    color: '#5a6672',
    marginBottom: 6,
    fontWeight: '600',
  },
  asteriscoConfere: {
    color: '#b3261e',
  },
  erroConfereTexto: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 4,
  },
  linhaConfere: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 12,
  },
  opcaoConfere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  opcaoConfereTexto: {
    fontSize: 14,
    color: '#1c3d5a',
    fontWeight: '600',
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 12,
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
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  botaoSalvarForm: {
    flex: 1,
    marginTop: 0,
    marginBottom: 0,
  },
  botaoSalvarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
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
  botaoLocalizacao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#eef2f5',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  botaoLocalizacaoTexto: {
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 13,
  },
  botaoAdicionarTexto: {
    color: '#1c3d5a',
    fontWeight: '700',
    fontSize: 14,
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
  itemListaConteudo: {
    flex: 1,
    marginRight: 12,
  },
  itemListaSubtexto: {
    color: '#8a97a3',
    fontSize: 12,
    marginTop: 2,
  },
  campoMaquina: {
    borderTopWidth: 1,
    borderTopColor: '#eef2f5',
    paddingTop: 12,
    marginTop: 4,
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
