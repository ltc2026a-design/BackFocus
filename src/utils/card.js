// Detección de marca y validación de tarjetas (algoritmo de Luhn).
// Se comparte entre backend y la lógica de pago simulado.

export function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Devuelve la marca de la tarjeta según el prefijo/longitud. */
export function detectCardBrand(numero) {
  const d = onlyDigits(numero);
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  if (/^(6011|65|64[4-9])/.test(d)) return "discover";
  if (/^3(0[0-5]|[68])/.test(d)) return "diners";
  if (/^(35|2131|1800|00622126)/.test(d)) return "jcb";
  return "otra";
}

/** Longitud esperada por marca (para validar). */
const LENGTHS = {
  visa: [13, 16, 19],
  mastercard: [16],
  amex: [15],
  discover: [16, 19],
  diners: [14, 16],
  jcb: [16, 17, 18, 19],
  otra: [12, 13, 14, 15, 16, 17, 18, 19],
};

/** Valida el checksum de Luhn. */
export function luhnValid(numero) {
  const d = onlyDigits(numero);
  if (d.length < 12) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Tarjeta aceptada: Luhn válido y longitud coherente con la marca. */
export function isPlausibleCard(numero) {
  const d = onlyDigits(numero);
  const brand = detectCardBrand(d);
  return (LENGTHS[brand] || LENGTHS.otra).includes(d.length) && luhnValid(d);
}
