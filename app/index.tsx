import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { sessaoValida } from '../src/services/credenciais';
import { lerFotoPendente } from '../src/services/fotoPendente';

const DURACAO_GIRO_MS = 3200;
const DURACAO_TITULO_MS = 1100;
const DURACAO_SUBTITULO_MS = 800;
/** Tempo que a estrela leva pra acender por completo. */
const DURACAO_ESTRELA_MS = 1400;
/** Respiro depois da estrela antes de sair pro login. */
const PAUSA_FINAL_MS = 500;

const TAMANHO_LOGO = 120;
/** Espessura do "disco" do logo: 30% da altura dele. */
const ESPESSURA = TAMANHO_LOGO * 0.3;
/** Camadas empilhadas que simulam o volume — mais camadas, borda mais lisa e mais custo. */
const CAMADAS = 14;
/** Cor das faces laterais: o mesmo azul do logo, mais escuro, pra ler como "lado" do objeto. */
const COR_LATERAL = '#2f6fb8';

/** Braço mais longo da estrela, da ponta ao centro. Dimensionado pra caber entre as palavras. */
const RAIO_ESTRELA = 21;
/** Espaço reservado entre "Regulare" e "Mobile" — os raios podem transbordar um pouco. */
const ESPACO_ESTRELA = 30;

/** Azul do logo: entre as palavras o fundo é branco, então é o azul que dá contraste — branco
 * ali seria invisível. O gradiente dissolve as pontas pra não encostar nas letras com corte seco. */
const COR_RAIO = 'rgba(74, 144, 226, 0.95)';

/**
 * Raios em proporção do RAIO_ESTRELA. Cada entrada é um diâmetro (atravessa o centro), então
 * 4 ângulos já dão 8 pontas — os comprimentos desiguais são o que dá o aspecto de brilho de
 * estrela em vez de uma roda simétrica.
 */
const RAIOS = [
  { angulo: 0, escala: 1 },
  { angulo: 90, escala: 1 },
  { angulo: 45, escala: 0.5 },
  { angulo: 135, escala: 0.5 },
  { angulo: 22.5, escala: 0.3 },
  { angulo: 67.5, escala: 0.3 },
  { angulo: 112.5, escala: 0.3 },
  { angulo: 157.5, escala: 0.3 },
];

/**
 * Aproximação de sen(θ) com θ indo de 0 a 360 conforme o giro avança.
 *
 * O React Native não tem translateZ, então não dá pra afastar as camadas em profundidade de
 * verdade. Mas a projeção de um deslocamento Z sob rotateY(θ) é justamente `z * sen(θ)` na
 * horizontal: com o logo de frente (θ=0) as camadas coincidem e a espessura some, e de perfil
 * (θ=90) elas se espalham e o volume aparece — que é o comportamento real de um disco girando.
 */
const ENTRADA_SENO = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const SAIDA_SENO = [0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071, 0];

