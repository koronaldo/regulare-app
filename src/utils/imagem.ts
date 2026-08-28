import { Directory, File } from 'expo-file-system';
import { Image } from 'react-native-compressor';

const DIMENSAO_MAXIMA = 1600;
const QUALIDADE = 0.75;

/**
 * O compressor pode devolver o caminho sem o esquema `file://`, que o File do expo-file-system
 * exige. Normaliza antes de mover.
 */
function comoUriDeArquivo(caminho: string): string {
  return caminho.startsWith('file://') ? caminho : `file://${caminho}`;
}

/**
 * Redimensiona e comprime uma imagem, movendo o resultado para `dir`.
 *
 * Usa react-native-compressor e NÃO expo-image-manipulator: o manipulator decodifica o bitmap
 * inteiro antes de redimensionar, e uma foto de câmera deste porte ocupa mais que o heap do app
 * (256MB neste aparelho) — o processo era morto pelo sistema sem exceção nenhuma, o que aparecia
 * como "o app fechou sozinho" ao salvar foto ou digitalizar documento. O compressor reduz já na
 * decodificação (inSampleSize no Android), então o pico de memória é uma fração disso.
 */
export async function reduzImagem(
  uri: string,
  largura: number,
  altura: number,
  dir: Directory,
  prefixo = 'img',
): Promise<string> {
  // Nunca amplia: o limite é o menor entre o tamanho original e o teto.
  const maiorLado = Math.max(largura || 0, altura || 0);
  const limite = maiorLado > 0 ? Math.min(maiorLado, DIMENSAO_MAXIMA) : DIMENSAO_MAXIMA;

  const comprimida = await Image.compress(uri, {
    compressionMethod: 'manual',
    maxWidth: limite,
    maxHeight: limite,
    quality: QUALIDADE,
    output: 'jpg',
    returnableOutputType: 'uri',
  });

  if (!dir.exists) dir.create({ intermediates: true });
  const destino = new File(dir, `${prefixo}_${Date.now()}.jpg`);
  await new File(comoUriDeArquivo(comprimida)).move(destino);
  return destino.uri;
}
