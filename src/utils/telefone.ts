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

/** Só os dígitos do número, sem o zero de operadora/DDD na frente (ex.: "049 99957-9539" -> "49999579539"). */
export function somenteDigitos(numero: string): string {
  return numero.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Número no formato internacional exigido pelo WhatsApp (wa.me): DDI + DDD + número.
 * Números brasileiros com DDD (10 ou 11 dígitos) recebem o 55 na frente; se já vier com 55, mantém.
 */
export function numeroWhatsApp(numero: string): string {
  const digitos = somenteDigitos(numero);
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}
