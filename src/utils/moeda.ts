/** Formatação de valores em Real (BRL) nos formulários. */

/** Formata como moeda enquanto digita (dígitos viram centavos): "150" -> "R$ 1,50". */
export function formatarMoedaDigitado(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return '';
  return (Number(digitos) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata um número/string numérica já existente (ex.: vindo do banco) pra exibição. */
export function formatarMoeda(valor: string | number | null | undefined): string {
  if (valor === '' || valor == null) return '';
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Extrai o valor numérico puro ("1234.56") de um texto formatado como moeda, pra gravar no banco. */
export function paraNumeroMoeda(valorFormatado: string): string {
  const digitos = valorFormatado.replace(/\D/g, '');
  if (!digitos) return '';
  return (Number(digitos) / 100).toFixed(2);
}
