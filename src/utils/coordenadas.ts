/** Porta de getDms (definicoes.js). */
export function paraGrauMinutoSegundo(valor: number): string {
  const val = Math.abs(valor);
  const grau = Math.floor(val);
  const minuto = Math.floor((val - grau) * 60);
  const segundo = Math.round((val - grau - minuto / 60) * 3600 * 1000) / 1000;
  return `${grau}° ${minuto}' ${segundo}" `;
}

/** Porta de ddToDms (definicoes.js). */
export function paraCoordenadasGrau(lat: number, lng: number): { latitude: string; longitude: string } {
  return {
    latitude: (lat >= 0 ? 'N => ' : 'S => ') + paraGrauMinutoSegundo(lat),
    longitude: (lng >= 0 ? 'L => ' : 'O => ') + paraGrauMinutoSegundo(lng),
  };
}
