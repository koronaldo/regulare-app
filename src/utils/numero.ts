/** Formata como decimal (padrão brasileiro) enquanto digita: dígitos viram casas decimais. "200" -> "2,00". */
export function formatarDecimalDigitado(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return '';
  return (Number(digitos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
