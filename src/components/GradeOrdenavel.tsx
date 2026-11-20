import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Reanimated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

/**
 * Grade com reordenação por "segurar e arrastar".
 *
 * Substitui o SortableList do react-native-drax na tela de fotos: o drax esconde o item original
 * (opacity 0) e desenha uma cópia numa camada flutuante — nos aparelhos do campo essa cópia não
 * aparecia, então a foto "sumia" durante o arraste e só voltava ao soltar. Aqui o próprio item é
 * que se move (fica por cima, ampliado e com borda de destaque), e cada célula mostra o número da
 * posição em que ela vai ficar, atualizado ao vivo enquanto o usuário arrasta.
 */

/** Tempo segurando antes de "pegar" a foto — curto o bastante, e o toque simples ainda abre a foto. */
const ATRASO_PEGAR_MS = 300;
/** Faixa (px) junto às bordas de cima/baixo da área visível em que a grade rola sozinha. */
const BORDA_AUTO_ROLAGEM = 70;
/** Velocidade máxima da rolagem automática, em px por quadro. */
const VELOCIDADE_MAX_ROLAGEM = 12;

type Posicoes = Record<string, number>;

interface ItemInfo {
  /** Posição (base 1) em que o item está/vai ficar — já considerando o arraste em andamento. */
  posicao: number;
  arrastando: boolean;
}

interface Props<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  numColumns: number;
  /** Largura e altura de cada célula, já incluindo o espaçamento entre elas. */
  larguraCelula: number;
  alturaCelula: number;
  padding?: number;
  renderItem: (item: T, info: ItemInfo) => ReactNode;
  onReorder: (novaOrdem: T[]) => void;
  ListEmptyComponent?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function posicoesIniciais(chaves: string[]): Posicoes {
  const p: Posicoes = {};
  chaves.forEach((k, i) => {
    p[k] = i;
  });
  return p;
}

export function GradeOrdenavel<T>({
  data,
  keyExtractor,
  numColumns,
  larguraCelula,
  alturaCelula,
  padding = 0,
  renderItem,
  onReorder,
  ListEmptyComponent,
  style,
}: Props<T>) {
  const chaves = useMemo(() => data.map(keyExtractor), [data, keyExtractor]);
  const total = chaves.length;
  const linhas = Math.ceil(total / numColumns);
  const alturaConteudo = linhas * alturaCelula + padding * 2;

  const scrollRef = useAnimatedRef<Reanimated.ScrollView>();
  const rolagemY = useSharedValue(0);
  const alturaVisivel = useSharedValue(0);
  const alturaConteudoSV = useSharedValue(alturaConteudo);
  const posicoes = useSharedValue<Posicoes>(posicoesIniciais(chaves));
  const chaveAtiva = useSharedValue('');

  // Espelho das posições no JS, só pra desenhar os números (muda poucas vezes por arraste).
  const [posicoesJS, setPosicoesJS] = useState<Posicoes>(() => posicoesIniciais(chaves));
  const [chaveArrastando, setChaveArrastando] = useState('');

  // Lista nova vinda de fora (foto incluída/excluída, ou a ordem já gravada): recomeça dela.
  useEffect(() => {
    // O espelho no JS (setPosicoesJS) é atualizado pela reação abaixo.
    posicoes.set(posicoesIniciais(chaves));
  }, [chaves, posicoes]);

  useEffect(() => {
    alturaConteudoSV.set(alturaConteudo);
  }, [alturaConteudo, alturaConteudoSV]);

  useAnimatedReaction(
    () => posicoes.value,
    (atual, anterior) => {
      if (atual !== anterior) runOnJS(setPosicoesJS)(atual);
    },
  );

  const aoRolar = useAnimatedScrollHandler((e) => {
    rolagemY.set(e.contentOffset.y);
  });

  function concluirArraste(ordemChaves: string[]) {
    setChaveArrastando('');
    const porChave = new Map(data.map((item) => [keyExtractor(item), item]));
    const novaOrdem = ordemChaves.map((k) => porChave.get(k)).filter((x): x is T => x !== undefined);
    const mudou = novaOrdem.some((item, i) => item !== data[i]);
    if (mudou && novaOrdem.length === data.length) onReorder(novaOrdem);
  }

  if (total === 0) {
    return <View style={style}>{ListEmptyComponent}</View>;
  }

  return (
    <Reanimated.ScrollView
      ref={scrollRef}
      style={style}
      onScroll={aoRolar}
      scrollEventThrottle={16}
      onLayout={(e) => {
        alturaVisivel.set(e.nativeEvent.layout.height);
      }}
    >
      <View style={{ height: alturaConteudo }}>
        {data.map((item, indiceNaLista) => {
          const chave = keyExtractor(item);
          const posicao = (posicoesJS[chave] ?? indiceNaLista) + 1;
          const arrastando = chaveArrastando === chave;
          return (
            <CelulaOrdenavel
              key={chave}
              chave={chave}
              indiceInicial={indiceNaLista}
              total={total}
              numColumns={numColumns}
              larguraCelula={larguraCelula}
              alturaCelula={alturaCelula}
              padding={padding}
              posicoes={posicoes}
              chaveAtiva={chaveAtiva}
              rolagemY={rolagemY}
              alturaVisivel={alturaVisivel}
              alturaConteudo={alturaConteudoSV}
              scrollRef={scrollRef}
              aoPegar={setChaveArrastando}
              aoSoltar={concluirArraste}
            >
              {renderItem(item, { posicao, arrastando })}
              <View
                pointerEvents="none"
                style={[styles.selo, arrastando && styles.seloArrastando]}
              >
                <Text style={[styles.seloTexto, arrastando && styles.seloTextoArrastando]}>
                  {posicao}
                </Text>
              </View>
            </CelulaOrdenavel>
          );
        })}
      </View>
    </Reanimated.ScrollView>
  );
}

