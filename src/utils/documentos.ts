/** Máscara e validação de CPF/CNPJ (formulário de Cadastro Geral). */

export function formatarCPF(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  const partes = [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9), digitos.slice(9, 11)];
  let resultado = partes[0];
  if (partes[1]) resultado += '.' + partes[1];
  if (partes[2]) resultado += '.' + partes[2];
  if (partes[3]) resultado += '-' + partes[3];
  return resultado;
}

/** Algoritmo clássico de dígito verificador do CPF. */
export function cpfValido(valor: string): boolean {
  const cpf = valor.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDV = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const dv1 = calcularDV(cpf.slice(0, 9), 10);
  const dv2 = calcularDV(cpf.slice(0, 9) + dv1, 11);
  return cpf === cpf.slice(0, 9) + String(dv1) + String(dv2);
}

/**
 * CNPJ alfanumérico (padrão Receita Federal vigente desde 2026): os 12 primeiros
 * caracteres podem ser dígitos ou letras maiúsculas, os 2 dígitos verificadores
 * continuam sempre numéricos.
 */
export function formatarCNPJ(valor: string): string {
  const limpo = valor.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
  const partes = [limpo.slice(0, 2), limpo.slice(2, 5), limpo.slice(5, 8), limpo.slice(8, 12), limpo.slice(12, 14)];
  let resultado = partes[0];
  if (partes[1]) resultado += '.' + partes[1];
  if (partes[2]) resultado += '.' + partes[2];
  if (partes[3]) resultado += '/' + partes[3];
  if (partes[4]) resultado += '-' + partes[4];
  return resultado;
}

const PESOS_CNPJ_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** 'ord(c) - 48': dígitos '0'-'9' viram 0-9, letras 'A'-'Z' viram 17-42 (regra oficial). */
function valorCaractereCNPJ(c: string): number {
  return c.charCodeAt(0) - 48;
}

export function cnpjValido(valor: string): boolean {
  const limpo = valor.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (limpo.length !== 14 || /^(.)\1{13}$/.test(limpo)) return false;

  const base = limpo.slice(0, 12);
  const dvInformado = limpo.slice(12, 14);
  if (!/^\d{2}$/.test(dvInformado)) return false;

  const calcularDV = (chars: string, pesos: number[]): number => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += valorCaractereCNPJ(chars[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calcularDV(base, PESOS_CNPJ_DV1);
  const dv2 = calcularDV(base + String(dv1), PESOS_CNPJ_DV2);
  return dvInformado === `${dv1}${dv2}`;
}
