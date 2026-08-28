import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'react-native-compressor';

/** Acima disso o arquivo passa por compactação antes de subir pro servidor. */
export const LIMITE_COMPACTACAO_BYTES = 3 * 1024 * 1024;

/** Passos de compactação, do mais leve pro mais agressivo — para no primeiro que fica sob o limite. */
const PASSOS = [
  { dimensao: 1600, qualidade: 0.7 },
  { dimensao: 1280, qualidade: 0.55 },
  { dimensao: 1024, qualidade: 0.4 },
];

const EXTENSOES_IMAGEM = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.bmp'];

export function ehImagem(uri: string): boolean {
  const semQuery = uri.split('?')[0].toLowerCase();
  return EXTENSOES_IMAGEM.some((ext) => semQuery.endsWith(ext));
}

export function tamanhoDoArquivo(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

function pastaTemporaria(): Directory {
  const dir = new Directory(Paths.cache, 'envio');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Compacta uma imagem até ficar abaixo de `limite`, tentando os PASSOS em ordem. O original nunca
 * é alterado: o resultado vai pra pasta de cache, que o sistema pode limpar à vontade — quem
 * chama usa o retorno só pra subir o arquivo.
 *
 * Devolve a própria uri quando já está sob o limite, quando não é imagem, ou quando nem o passo
 * mais agressivo resolveu (aí é melhor mandar grande do que não mandar).
 */
export async function compactarImagemParaEnvio(uri: string, limite = LIMITE_COMPACTACAO_BYTES): Promise<string> {
  if (!ehImagem(uri) || tamanhoDoArquivo(uri) <= limite) return uri;

  const dir = pastaTemporaria();
  let melhor = uri;

  for (const passo of PASSOS) {
    try {
      // react-native-compressor e não expo-image-manipulator: um anexo vindo da galeria pode
      // estar em resolução cheia, e o manipulator decodifica o bitmap inteiro antes de reduzir,
      // estourando o heap. O compressor reduz já na decodificação.
      const comprimida = await Image.compress(uri, {
        compressionMethod: 'manual',
        maxWidth: passo.dimensao,
        maxHeight: passo.dimensao,
        quality: passo.qualidade,
        output: 'jpg',
        returnableOutputType: 'uri',
      });

      const destino = new File(dir, `envio_${Date.now()}_${passo.dimensao}.jpg`);
      await new File(comprimida.startsWith('file://') ? comprimida : `file://${comprimida}`).move(destino);
      melhor = destino.uri;

      if (tamanhoDoArquivo(destino.uri) <= limite) return destino.uri;
    } catch {
      // Passo falhou (formato não suportado, memória): tenta o próximo, senão devolve o que tiver.
      break;
    }
  }

  return melhor;
}