interface CelulaProps {
  chave: string;
  /** Posição na lista ao montar — as posições compartilhadas só são atualizadas depois do render. */
  indiceInicial: number;
  total: number;
  numColumns: number;
  larguraCelula: number;
  alturaCelula: number;
  padding: number;
  posicoes: SharedValue<Posicoes>;
  chaveAtiva: SharedValue<string>;
  rolagemY: SharedValue<number>;
  alturaVisivel: SharedValue<number>;
  alturaConteudo: SharedValue<number>;
  scrollRef: ReturnType<typeof useAnimatedRef<Reanimated.ScrollView>>;
  aoPegar: (chave: string) => void;
  aoSoltar: (ordemChaves: string[]) => void;
  children: ReactNode;
}

function CelulaOrdenavel({
  chave,
  indiceInicial,
  total,
  numColumns,
  larguraCelula,
  alturaCelula,
  padding,
  posicoes,
  chaveAtiva,
  rolagemY,
  alturaVisivel,
  alturaConteudo,
  scrollRef,
  aoPegar,
  aoSoltar,
  children,
}: CelulaProps) {
  const x = useSharedValue(padding + (indiceInicial % numColumns) * larguraCelula);
  const y = useSharedValue(padding + Math.floor(indiceInicial / numColumns) * alturaCelula);
  const escala = useSharedValue(1);

  // Onde o dedo pegou: posição da célula e rolagem no instante em que o arraste começou.
  const origemX = useSharedValue(0);
  const origemY = useSharedValue(0);
  const rolagemOrigem = useSharedValue(0);
  const deslocX = useSharedValue(0);
  const deslocY = useSharedValue(0);

  const ativo = useSharedValue(false);

  // Fora do arraste, cada célula desliza até a vaga que corresponde à sua posição atual.
  useAnimatedReaction(
    () => posicoes.value[chave],
    (indice) => {
      if (indice === undefined || ativo.value) return;
      x.set(withTiming(padding + (indice % numColumns) * larguraCelula, { duration: 180 }));
      y.set(withTiming(padding + Math.floor(indice / numColumns) * alturaCelula, {
        duration: 180,
      }));
    },
    [padding, numColumns, larguraCelula, alturaCelula],
  );

  /** Reposiciona a célula arrastada e, se ela passou sobre outra vaga, reordena as demais. */
  function atualizarArraste() {
    'worklet';
    const novoX = origemX.value + deslocX.value;
    const novoY = origemY.value + deslocY.value + (rolagemY.value - rolagemOrigem.value);
    x.set(novoX);
    y.set(novoY);

    // Vaga sob o centro da célula arrastada.
    const coluna = Math.min(
      numColumns - 1,
      Math.max(0, Math.round((novoX - padding) / larguraCelula)),
    );
    const linha = Math.max(0, Math.round((novoY - padding) / alturaCelula));
    const destino = Math.min(total - 1, linha * numColumns + coluna);

    const atuais = posicoes.value;
    const origem = atuais[chave];
    if (origem === undefined || destino === origem) return;

    const novas: Posicoes = {};
    for (const k in atuais) {
      const p = atuais[k];
      if (k === chave) novas[k] = destino;
      else if (origem < destino && p > origem && p <= destino) novas[k] = p - 1;
      else if (origem > destino && p < origem && p >= destino) novas[k] = p + 1;
      else novas[k] = p;
    }
    posicoes.set(novas);
  }

  // Rolagem automática quando a foto é levada pra perto da borda de cima/baixo.
  const rolagemAuto = useFrameCallback(() => {
    if (!ativo.value) return;
    const topoNaTela = y.value - rolagemY.value;
    const baseNaTela = topoNaTela + alturaCelula;
    const limite = Math.max(0, alturaConteudo.value - alturaVisivel.value);
    let passo = 0;
    if (topoNaTela < BORDA_AUTO_ROLAGEM) {
      passo = -VELOCIDADE_MAX_ROLAGEM * Math.min(1, (BORDA_AUTO_ROLAGEM - topoNaTela) / BORDA_AUTO_ROLAGEM);
    } else if (baseNaTela > alturaVisivel.value - BORDA_AUTO_ROLAGEM) {
      passo =
        VELOCIDADE_MAX_ROLAGEM *
        Math.min(1, (baseNaTela - (alturaVisivel.value - BORDA_AUTO_ROLAGEM)) / BORDA_AUTO_ROLAGEM);
    }
    if (passo === 0) return;
    const novaRolagem = Math.min(limite, Math.max(0, rolagemY.value + passo));
    if (novaRolagem === rolagemY.value) return;
    rolagemY.set(novaRolagem);
    scrollTo(scrollRef, 0, novaRolagem, false);
    atualizarArraste();
  }, false);

  function ligarRolagemAuto(ligar: boolean) {
    rolagemAuto.setActive(ligar);
  }

  const gesto = usePanGesture({
    activateAfterLongPress: ATRASO_PEGAR_MS,
    onActivate: () => {
      'worklet';
      ativo.set(true);
      chaveAtiva.set(chave);
      origemX.set(x.value);
      origemY.set(y.value);
      rolagemOrigem.set(rolagemY.value);
      deslocX.set(0);
      deslocY.set(0);
      escala.set(withSpring(1.1));
      runOnJS(aoPegar)(chave);
      runOnJS(ligarRolagemAuto)(true);
    },
    onUpdate: (e) => {
      'worklet';
      if (!ativo.value) return;
      deslocX.set(e.translationX);
      deslocY.set(e.translationY);
      atualizarArraste();
    },
    onFinalize: () => {
      'worklet';
      if (!ativo.value) return;
      ativo.set(false);
      const indice = posicoes.value[chave] ?? 0;
      x.set(withTiming(padding + (indice % numColumns) * larguraCelula, { duration: 180 }));
      y.set(withTiming(padding + Math.floor(indice / numColumns) * alturaCelula, {
        duration: 180,
      }));
      escala.set(withTiming(1, { duration: 180 }));
      chaveAtiva.set('');

      const atuais = posicoes.value;
      const ordem: string[] = [];
      for (const k in atuais) ordem[atuais[k]] = k;
      runOnJS(ligarRolagemAuto)(false);
      runOnJS(aoSoltar)(ordem);
    },
  });

  const estilo = useAnimatedStyle(() => {
    const emDestaque = chaveAtiva.value === chave;
    return {
      transform: [{ translateX: x.value }, { translateY: y.value }, { scale: escala.value }],
      // zIndex + elevation: no Android a elevação também decide quem fica por cima.
      zIndex: emDestaque ? 100 : 1,
      elevation: emDestaque ? 12 : 1,
      opacity: chaveAtiva.value !== '' && !emDestaque ? 0.75 : 1,
    };
  });

  return (
    <GestureDetector gesture={gesto}>
      <Reanimated.View
        style={[styles.celula, { width: larguraCelula, height: alturaCelula }, estilo]}
      >
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  celula: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  selo: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 61, 90, 0.85)',
  },
  seloArrastando: {
    backgroundColor: '#e8b93a',
    minWidth: 28,
    height: 28,
    borderRadius: 14,
  },
  seloTexto: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  seloTextoArrastando: {
    color: '#1c3d5a',
    fontSize: 14,
  },
});
