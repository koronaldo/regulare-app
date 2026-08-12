/** Formatação de campos percentuais nos formulários (mesmo estilo "digita e formata" da moeda). */

/** Formata como percentual enquanto digita (dígitos viram centésimos): "150" -> "1,50%". */
export function formatarPercentualDigitado(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return '';
  const numero = Number(digitos) / 100;
  return `${numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Formata um número/string numérica já existente (ex.: vindo do banco) pra exibição. */
export function formatarPercentual(valor: string | number | null | undefined): string {
  if (valor === '' || valor == null) return '';
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (Number.isNaN(n)) return '';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Extrai o valor numérico puro ("1.50") de um texto formatado como percentual, pra gravar no banco. */
export function paraNumeroPercentual(valorFormatado: string): string {
  const digitos = valorFormatado.replace(/\D/g, '');
  if (!digitos) return '';
  return (Number(digitos) / 100).toFixed(2);
}
