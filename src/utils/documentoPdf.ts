import { File } from 'expo-file-system';
import * as Print from 'expo-print';

import { compactarImagemParaEnvio, LIMITE_COMPACTACAO_BYTES, tamanhoDoArquivo } from './compactacao';

/** Página A4 em pontos (72dpi) — mesma unidade usada por calcularTamanhoPagina (atasTemplate.ts). */
const LARGURA_A4_PT = 595;
const ALTURA_A4_PT = 842;

/** Espelha ESCALA_POR_FORMATO de documento/[idDocumento].tsx: "tamanho no PDF" escolhido por página. */
const ESCALA_POR_FORMATO: Record<string, number> = { '1': 0.25, '2': 0.5, '3': 0.75, '4': 1 };

export interface PaginaParaPdf {
  arquivo: string;
  formato: string;
}

/**
 * Junta as páginas fotografadas de uma instância de documento (mesmo grupopag) num único PDF —
 * uma página A4 por foto, escalada conforme o "tamanho no PDF" que o usuário escolheu por página
 * (mesma escala usada na pré-visualização em documento/[idDocumento].tsx). Porta de GerandoPDF
 * (digitaliza_def_screen.js), via expo-print em vez do plugin cordova-pdf. Embute cada imagem
 * como base64 — não file:// — igual ao legado (que guardava img_base64 pra isso), pra garantir
 * que a imagem renderiza dentro do motor de impressão.
 */
export async function gerarPdfDePaginas(paginas: PaginaParaPdf[]): Promise<string> {
  // Cada foto entra no PDF como base64, então o tamanho do PDF é a soma das fotos: compactar
  // aqui é o que mantém o documento final abaixo do limite de envio. O limite é dividido pelo
  // número de páginas pra que um documento de várias fotos não estoure a soma.
  const limitePorPagina = Math.max(Math.floor(LIMITE_COMPACTACAO_BYTES / Math.max(paginas.length, 1)), 300 * 1024);

  const divs = await Promise.all(
    paginas.map(async (pagina) => {
      const escala = ESCALA_POR_FORMATO[pagina.formato] ?? 1;
      const arquivoParaEmbutir = await compactarImagemParaEnvio(pagina.arquivo, limitePorPagina);
      const base64 = await new File(arquivoParaEmbutir).base64();
      return `<div class="pagina"><img src="data:image/jpeg;base64,${base64}" style="width:${escala * 100}%;height:${escala * 100}%;object-fit:contain;" /></div>`;
    }),
  );

  const html = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .pagina { width: 100%; height: 100%; padding: 2cm; display: flex; align-items: center; justify-content: center; page-break-after: always; }
  </style></head><body>${divs.join('')}</body></html>`;

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: LARGURA_A4_PT,
    height: ALTURA_A4_PT,
  });

  const tamanhoFinal = tamanhoDoArquivo(uri);
  if (tamanhoFinal > LIMITE_COMPACTACAO_BYTES) {
    console.warn(
      `[documentoPdf] PDF de ${paginas.length} página(s) ficou com ${(tamanhoFinal / 1024 / 1024).toFixed(1)}MB, acima do limite de envio.`,
    );
  }
  return uri;
}
