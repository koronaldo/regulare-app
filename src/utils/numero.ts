/** Formata como decimal (padrão brasileiro) enquanto digita: dígitos viram casas decimais. "200" -> "2,00". */
export function formatarDecimalDigitado(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return '';
  return (Number(digitos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/**
 * Formata um decimal que já existe (vindo do banco ou da importação) pra exibição no formulário:
 * 120.5 -> "120,50". Aceita tanto o formato plano do servidor ("120.5") quanto o brasileiro já
 * gravado por formatarDecimalDigitado ("1.234,56").
 */
export function formatarDecimal(valor: string | number | null | undefined): string {
  if (valor === '' || valor == null) return '';
  const texto = String(valor).trim();
  if (!texto) return '';
  const plano = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const n = Number(plano);
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
