/** Máscara de telefone/celular brasileiro: (XX) XXXX-XXXX ou (XX) XXXXX-XXXX. */
export function formatarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length === 0) return '';
  if (digitos.length <= 2) return `(${digitos}`;

  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  const tamanhoLocal = digitos.length > 10 ? 5 : 4;
  const parte1 = numero.slice(0, tamanhoLocal);
  const parte2 = numero.slice(tamanhoLocal);

  return parte2 ? `(${ddd}) ${parte1}-${parte2}` : `(${ddd}) ${parte1}`;
}
