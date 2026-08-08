import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File } from 'expo-file-system';

const DIMENSAO_MAXIMA = 1600;

/** Redimensiona (se necessário) e comprime uma imagem, movendo o resultado para `dir`. */
export async function reduzImagem(
  uri: string,
  largura: number,
  altura: number,
  dir: Directory,
  prefixo = 'img',
): Promise<string> {
  let contexto = ImageManipulator.manipulate(uri);
  const maiorLado = Math.max(largura, altura);
  if (maiorLado > DIMENSAO_MAXIMA) {
    const escala = DIMENSAO_MAXIMA / maiorLado;
    contexto = contexto.resize({ width: Math.round(largura * escala), height: Math.round(altura * escala) });
  }
  const renderizada = await contexto.renderAsync();
  const resultado = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });

  if (!dir.exists) dir.create({ intermediates: true });
  const destino = new File(dir, `${prefixo}_${Date.now()}.jpg`);
  await new File(resultado.uri).move(destino);
  return destino.uri;
}
