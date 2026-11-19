import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { cancelarVerificacaoPeriodica } from '../src/services/backgroundSync';
import { limparCredenciais } from '../src/services/credenciais';
import { encerrarSessaoServidor, sincronizarComCredenciaisSalvas } from '../src/services/auth';
import {
  contarSinistrosPorSituacao,
  listarSinistros,
  type ContagemSituacoes,
  type SinistroResumo,
  type SituacaoSinistro,
} from '../src/db/sinistros';
import { excluirSinistroCompleto, limparTodosOsProcessos } from '../src/db/excluirSinistro';
import { numeroWhatsApp, somenteDigitos } from '../src/utils/telefone';

const ABAS: { valor: SituacaoSinistro; label: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { valor: 'P', label: 'Pendentes', icone: 'time-outline' },
  { valor: 'A', label: 'Atendidos', icone: 'checkmark-done-outline' },
  { valor: 'T', label: 'Todos', icone: 'layers-outline' },
];

export default function DashboardScreen() {
  const { codreg, nomusu, nomregula } = useLocalSearchParams<{
    codreg: string;
    codusu: string;
    nomusu: string;
    nomregula: string;
  }>();

  const [situacao, setSituacao] = useState<SituacaoSinistro>('P');
  const [busca, setBusca] = useState('');
  const [sinistros, setSinistros] = useState<SinistroResumo[]>([]);
  const [contagens, setContagens] = useState<ContagemSituacoes>({ P: 0, A: 0, T: 0 });
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [menuVisivel, setMenuVisivel] = useState(false);

  const codregNum = Number(codreg);

  const recarregarLista = useCallback(async () => {
    if (!codregNum) return;
    const [lista, totais] = await Promise.all([
      listarSinistros(codregNum, situacao, busca),
      contarSinistrosPorSituacao(codregNum),
    ]);
    setSinistros(lista);
    setContagens(totais);
  }, [codregNum, situacao, busca]);

  useEffect(() => {
    if (!codregNum) return;

    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      try {
        const [lista, totais] = await Promise.all([
          listarSinistros(codregNum, situacao, busca),
          contarSinistrosPorSituacao(codregNum),
        ]);
        if (!cancelado) {
          setSinistros(lista);
          setContagens(totais);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, [codregNum, situacao, busca]);

  async function sincronizarAgora() {
    setSincronizando(true);
    try {
      const resultado = await sincronizarComCredenciaisSalvas();
      if (!resultado.success) {
        Alert.alert('Erro ao consultar', resultado.message);
        return;
      }
      await recarregarLista();
      Alert.alert(
        'Consulta concluída',
        resultado.novosSinistros > 0
          ? `${resultado.novosSinistros} sinistro(s) novo(s) encontrado(s).`
          : 'Nenhum sinistro novo no servidor.',
      );
    } finally {
      setSincronizando(false);
    }
  }

  function contatar(numero: string | null) {
    if (!numero) return;
    const digitos = somenteDigitos(numero);
    if (!digitos) return;

    Alert.alert(numero, 'Como deseja entrar em contato?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Ligar', onPress: () => abrirLink(`tel:${digitos}`, 'o discador') },
      {
        text: 'WhatsApp',
        onPress: () => abrirLink(`https://wa.me/${numeroWhatsApp(numero)}`, 'o WhatsApp'),
      },
    ]);
  }

  async function abrirLink(url: string, destino: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Não foi possível abrir', `Verifique se ${destino} está disponível neste aparelho.`);
    }
  }

  function confirmarExclusao(item: SinistroResumo) {
    Alert.alert(
      'Excluir processo',
      `Remover o sinistro ${item.nro_sinistro} de ${item.nm_segurado || 'segurado não informado'}? Isso apaga também fotos, documentos e todos os dados relacionados salvos no aparelho. Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await excluirSinistroCompleto(item.id_sinistro);
            setSinistros((atual) => atual.filter((s) => s.id_sinistro !== item.id_sinistro));
            setContagens(await contarSinistrosPorSituacao(codregNum));
          },
        },
      ],
    );
  }

  function sair() {
    setMenuVisivel(false);
    encerrarSessaoServidor(); // best-effort, não bloqueia o logout local
    limparCredenciais();
    cancelarVerificacaoPeriodica();
    router.replace('/login');
  }

  function consultarLogs() {
    setMenuVisivel(false);
    router.push('/logs');
  }

  function limparDispositivo() {
    setMenuVisivel(false);
    Alert.alert(
      'Limpar Dispositivo',
      'Isso vai apagar TODOS os processos, fotos, documentos e logs salvos neste aparelho (o cadastro do usuário logado é preservado). Essa ação não pode ser desfeita. Deseja realmente continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            await limparTodosOsProcessos();
            setSinistros([]);
            setContagens({ P: 0, A: 0, T: 0 });
            Alert.alert('Concluído', 'Todos os processos e logs foram removidos deste aparelho.');
          },
        },
      ],
    );
  }

  function abrirMensagens() {
    setMenuVisivel(false);
    router.push('/mensagens');
  }

  function inserirRoteiros() {
    setMenuVisivel(false);
    router.push({ pathname: '/roteiros', params: { codreg: String(codregNum) } });
  }

  function novosProcessos() {
    setMenuVisivel(false);
    sincronizarAgora();
  }

  const OPCOES_MENU: { chave: string; label: string; icone: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [
    { chave: 'novos', label: 'Novos Processos', icone: 'cloud-download-outline', onPress: novosProcessos },
    { chave: 'mensagens', label: 'Mensagens', icone: 'mail-outline', onPress: abrirMensagens },
    { chave: 'logs', label: 'Consultar Logs', icone: 'document-text-outline', onPress: consultarLogs },
    { chave: 'roteiros', label: 'Inserir Roteiros', icone: 'map-outline', onPress: inserirRoteiros },
    { chave: 'limpar', label: 'Limpar Dispositivo', icone: 'trash-outline', onPress: limparDispositivo },
    { chave: 'sair', label: 'Sair', icone: 'log-out-outline', onPress: sair },
  ];

  const labelAba = ABAS.find((a) => a.valor === situacao)?.label ?? '';

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerLabel}>Reguladora</Text>
          <Text style={styles.headerValue} numberOfLines={1}>
            {nomregula || '-'}
          </Text>
          <Text style={styles.headerLabel}>Vistoriador</Text>
          <Text style={styles.headerValue} numberOfLines={1}>
            {nomusu || '-'}
          </Text>
        </View>
        <View style={styles.headerAcoes}>
          <Pressable onPress={() => setMenuVisivel(true)} style={styles.botaoSair} hitSlop={10} disabled={sincronizando}>
            {sincronizando ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>

      <Modal visible={menuVisivel} transparent animationType="fade" onRequestClose={() => setMenuVisivel(false)}>
        <Pressable style={styles.menuFundo} onPress={() => setMenuVisivel(false)}>
          <View style={styles.menuCard}>
            {OPCOES_MENU.map((opcao) => (
              <Pressable key={opcao.chave} style={styles.menuItem} onPress={opcao.onPress}>
                <Ionicons name={opcao.icone} size={18} color="#1c3d5a" />
                <Text style={styles.menuItemTexto}>{opcao.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <View style={styles.abas}>
        {ABAS.map((aba) => (
          <Pressable
            key={aba.valor}
            style={[styles.aba, situacao === aba.valor && styles.abaAtiva]}
            onPress={() => setSituacao(aba.valor)}
          >
            <Ionicons
              name={aba.icone}
              size={16}
              color={situacao === aba.valor ? '#1c3d5a' : '#8a97a3'}
            />
            <Text style={[styles.abaTexto, situacao === aba.valor && styles.abaTextoAtivo]}>
              {aba.label}
            </Text>
            <View style={[styles.abaContador, situacao === aba.valor && styles.abaContadorAtivo]}>
              <Text
                style={[
                  styles.abaContadorTexto,
                  situacao === aba.valor && styles.abaContadorTextoAtivo,
                ]}
              >
                {contagens[aba.valor]}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.buscaContainer}>
        <Ionicons name="search-outline" size={18} color="#8a97a3" />
        <TextInput
          style={styles.buscaInput}
          placeholder="Buscar por segurado..."
          value={busca}
          onChangeText={setBusca}
          autoCapitalize="none"
        />
        {busca.length > 0 && (
          <Pressable onPress={() => setBusca('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color="#8a97a3" />
          </Pressable>
        )}
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color="#1c3d5a" />
        </View>
      ) : (
        <FlatList
          data={sinistros}
          keyExtractor={(item) => String(item.id_sinistro)}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <View style={styles.centro}>
              <Ionicons name="folder-open-outline" size={40} color="#c2ccd6" />
              <Text style={styles.vazioTexto}>Nenhum processo encontrado.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const novo = item.novo_sini == null;
            const expandidoAtual = expandido === item.id_sinistro;

            return (
              <ReanimatedSwipeable
                renderLeftActions={(_progress, _translation, swipeable) => (
                  <Pressable
                    style={styles.acaoExcluir}
                    onPress={() => {
                      swipeable.close();
                      confirmarExclusao(item);
                    }}
                  >
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                    <Text style={styles.acaoExcluirTexto}>Excluir</Text>
                  </Pressable>
                )}
                leftThreshold={80}
              >
                <View style={[styles.card, novo && styles.cardNovo]}>
                {novo && (
                  <View style={styles.badgeNovo}>
                    <Text style={styles.badgeNovoTexto}>NOVO</Text>
                  </View>
                )}

                <Pressable
                  onPress={() => router.push({ pathname: '/sinistro/[id]', params: { id: String(item.id_sinistro) } })}
                >
                  <View style={styles.cardTopo}>
                    <Text style={styles.cardSegurado} numberOfLines={1}>
                      {item.nm_segurado || 'Segurado não informado'}
                    </Text>
                    <View style={styles.cardIcones}>
                      <Ionicons
                        name={item.totfoto > 0 ? 'camera' : 'camera-outline'}
                        size={18}
                        color={item.totfoto > 0 ? '#2a9d5c' : '#c2ccd6'}
                      />
                      <Ionicons
                        name={item.totdoc > 0 ? 'document-text' : 'document-text-outline'}
                        size={18}
                        color={item.totdoc > 0 ? '#2a9d5c' : '#c2ccd6'}
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  </View>

                  <Text style={styles.cardLinha}>
                    Sinistro <Text style={styles.cardDestaque}>{item.nro_sinistro}</Text>
                    {item.nm_cidade ? `  ·  ${item.nm_cidade}/${item.id_estado}` : ''}
                  </Text>
                  {item.nm_causa && <Text style={styles.cardLinha}>Causa: {item.nm_causa}</Text>}
                  {item.nm_produto && (
                    <Text style={styles.cardLinha}>
                      Produto: {item.nm_produto}
                      {item.apelido ? `  ·  ${item.apelido}` : ''}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.botaoExpandir}
                  onPress={() => setExpandido(expandidoAtual ? null : item.id_sinistro)}
                >
                  <Ionicons
                    name={expandidoAtual ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={16}
                    color="#8a97a3"
                  />
                  <Text style={styles.botaoExpandirTexto}>
                    {expandidoAtual ? 'Ocultar endereço' : 'Ver endereço'}
                  </Text>
                </Pressable>

                {expandidoAtual && (
                  <View style={styles.cardDetalhe}>
                    {item.endereco && (
                      <Text style={styles.cardLinha}>
                        Endereço: {item.endereco}
                        {item.nro_predio ? `, ${item.nro_predio}` : ''}
                        {item.bairro ? ` - ${item.bairro}` : ''}
                      </Text>
                    )}
                    {item.apolice && <Text style={styles.cardLinha}>Apólice: {item.apolice}</Text>}
                    <View style={styles.contatos}>
                      {item.fone && (
                        <Pressable style={styles.contatoBtn} onPress={() => contatar(item.fone)}>
                          <Ionicons name="call-outline" size={14} color="#1c3d5a" />
                          <Text style={styles.contatoTexto}>{item.fone}</Text>
                        </Pressable>
                      )}
                      {item.celular && (
                        <Pressable style={styles.contatoBtn} onPress={() => contatar(item.celular)}>
                          <Ionicons name="phone-portrait-outline" size={14} color="#1c3d5a" />
                          <Text style={styles.contatoTexto}>{item.celular}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
                </View>
              </ReanimatedSwipeable>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerTexto}>
          ({contagens[situacao]}) {labelAba}
        </Text>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    backgroundColor: '#1c3d5a',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  headerLabel: {
    color: '#9db3c7',
    fontSize: 11,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  headerValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botaoSair: {
    padding: 4,
  },
  menuFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  menuCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 90 : 60,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 6,
    minWidth: 200,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemTexto: {
    fontSize: 14,
    color: '#1c3d5a',
    fontWeight: '600',
  },
  abas: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -14,
    borderRadius: 10,
    padding: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  aba: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  abaAtiva: {
    backgroundColor: '#e7edf3',
  },
  abaTexto: {
    fontSize: 12,
    color: '#8a97a3',
    fontWeight: '600',
  },
  abaTextoAtivo: {
    color: '#1c3d5a',
  },
  abaContador: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#eef2f5',
    alignItems: 'center',
  },
  abaContadorAtivo: {
    backgroundColor: '#1c3d5a',
  },
  abaContadorTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8a97a3',
  },
  abaContadorTextoAtivo: {
    color: '#fff',
  },
  buscaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e3e8ed',
  },
  buscaInput: {
    flex: 1,
    fontSize: 14,
  },
  lista: {
    padding: 16,
    paddingBottom: 8,
    gap: 10,
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  vazioTexto: {
    color: '#8a97a3',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#e3e8ed',
  },
  acaoExcluir: {
    backgroundColor: '#d32f2f',
    borderRadius: 12,
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  acaoExcluirTexto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardNovo: {
    borderLeftColor: '#e8b93a',
    backgroundColor: '#fffbeb',
  },
  badgeNovo: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#e8b93a',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeNovoTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  cardTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingRight: 40,
  },
  cardSegurado: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1c3d5a',
    flex: 1,
  },
  cardIcones: {
    flexDirection: 'row',
  },
  cardLinha: {
    fontSize: 13,
    color: '#48545e',
    marginTop: 2,
  },
  cardDestaque: {
    color: '#2a88ad',
    fontWeight: '600',
  },
  botaoExpandir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  botaoExpandirTexto: {
    fontSize: 12,
    color: '#8a97a3',
    fontWeight: '600',
  },
  cardDetalhe: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef1f4',
  },
  contatos: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  contatoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef4f8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  contatoTexto: {
    fontSize: 12,
    color: '#1c3d5a',
    fontWeight: '600',
  },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e3e8ed',
    paddingVertical: 10,
    alignItems: 'center',
  },
  footerTexto: {
    fontSize: 13,
    color: '#48545e',
    fontWeight: '600',
  },
});