export default function AberturaScreen() {
  // useMemo (e não useRef) porque os valores são lidos durante o render, nas interpolações.
  const giro = useMemo(() => new Animated.Value(0), []);
  const titulo = useMemo(() => new Animated.Value(0), []);
  const subtitulo = useMemo(() => new Animated.Value(0), []);
  const estrela = useMemo(() => new Animated.Value(0), []);

  /** Impede que a animação e a recuperação de foto pendente naveguem as duas. */
  const navegou = useRef(false);

  useEffect(() => {
    // O Android mata o processo do app enquanto a câmera/galeria está aberta (falta de memória):
    // na volta o app abre do zero aqui, e a foto tirada ficaria esperando o usuário achar o
    // Álbum de novo — pra ele parecia que "o app reiniciou e perdeu a foto". Se há foto pendente
    // e sessão válida, pula a animação e reabre direto o Álbum, que conclui o salvamento via
    // getPendingResultAsync() (ver fotos.tsx). A pilha dashboard → sinistro → fotos é remontada
    // pro botão voltar continuar funcionando como antes.
    let cancelado = false;
    (async () => {
      const pendente = await lerFotoPendente();
      if (!pendente || cancelado || navegou.current) return;
      const sessao = await sessaoValida();
      if (!sessao || cancelado || navegou.current) return;
      navegou.current = true;
      router.replace({
        pathname: '/dashboard',
        params: { codreg: sessao.codreg ?? '', nomusu: sessao.nomusu ?? '', nomregula: sessao.nomregula ?? '' },
      });
      const id = String(pendente.idSinistro);
      router.push({ pathname: '/sinistro/[id]', params: { id } });
      router.push({ pathname: '/sinistro/[id]/fotos', params: { id } });
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    // A navegação sai da conclusão da sequência, não de um timeout paralelo: assim a animação
    // nunca é cortada no meio se um aparelho mais lento demorar a renderizar.
    const sequencia = Animated.sequence([
      Animated.timing(giro, {
        toValue: 1,
        duration: DURACAO_GIRO_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(titulo, {
        toValue: 1,
        duration: DURACAO_TITULO_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(subtitulo, {
        toValue: 1,
        duration: DURACAO_SUBTITULO_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(estrela, {
        toValue: 1,
        duration: DURACAO_ESTRELA_MS,
        // Acelera no fim: a estrela demora a "pegar" e então estoura de brilho.
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    sequencia.start(({ finished }) => {
      if (!finished) return;
      setTimeout(async () => {
        if (navegou.current) return;
        // Sessão de 24h ainda válida (ver auth.ts/credenciais.ts): pula a tela de login e abre
        // direto no dashboard com os dados do último login — sem isso, o app pedia login toda
        // vez que abria (ou que o Android matava o processo em segundo plano).
        const sessao = await sessaoValida();
        if (navegou.current) return;
        navegou.current = true;
        if (sessao) {
          router.replace({
            pathname: '/dashboard',
            params: { codreg: sessao.codreg ?? '', nomusu: sessao.nomusu ?? '', nomregula: sessao.nomregula ?? '' },
          });
        } else {
          router.replace('/login');
        }
      }, PAUSA_FINAL_MS);
    });

    return () => sequencia.stop();
  }, [giro, titulo, subtitulo, estrela]);

  const rotateY = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Camadas do fundo (-espessura/2) até a face da frente (+espessura/2).
  const camadas = useMemo(
    () =>
      Array.from({ length: CAMADAS }, (_, i) => {
        const profundidade = -ESPESSURA / 2 + (ESPESSURA * i) / (CAMADAS - 1);
        return { profundidade, ehFrente: i === CAMADAS - 1 };
      }),
    [],
  );

  const tituloEstilo = {
    opacity: titulo,
    transform: [{ translateY: titulo.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  const subtituloEstilo = {
    opacity: subtitulo,
    transform: [{ translateY: subtitulo.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  /** Começa apagada e vai ganhando intensidade: opacidade e tamanho crescem juntos. */
  const estrelaEstilo = {
    opacity: estrela,
    transform: [{ scale: estrela.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) }],
  };

  /** O núcleo estoura de brilho mais tarde que os braços, o que dá o "acender" da estrela. */
  const nucleoEstilo = {
    opacity: estrela.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0.25, 1] }),
    transform: [{ scale: estrela.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.2, 0.5, 1] }) }],
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.conteudo}>
        <View style={styles.logoArea}>
          {camadas.map((camada) => (
            <Animated.View
              key={camada.profundidade}
              style={[
                styles.camada,
                {
                  // Deslocamento em espaço de tela fica no wrapper, e o giro na imagem: assim as
                  // duas transformações não se compõem uma sobre a outra.
                  transform: [
                    {
                      translateX: giro.interpolate({
                        inputRange: ENTRADA_SENO,
                        outputRange: SAIDA_SENO.map((seno) => seno * camada.profundidade),
                      }),
                    },
                  ],
                },
              ]}
            >
              <Animated.Image
                source={require('../assets/logo-azul.png')}
                style={[styles.logo, { transform: [{ perspective: 800 }, { rotateY }] }]}
                resizeMode="contain"
                tintColor={camada.ehFrente ? undefined : COR_LATERAL}
              />
            </Animated.View>
          ))}

        </View>

        <View style={styles.blocoTexto}>
          <View style={styles.linhaTitulo}>
            <Animated.Text style={[styles.titulo, tituloEstilo]}>Regulare</Animated.Text>

            {/* Estrela montada com gradientes cruzados: sem SVG no projeto, o gradiente é o que
                faz o raio se dissolver nas pontas em vez de terminar numa barra reta. */}
            <View style={styles.espacoEstrela}>
              <Animated.View style={[styles.estrela, estrelaEstilo]} pointerEvents="none">
                {RAIOS.map((raio) => (
                  <LinearGradient
                    key={raio.angulo}
                    colors={['transparent', COR_RAIO, 'transparent']}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[
                      styles.raio,
                      {
                        width: RAIO_ESTRELA * 2 * raio.escala,
                        transform: [{ rotate: `${raio.angulo}deg` }],
                      },
                    ]}
                  />
                ))}
                <Animated.View style={[styles.halo, nucleoEstilo]} />
                <Animated.View style={[styles.nucleo, nucleoEstilo]} />
              </Animated.View>
            </View>

            <Animated.Text style={[styles.titulo, tituloEstilo]}>Mobile</Animated.Text>
          </View>
          <Animated.Text style={[styles.subtitulo, subtituloEstilo]}>Regulação de Sinistros</Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  conteudo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoArea: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  camada: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: TAMANHO_LOGO,
    height: TAMANHO_LOGO,
  },
  estrela: {
    width: RAIO_ESTRELA * 2,
    height: RAIO_ESTRELA * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raio: {
    position: 'absolute',
    height: 2,
  },
  /** Brilho difuso em volta do núcleo — o degradê do halo vem da opacidade baixa, não de um blur. */
  halo: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(74, 144, 226, 0.28)',
  },
  nucleo: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4a90e2',
  },
  blocoTexto: {
    alignItems: 'center',
  },
  linhaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  espacoEstrela: {
    width: ESPACO_ESTRELA,
    // Altura explícita: sem ela o contêiner colapsa (os raios são absolutos e não ocupam espaço)
    // e a estrela não tem onde se centralizar.
    height: RAIO_ESTRELA * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1c3d5a',
  },
  subtitulo: {
    fontSize: 15,
    textAlign: 'center',
    color: '#6b7a88',
    marginTop: 6,
  },
});
