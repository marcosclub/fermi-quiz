/* Fermi Quiz · reto en el navegador. Sin dependencias, sin peticiones externas. */

/* ===================================================================
   NÚCLEO PURO (calendario, puntuación, números). Se carga también en Node.
   =================================================================== */
const Core = (function () {
  const TZ = 'Europe/Madrid';
  const DAY_MS = 86400000;

  /* ---- Calendario (port de RetoCalendar.swift). Los días son enteros: días desde 1970-01-01. ---- */

  /** "2026-10-05" -> nº de día; null si la fecha no existe. */
  function dayFromString(text) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(text).trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = Date.UTC(y, mo - 1, d);
    const c = new Date(t);
    if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return null;
    return t / DAY_MS;
  }

  function dayToString(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
  }

  /** Día natural en Europe/Madrid de un instante (nunca la zona del visitante). */
  function madridDay(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = (t) => +parts.find((p) => p.type === t).value;
    return Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS;
  }

  /** "lunes, 16 de noviembre" */
  function dayLabel(day, lg) {
    if (lg === 'en') {
      // "Monday, November 16"
      return new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric'
      }).format(new Date(day * DAY_MS));
    }
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long'
    }).format(new Date(day * DAY_MS));
  }

  /** data: { fechaInicio, reanudacion?: {numero, fecha}, retos: [...] } -> calendario o null. */
  function makeCalendar(data) {
    const retoCount = data && data.retos ? data.retos.length : 0;
    const start = data ? dayFromString(data.fechaInicio) : null;
    if (retoCount <= 0 || start === null) return null;
    let reanudacion = null;
    if (data.reanudacion) {
      const r = data.reanudacion;
      const resume = dayFromString(r.fecha);
      // La reanudación nunca adelanta un reto respecto a su fecha natural.
      if (!(r.numero >= 2) || resume === null || resume < start + (r.numero - 1)) return null;
      reanudacion = { numero: r.numero, start: resume };
    }
    return { start, retoCount, reanudacion };
  }

  function dayIndex(cal, day) { return day - cal.start; }

  /** Nº de reto publicado ese día (puede superar retoCount); null si no ha empezado o es pausa. */
  function numero(cal, day) {
    const idx = dayIndex(cal, day);
    if (idx < 0) return null;
    const r = cal.reanudacion;
    if (!r) return idx + 1;
    const since = day - r.start;
    if (since >= 0) return r.numero + since;
    return idx + 1 < r.numero ? idx + 1 : null;
  }

  /** Último reto ya publicado ese día (también en pausa); null antes del inicio. */
  function ultimoNumero(cal, day) {
    const n = numero(cal, day);
    if (n !== null) return n;
    if (dayIndex(cal, day) < 0 || !cal.reanudacion) return null;
    return cal.reanudacion.numero - 1;
  }

  /** Día en que se publica el reto n. */
  function fechaDeNumero(cal, n) {
    const r = cal.reanudacion;
    if (r && n >= r.numero) return r.start + (n - r.numero);
    return cal.start + (n - 1);
  }

  /** En la web no se repite contenido: más allá del último reto de la colección no hay reto. */
  function publicado(cal, day) {
    const n = numero(cal, day);
    return n !== null && n <= cal.retoCount ? n : null;
  }

  function ultimoPublicado(cal, day) {
    const n = ultimoNumero(cal, day);
    if (n === null) return null;
    return Math.min(n, cal.retoCount);
  }

  /** Estado del día: { kind: 'reto'|'pausa'|'fin'|'antes', numero, ultimo, vuelve (día|null) } */
  function estado(cal, day) {
    const ultimo = ultimoPublicado(cal, day);
    const n = publicado(cal, day);
    if (n !== null) return { kind: 'reto', numero: n, ultimo, vuelve: null };
    if (dayIndex(cal, day) < 0) return { kind: 'antes', numero: null, ultimo: null, vuelve: cal.start };
    const raw = numero(cal, day);
    if (raw !== null && raw > cal.retoCount) return { kind: 'fin', numero: null, ultimo, vuelve: null };
    // Pausa: vuelve en la fecha de reanudación.
    return { kind: 'pausa', numero: null, ultimo, vuelve: cal.reanudacion ? cal.reanudacion.start : null };
  }

  /* ---- Puntuación (Scoring.swift) ---- */
  const UMBRAL_CLAVADO = 1.05;

  function multiple(guess, answer) {
    if (!(guess > 0) || !(answer > 0)) return Infinity;
    return Math.max(guess / answer, answer / guess);
  }

  function veredicto(guess, answer) {
    if (multiple(guess, answer) <= UMBRAL_CLAVADO) return 'clavado';
    return guess > answer ? 'pasado' : 'corto';
  }

  function geometricMean(values) {
    if (!values.length) return Infinity;
    return Math.exp(values.reduce((a, v) => a + Math.log(v), 0) / values.length);
  }

  /** 'verde' (<=1,5) | 'amarillo' (<=3) | 'rojo' */
  function nivel(m) {
    if (m <= 1.5) return 'verde';
    if (m <= 3) return 'amarillo';
    return 'rojo';
  }

  function emoji(m) {
    return { verde: '🟩', amarillo: '🟨', rojo: '🟥' }[nivel(m)];
  }

  /* ---- Formato (Fmt) ---- */
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  const SCI_THRESHOLD = 1e15;

  /** Separadores por idioma (es: 1.234,5 · en: 1,234.5). Sin idioma = español. */
  const LOC = { es: { group: '.', dec: ',' }, en: { group: ',', dec: '.' } };
  const loc = (lg) => LOC[lg] || LOC.es;

  function groupInteger(digits, lg) {
    const sep = loc(lg).group;
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += sep;
      out += digits[i];
    }
    return out;
  }

  /** Sin miles, separador decimal del idioma, ceros finales recortados. */
  function raw(value, maxFraction, lg) {
    if (!Number.isFinite(value)) return '0';
    let s = Math.abs(value).toFixed(maxFraction);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    s = s.replace('.', loc(lg).dec);
    return (value < 0 && s !== '0' ? '-' : '') + s;
  }

  function groupRaw(text, lg) {
    let sign = '', body = text;
    if (body.startsWith('-')) { sign = '-'; body = body.slice(1); }
    const i = body.indexOf(loc(lg).dec);
    if (i < 0) return sign + groupInteger(body, lg);
    return sign + groupInteger(body.slice(0, i), lg) + body.slice(i);
  }

  function decimal(value, maxFraction, lg) { return groupRaw(raw(value, maxFraction, lg), lg); }

  function fixed(value, fraction, lg) {
    if (!Number.isFinite(value)) return '—';
    const [i, f] = Math.abs(value).toFixed(fraction).split('.');
    return (value < 0 ? '-' : '') + groupInteger(i, lg) + (f !== undefined ? loc(lg).dec + f : '');
  }

  function superscript(text) {
    return String(text).split('').map((c) => SUP[c] || c).join('');
  }

  /** 4,35e17 -> "4,35 × 10¹⁷" (en: "4.35 × 10¹⁷") */
  function scientific(value, maxFraction, lg) {
    if (maxFraction === undefined) maxFraction = 3;
    if (!Number.isFinite(value) || value === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(value)));
    let m = Math.abs(value) / Math.pow(10, e);
    if (m >= 10) { m /= 10; e += 1; } else if (m < 1) { m *= 10; e -= 1; }
    let text = raw(m, maxFraction, lg);
    if (text === '10') { text = '1'; e += 1; }
    return (value < 0 ? '-' : '') + text + ' × 10' + superscript(e);
  }

  /** Número "natural" de una respuesta: ~4 cifras significativas. */
  function number(value, lg) {
    const a = Math.abs(value);
    if (!(a > 0) || !Number.isFinite(value)) return '0';
    if (a >= SCI_THRESHOLD) return scientific(value, undefined, lg);
    const digits = Math.max(0, Math.min(8, 3 - Math.floor(Math.log10(a))));
    return decimal(value, digits, lg);
  }

  /** "2,4×", "1.234×", "(1,2 × 10⁷)×" (en: "2.4×", "1,234×") */
  function fmtMultiple(m, lg) {
    if (!Number.isFinite(m)) return '—';
    if (m >= 1e6) return '(' + scientific(m, 1, lg) + ')×';
    return (m < 100 ? fixed(m, 1, lg) : decimal(m, 0, lg)) + '×';
  }

  function pistas(n, lg) {
    if (lg === 'en') {
      if (n <= 0) return 'No hints';
      return n === 1 ? '1 hint used' : n + ' hints used';
    }
    if (n <= 0) return 'Sin pistas';
    return n === 1 ? '1 pista usada' : n + ' pistas usadas';
  }

  /** Escala larga española: billón = 10^12. */
  const SCALES = [
    [1e3, null, 'mil'], [1e6, 'millón', 'millones'], [1e12, 'billón', 'billones'],
    [1e18, 'trillón', 'trillones'], [1e24, 'cuatrillón', 'cuatrillones'], [1e30, 'quintillón', 'quintillones']
  ];
  /** Escala corta inglesa: billion = 10^9, trillion = 10^12. */
  const SCALES_EN = [
    [1e3, 'thousand', 'thousand'], [1e6, 'million', 'million'], [1e9, 'billion', 'billion'],
    [1e12, 'trillion', 'trillion'], [1e15, 'quadrillion', 'quadrillion'], [1e18, 'quintillion', 'quintillion'],
    [1e21, 'sextillion', 'sextillion'], [1e24, 'septillion', 'septillion'], [1e27, 'octillion', 'octillion'],
    [1e30, 'nonillion', 'nonillion']
  ];

  /** "12 millones", "3.400 millones", "2,5 billones". null por debajo de 1.000. "≈ " si está redondeado. */
  function words(value, lg) {
    const en = lg === 'en';
    const scales = en ? SCALES_EN : SCALES;
    if (!Number.isFinite(value) || value < 1000) return null;
    if (value >= (en ? 1e33 : 1e36)) return '≈ ' + scientific(value, 2, lg);
    let i = 0;
    for (let k = 0; k < scales.length; k++) if (value >= scales[k][0]) i = k;
    // 999,96 mil se redondearía a "1.000 mil": se sube a la escala siguiente.
    if (i + 1 < scales.length && Math.round(value / scales[i][0] * 10) / 10 >= scales[i + 1][0] / scales[i][0]) i += 1;
    const [base, singular, plural] = scales[i];
    const q = value / base;
    const text = decimal(q, 1, lg);
    const l = loc(lg);
    const exact = Math.abs(q - Number(text.split(l.group).join('').replace(l.dec, '.'))) < 1e-9 * q;
    const prefix = exact ? '' : '≈ ';
    if (text === '1') return prefix + (singular ? '1 ' + singular : plural);
    return prefix + text + ' ' + plural;
  }

  /* ---- Entrada de números ---- */

  /** Texto ("1.234,5" en es, "1,234.5" en en) aplicando 10^magnitude. Estricto: el separador de miles se ignora. */
  function parse(text, magnitude, lg) {
    const en = lg === 'en';
    let s = String(text).trim();
    s = en ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(/,/g, '.');
    if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return null;
    if (s.startsWith('.')) s = '0' + s;
    if (s.endsWith('.')) s += '0';
    const v = Number(s + 'e' + (magnitude || 0));
    return Number.isFinite(v) ? v : null;
  }

  /**
   * Lo que se escribe en el campo: como parse, salvo (solo en español) que un único punto sin coma
   * que no separa miles ("1.5", ".5", "1.2345") se lee como decimal. En inglés no hay ambigüedad.
   */
  function parseEntry(text, lg) {
    if (lg === 'en') return parse(text, 0, 'en');
    const t = String(text).trim();
    const dots = (t.match(/\./g) || []).length;
    if (dots === 1 && !t.includes(',') && !/^\d{1,3}\.\d{3}$/.test(t)) return parse(t.replace('.', ','));
    return parse(t);
  }

  /** Quita todo menos dígitos, separador de miles y un solo separador decimal. */
  function sanitize(text, lg) {
    let s = String(text).replace(/[^\d.,]/g, '');
    const dec = loc(lg).dec;
    const i = s.indexOf(dec);
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).split(dec).join('');
    return s.slice(0, 40);
  }

  /** Multiplica por 10^k desplazando la coma (exacto, sin coma flotante). Devuelve texto crudo con el decimal del idioma. */
  function shiftDecimal(text, k, lg) {
    const en = lg === 'en';
    let t = String(text).trim();
    if (t === '') t = '1';
    else if (parseEntry(t, lg) === null) return null;
    if (en) t = t.replace(/,/g, '').replace('.', ',');
    else {
      const dots = (t.match(/\./g) || []).length;
      if (dots === 1 && !t.includes(',') && !/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', ',');
      else t = t.replace(/\./g, '');
    }
    const i = t.indexOf(',');
    const intPart = i < 0 ? t : t.slice(0, i);
    const frac = i < 0 ? '' : t.slice(i + 1);
    let digits = intPart + frac;
    const pos = intPart.length + k;
    if (pos >= digits.length) digits += '0'.repeat(pos - digits.length);
    let out = digits.slice(0, pos), rest = digits.slice(pos);
    out = out.replace(/^0+(?=\d)/, '');
    if (out === '') out = '0';
    rest = rest.replace(/0+$/, '');
    return rest ? out + (en ? '.' : ',') + rest : out;
  }

  /** Puntuación como texto de URL: máximo 2 decimales, punto, sin ceros finales. */
  function urlScore(score) {
    return String(Number(score.toFixed(2)));
  }

  /** s de la URL: finito y >= 1, si no se ignora. */
  function parseRivalScore(text) {
    if (text === null || text === undefined || !/^\d+(\.\d+)?$/.test(text)) return null;
    const v = Number(text);
    return Number.isFinite(v) && v >= 1 ? v : null;
  }

  /** 'gana' | 'pierde' | 'empate' con margen del 2 %. */
  function duelo(mine, rival) {
    if (mine < rival * 0.98) return 'gana';
    if (mine > rival * 1.02) return 'pierde';
    return 'empate';
  }

  return {
    dayFromString, dayToString, madridDay, dayLabel, makeCalendar, numero, ultimoNumero,
    fechaDeNumero, publicado, ultimoPublicado, estado,
    multiple, veredicto, geometricMean, nivel, emoji,
    groupInteger, raw, groupRaw, decimal, fixed, superscript, scientific, number, fmtMultiple,
    pistas, words, parse, parseEntry, sanitize, shiftDecimal, urlScore, parseRivalScore, duelo
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Core;

/* ===================================================================
   INTERFAZ
   =================================================================== */
if (typeof document !== 'undefined') (function () {
  const SITE = 'https://fermi.getmindmap.com/reto/';
  const APP_STORE = 'https://apps.apple.com/app/id6822024681';
  const MAX_VALUE = 1e30;

  /* ---- Idioma: solo por el parámetro l (l=en -> inglés; ausente u otro valor -> español). Sin autodetección. ---- */
  const params = new URLSearchParams(location.search);
  const L = params.get('l') === 'en' ? 'en' : 'es';
  const EN = L === 'en';
  const LQ = EN ? '&l=en' : '';           // sufijo para enlaces con otros parámetros
  const HOME = EN ? '../en/' : '../';

  const STR = {
    es: {
      title: 'Fermi Quiz · El reto de hoy',
      description: 'Tres preguntas, tres estimaciones. Juega el reto de Fermi Quiz en el navegador y mide cuánto te acercas.',
      ogDescription: 'Tres preguntas, tres estimaciones. ¿Cuánto te acercas a la respuesta?',
      errTitle: 'No hemos podido cargar el reto.',
      errText: 'Comprueba tu conexión e inténtalo de nuevo.',
      retry: 'Reintentar',
      unavailableTitle: 'Ese reto todavía no está disponible.',
      playToday: 'Jugar el reto de hoy',
      playLast: (n) => 'Jugar el último reto (#' + n + ')',
      newDaily: 'Cada día a las 00:00, hora de Madrid, se publica uno nuevo.',
      backOn: (d) => 'Los retos vuelven el ' + d + '.',
      tryOther: 'Prueba con otro reto.',
      beforeTitle: 'Los retos aún no han empezado.',
      beforeText: (d) => 'El primero llega el ' + d + ', a las 00:00 hora de Madrid.',
      endTitle: 'Hoy no hay reto nuevo.',
      endText: 'Has llegado al final de la colección actual. Mientras llegan más, puedes jugar el último reto publicado.',
      pauseTitle: 'Hoy no hay reto.',
      pauseBack: (d) => 'Los retos vuelven el ' + d + ', a las 00:00 hora de Madrid. Mientras tanto, puedes jugar el último publicado.',
      pauseNoDate: 'Mientras tanto, puedes jugar el último reto publicado.',
      homeAria: 'Fermi Quiz, inicio',
      meta: (n, d) => 'Reto #' + n + ' · ' + d,
      progress: 'Progreso',
      qAria: (i, done) => 'Pregunta ' + (i + 1) + (done ? ' respondida' : ''),
      qOf: (i) => 'Pregunta ' + (i + 1) + ' de 3',
      tooBig: 'Es demasiado grande. El máximo es 10³⁰.',
      digitsOnly: 'Escribe solo cifras. Usa la coma para los decimales.',
      positive: 'Tiene que ser mayor que cero.',
      readsAs: (t) => 'Se lee como ' + t,
      chips: [['× mil', 3], ['× millón', 6], ['× mil millones', 9]],
      chipAria: { 3: 'Multiplicar por mil', 6: 'Multiplicar por un millón', 9: 'Multiplicar por mil millones' },
      clear: 'Borrar',
      hint: (k) => 'Pista ' + k,
      submit: 'Responder',
      guessLabel: (u) => 'Tu estimación, en ' + u,
      challengedPre: 'Te han retado. A batir: ',
      verdict: { clavado: 'Clavado', pasado: 'Te has pasado', corto: 'Te has quedado corto' },
      seeResult: 'Ver resultado',
      nextQ: 'Siguiente pregunta',
      revealTitle: (i) => 'Resultado de la pregunta ' + (i + 1),
      yourGuess: 'Tu estimación',
      answer: 'Respuesta',
      how: 'Cómo se razona',
      fun: 'Curiosidad',
      source: 'Fuente',
      tomorrow: 'El reto de mañana llega a las 00:00, hora de Madrid.',
      moreInApp: 'Hay más retos en el archivo de la app.',
      copied: 'Copiado. Pégalo donde quieras.',
      copyFailed: 'No hemos podido copiarlo. Cópialo a mano:',
      shareBoxLabel: 'Texto para compartir',
      canYouBeat: '¿Me ganas? ',
      winLine: 'Has ganado.', loseLine: 'Esta vez gana tu rival.', tieLine: 'Empate técnico.',
      you: 'Tú', rival: 'Tu rival',
      resultTitle: (n) => 'Resultado del reto ' + n,
      yourScore: 'Tu nota',
      squaresAria: (parts) => 'Resultado: ' + parts.join(', '),
      levels: { verde: 'bien', amarillo: 'regular', rojo: 'lejos' },
      geoMean: ' · Media geométrica de tus tres errores',
      challengeFriend: 'Retar a un amigo',
      getApp: 'Descargar Fermi Quiz para iPhone',
      appLine: 'Racha, archivo, estadísticas y avisos. Gratis y sin anuncios.',
      openApp: 'Abrir en la app'
    },
    en: {
      title: 'Fermi Quiz · Today’s challenge',
      description: 'Three questions, three estimates. Play the Fermi Quiz challenge in your browser and see how close you get.',
      ogDescription: 'Three questions, three estimates. How close can you get?',
      errTitle: 'We couldn’t load the challenge.',
      errText: 'Check your connection and try again.',
      retry: 'Try again',
      unavailableTitle: 'That challenge isn’t available yet.',
      playToday: 'Play today’s challenge',
      playLast: (n) => 'Play the latest challenge (#' + n + ')',
      newDaily: 'A new one is published every day at midnight Madrid time (CET).',
      backOn: (d) => 'Challenges are back on ' + d + '.',
      tryOther: 'Try another challenge.',
      beforeTitle: 'Challenges haven’t started yet.',
      beforeText: (d) => 'The first challenge arrives on ' + d + ', at midnight Madrid time (CET).',
      endTitle: 'No new challenge today.',
      endText: 'You’ve reached the end of the current collection. Until more arrive, you can play the latest published challenge.',
      pauseTitle: 'No challenge today.',
      pauseBack: (d) => 'Challenges are back on ' + d + ', at midnight Madrid time (CET). Meanwhile, you can play the latest one.',
      pauseNoDate: 'Meanwhile, you can play the latest published challenge.',
      homeAria: 'Fermi Quiz, home',
      meta: (n, d) => 'Challenge #' + n + ' · ' + d,
      progress: 'Progress',
      qAria: (i, done) => 'Question ' + (i + 1) + (done ? ' answered' : ''),
      qOf: (i) => 'Question ' + (i + 1) + ' of 3',
      tooBig: 'That’s too big. The maximum is 10³⁰.',
      digitsOnly: 'Use digits only. Use a point for decimals.',
      positive: 'It has to be greater than zero.',
      readsAs: (t) => 'Reads as ' + t,
      chips: [['× thousand', 3], ['× million', 6], ['× billion', 9]],
      chipAria: { 3: 'Multiply by a thousand', 6: 'Multiply by a million', 9: 'Multiply by a billion' },
      clear: 'Clear',
      hint: (k) => 'Hint ' + k,
      submit: 'Submit answer',
      guessLabel: (u) => 'Your estimate, in ' + u,
      challengedPre: 'You’ve been challenged. To beat: ',
      verdict: { clavado: 'Spot on', pasado: 'Too high', corto: 'Too low' },
      seeResult: 'See result',
      nextQ: 'Next question',
      revealTitle: (i) => 'Result of question ' + (i + 1),
      yourGuess: 'Your estimate',
      answer: 'Answer',
      how: 'How to get there',
      fun: 'Fun fact',
      source: 'Source',
      tomorrow: 'Tomorrow’s challenge arrives at midnight Madrid time (CET).',
      moreInApp: 'There are more challenges in the app’s archive.',
      copied: 'Copied. Paste it anywhere.',
      copyFailed: 'We couldn’t copy it. Copy it by hand:',
      shareBoxLabel: 'Text to share',
      canYouBeat: 'Can you beat me? ',
      winLine: 'You win.', loseLine: 'Your rival wins this one.', tieLine: 'Too close to call.',
      you: 'You', rival: 'Your rival',
      resultTitle: (n) => 'Challenge ' + n + ' result',
      yourScore: 'Your score',
      squaresAria: (parts) => 'Result: ' + parts.join(', '),
      levels: { verde: 'good', amarillo: 'fair', rojo: 'far off' },
      geoMean: ' · Geometric mean of your three misses',
      challengeFriend: 'Challenge a friend',
      getApp: 'Get Fermi Quiz for iPhone',
      appLine: 'Streaks, archive, stats and reminders. Free, no ads.',
      openApp: 'Open in the app'
    }
  };
  const T = STR[L];

  /* Título y descripción según el idioma (el HTML ya viene en español; el español no se toca). */
  document.documentElement.lang = L;
  if (EN) {
    document.title = T.title;
    const setMeta = (sel, v) => { const m = document.querySelector(sel); if (m) m.setAttribute('content', v); };
    setMeta('meta[name="description"]', T.description);
    setMeta('meta[property="og:title"]', T.title);
    setMeta('meta[property="og:description"]', T.ogDescription);
  }

  const dayLabel = (d) => Core.dayLabel(d, L);
  const fmtM = (m) => Core.fmtMultiple(m, L);

  /** "Hoy" en Madrid. Solo en localhost se admite ?hoy=AAAA-MM-DD para probar (depuración). */
  function todayDay() {
    const hoy = params.get('hoy');
    if (hoy && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      const d = Core.dayFromString(hoy);
      if (d !== null) return d;
    }
    return Core.madridDay(new Date());
  }

  const app = document.getElementById('app');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const SCENE_COLOR = { cream: '#F1ECE3', play: '#C54120', reveal: '#4552C8', result: '#F0C94A' };

  /* ---- Utilidades DOM ---- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function setScene(name) {
    document.body.className = 'scene-' + name;
    if (themeMeta) themeMeta.setAttribute('content', SCENE_COLOR[name]);
  }

  function show(scene, node, focusEl) {
    setScene(scene);
    app.replaceChildren(node);
    window.scrollTo(0, 0);
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  /* ---- Almacenamiento (todo en try/catch) ---- */
  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento */ }
  }
  /** Claves separadas por idioma. La española conserva su nombre original. */
  const storageKey = (n) => (EN ? 'fermiquiz.en.reto.' : 'fermiquiz.reto.') + n;

  function loadState(n) {
    const s = storageGet(storageKey(n));
    const fresh = { guesses: [], hints: [0, 0, 0], idx: 0, phase: 'play' };
    if (!s || !Array.isArray(s.guesses)) return fresh;
    const guesses = s.guesses.filter((g) => typeof g === 'number' && g > 0 && Number.isFinite(g)).slice(0, 3);
    const hints = [0, 1, 2].map((i) => {
      const v = Array.isArray(s.hints) ? s.hints[i] : 0;
      return v === 1 || v === 2 ? v : 0;
    });
    if (guesses.length >= 3) return { guesses, hints, idx: 2, phase: 'done' };
    if (s.phase === 'reveal' && guesses.length >= 1) return { guesses, hints, idx: guesses.length - 1, phase: 'reveal' };
    return { guesses, hints, idx: guesses.length, phase: 'play' };
  }

  /* ---- Pantallas de mensaje (crema) ---- */
  function messageScreen(title, text, actions) {
    const stack = h('div', { class: 'stack' });
    actions.forEach((a, i) => stack.append(h('a', { class: i === 0 ? 'btn-main' : 'btn-line', href: a.href, text: a.label })));
    const title1 = h('h1', { class: 'title', tabindex: '-1', text: title });
    const node = h('section', { class: 'scene msg' },
      h('p', { class: 'brand' }, h('a', { class: 'brand', href: HOME, style: 'text-decoration:none;color:inherit', text: 'Fermi' })),
      h('p', { class: 'eyebrow', text: 'Quiz' }),
      title1,
      h('p', { text }),
      stack);
    show('cream', node, title1);
  }

  function errorScreen() {
    const title1 = h('h1', { class: 'title', tabindex: '-1', text: T.errTitle });
    const node = h('section', { class: 'scene msg' },
      h('p', { class: 'brand' }, h('a', { class: 'brand', href: HOME, style: 'text-decoration:none;color:inherit', text: 'Fermi' })),
      h('p', { class: 'eyebrow', text: 'Quiz' }),
      title1,
      h('p', { text: T.errText }),
      h('button', { class: 'btn-main', type: 'button', onclick: () => location.reload(), text: T.retry }));
    show('cream', node, title1);
  }

  /* ---- Arranque ---- */
  const playToday = () => ({ href: EN ? './?l=en' : './', label: T.playToday });
  const playLast = (n) => ({ href: '?n=' + n + LQ, label: T.playLast(n) });

  function start(data) {
    const cal = Core.makeCalendar(data);
    if (!cal) { errorScreen(); return; }
    const today = todayDay();
    const st = Core.estado(cal, today);
    const nParam = params.get('n');

    if (nParam === null) {
      if (st.kind === 'reto') return play(data, cal, st.numero, null, today);
      return noRetoScreen(cal, st);
    }
    const n = /^\d+$/.test(nParam) ? parseInt(nParam, 10) : NaN;
    if (!(n >= 1) || st.ultimo === null || n > st.ultimo) {
      const actions = st.kind === 'reto'
        ? [playToday()]
        : st.ultimo !== null ? [playLast(st.ultimo)] : [];
      return messageScreen(T.unavailableTitle,
        st.kind === 'reto' ? T.newDaily
          : st.vuelve !== null ? T.backOn(dayLabel(st.vuelve)) : T.tryOther,
        actions);
    }
    return play(data, cal, n, Core.parseRivalScore(params.get('s')), today);
  }

  function noRetoScreen(cal, st) {
    const actions = st.ultimo !== null ? [playLast(st.ultimo)] : [];
    if (st.kind === 'antes') return messageScreen(T.beforeTitle, T.beforeText(dayLabel(st.vuelve)), actions);
    if (st.kind === 'fin') return messageScreen(T.endTitle, T.endText, actions);
    return messageScreen(T.pauseTitle, st.vuelve !== null ? T.pauseBack(dayLabel(st.vuelve)) : T.pauseNoDate, actions);
  }

  /* ---- Juego ---- */
  function play(data, cal, n, rival, today) {
    const ids = (data.retos.find((r) => r.numero === n) || data.retos[n - 1]).preguntas;
    const byId = new Map(data.preguntas.map((q) => [q.id, q]));
    const questions = ids.map((id) => byId.get(id));
    if (questions.length !== 3 || questions.some((q) => !q)) { errorScreen(); return; }

    const key = storageKey(n);
    const state = loadState(n);
    const dateText = dayLabel(Core.fechaDeNumero(cal, n));
    const save = () => storageSet(key, state);

    const header = () => h('header', { class: 'top' },
      h('a', { class: 'mark', href: HOME, 'aria-label': T.homeAria, text: 'Fermi' }),
      h('span', { class: 'meta', text: T.meta(n, dateText) }));

    const progress = (done) => h('ol', { class: 'progress', 'aria-label': T.progress },
      ...[0, 1, 2].map((i) => h('li', { class: i < done ? 'on' : '', 'aria-label': T.qAria(i, i < done) })));

    function render() {
      if (state.phase === 'done') return renderResult();
      if (state.phase === 'reveal') return renderReveal();
      return renderQuestion();
    }

    /* -- Pregunta -- */
    function renderQuestion() {
      const i = state.idx, q = questions[i];
      const input = h('input', {
        id: 'guess', type: 'text', inputmode: 'decimal', autocomplete: 'off', autocapitalize: 'off',
        spellcheck: 'false', placeholder: '0', enterkeyhint: 'done', 'aria-describedby': 'echo'
      });
      const echo = h('p', { class: 'echo', id: 'echo', 'aria-live': 'polite' });
      const submit = h('button', { class: 'btn-main', type: 'submit', disabled: true, text: T.submit });

      const currentValue = () => Core.parseEntry(input.value, L);
      const refresh = () => {
        const v = currentValue();
        const empty = input.value.trim() === '';
        const tooBig = v !== null && v > MAX_VALUE;
        echo.classList.toggle('warn', tooBig);
        if (tooBig) echo.textContent = T.tooBig;
        else if (empty) echo.textContent = '';
        else if (v === null) echo.textContent = T.digitsOnly;
        else if (v <= 0) echo.textContent = T.positive;
        else {
          const w = Core.words(v, L);
          if (w) echo.textContent = w;
          else if (!EN && input.value.includes('.') && !/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(input.value.trim())) echo.textContent = T.readsAs(Core.decimal(v, 6, L));
          else echo.textContent = '';
        }
        submit.disabled = !(v !== null && Number.isFinite(v) && v > 0 && v <= MAX_VALUE);
      };

      input.addEventListener('input', () => {
        const clean = Core.sanitize(input.value, L);
        if (clean !== input.value) input.value = clean;
        refresh();
      });
      input.addEventListener('blur', () => {
        const v = currentValue();
        if (v !== null && v > 0 && v <= MAX_VALUE && v < 1e15) {
          const shifted = Core.shiftDecimal(input.value, 0, L);
          if (shifted !== null) { input.value = Core.groupRaw(shifted, L); refresh(); }
        }
      });

      const chipButtons = T.chips.map(([label, k]) => h('button', {
        class: 'chip', type: 'button', text: label,
        'aria-label': T.chipAria[k],
        onclick: () => {
          const shifted = Core.shiftDecimal(input.value, k, L);
          if (shifted === null) return;
          const v = Core.parse(shifted, 0, EN ? 'en' : 'es');
          if (v === null || v > MAX_VALUE) { echo.classList.add('warn'); echo.textContent = T.tooBig; return; }
          input.value = Core.groupRaw(shifted, L);
          refresh();
          input.focus();
        }
      }));
      const clear = h('button', {
        class: 'chip ghost', type: 'button', text: T.clear,
        onclick: () => { input.value = ''; refresh(); input.focus(); }
      });

      /* Pistas */
      const hintsBox = h('div', { class: 'hints' });
      const buildHints = () => {
        hintsBox.replaceChildren();
        for (let k = 0; k < state.hints[i]; k++) {
          hintsBox.append(h('div', { class: 'hint' }, h('b', { text: T.hint(k + 1) }), h('span', { text: q.pistas[k] })));
        }
        if (state.hints[i] < 2) {
          hintsBox.append(h('button', {
            class: 'hint-btn', type: 'button', text: T.hint(state.hints[i] + 1),
            onclick: () => { state.hints[i] += 1; save(); buildHints(); const last = hintsBox.querySelector('.hint:last-of-type'); if (last) last.setAttribute('tabindex', '-1'); }
          }));
        }
      };
      buildHints();

      const form = h('form', {
        class: 'entry', novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          const v = currentValue();
          if (!(v !== null && v > 0 && v <= MAX_VALUE)) return;
          state.guesses[i] = v;
          state.phase = 'reveal';
          save();
          render();
        }
      },
        h('label', { class: 'sr-only', for: 'guess', text: T.guessLabel(q.unidad) }),
        h('div', { class: 'field' }, input),
        h('p', { class: 'unit', text: q.unidad }),
        echo,
        h('div', { class: 'chips' }, ...chipButtons, clear),
        submit);

      const title = h('h1', { class: 'question', tabindex: '-1', text: q.pregunta });
      const node = h('section', { class: 'scene', 'aria-label': T.qOf(i) },
        header(),
        progress(i),
        i === 0 && state.guesses.length === 0 && rival !== null
          ? h('p', { class: 'banner' }, T.challengedPre, h('b', { text: fmtM(rival) })) : null,
        h('p', { class: 'eyebrow', text: T.qOf(i) + ' · ' + q.categoria }),
        title,
        form,
        hintsBox);
      show('play', node);
      input.focus({ preventScroll: true });
    }

    /* -- Revelación -- */
    function renderReveal() {
      const i = state.idx, q = questions[i], g = state.guesses[i];
      const m = Core.multiple(g, q.respuesta);
      const v = Core.veredicto(g, q.respuesta);
      const verdict = T.verdict[v];
      const last = i === 2;
      const title = h('h1', { class: 'sr-only', tabindex: '-1', text: T.revealTitle(i) });
      const next = h('button', {
        class: 'btn-main', type: 'button', text: last ? T.seeResult : T.nextQ,
        onclick: () => {
          if (last) { state.phase = 'done'; } else { state.idx = i + 1; state.phase = 'play'; }
          save(); render();
        }
      });
      const node = h('section', { class: 'scene', 'aria-live': 'polite' },
        header(),
        progress(i + 1),
        title,
        h('p', { class: 'eyebrow', text: T.qOf(i) + ' · ' + q.categoria }),
        h('p', { class: 'big', text: fmtM(m) }),
        h('p', { class: 'verdict', text: verdict }),
        h('div', { class: 'card' },
          h('div', { class: 'pair' },
            h('div', null, h('p', { class: 'k', text: T.yourGuess }), h('p', { class: 'v', text: Core.number(g, L) }), h('p', { class: 'u', text: q.unidad })),
            h('div', null, h('p', { class: 'k', text: T.answer }), h('p', { class: 'v', text: Core.number(q.respuesta, L) }), h('p', { class: 'u', text: q.unidad }))),
          h('h2', { text: T.how }), h('p', { text: q.explicacion }),
          q.curiosidad ? h('h2', { text: T.fun }) : null, q.curiosidad ? h('p', { text: q.curiosidad }) : null,
          q.fuente ? h('h2', { text: T.source }) : null, q.fuente ? h('p', { class: 'src', text: q.fuente }) : null),
        h('div', { class: 'sticky' }, next));
      show('reveal', node, title);
    }

    /* -- Resultado -- */
    /** Qué viene después: mañana, la fecha de vuelta tras una pausa, o nada si la colección terminó. */
    function nextNote() {
      const hoy = today;
      if (Core.publicado(cal, hoy + 1) !== null) return T.tomorrow;
      const st = Core.estado(cal, hoy + 1);
      if (st.kind === 'pausa' && st.vuelve !== null) return T.backOn(dayLabel(st.vuelve));
      return T.moreInApp;
    }

    function renderResult() {
      const ms = questions.map((q, i) => Core.multiple(state.guesses[i], q.respuesta));
      const score = Core.geometricMean(ms);
      const hints = state.hints.reduce((a, b) => a + b, 0);
      const squares = ms.map(Core.emoji).join('');
      const shareUrl = SITE + '?n=' + n + '&s=' + Core.urlScore(score) + LQ;
      const shareText = 'Fermi Quiz #' + n + ' — ' + fmtM(score) + '\n' + squares + (hints > 0 ? ' 💡' + hints : '') + '\n' + T.canYouBeat + shareUrl;
      const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
      let copyBox = null;

      const share = async () => {
        status.textContent = '';
        if (navigator.share) {
          try { await navigator.share({ text: shareText }); return; }
          catch (e) { if (e && e.name === 'AbortError') return; }
        }
        let ok = false;
        try { await navigator.clipboard.writeText(shareText); ok = true; } catch (e) { /* prueba el plan B */ }
        if (!ok) {
          try {
            const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0' });
            ta.value = shareText; document.body.append(ta); ta.select();
            ok = document.execCommand('copy'); ta.remove();
          } catch (e) { ok = false; }
        }
        if (ok) { status.textContent = T.copied; return; }
        status.textContent = T.copyFailed;
        if (!copyBox) {
          copyBox = h('textarea', { class: 'copybox', readonly: true, rows: '4', 'aria-label': T.shareBoxLabel });
          copyBox.value = shareText;
          status.after(copyBox);
        }
        copyBox.focus(); copyBox.select();
      };

      let duel = null;
      if (rival !== null) {
        const d = Core.duelo(score, rival);
        const line = d === 'gana' ? T.winLine : d === 'pierde' ? T.loseLine : T.tieLine;
        duel = h('div', { class: 'card' },
          h('div', { class: 'h2h' },
            h('div', { class: d === 'gana' ? 'win' : '' }, h('p', { class: 'k', text: T.you }), h('p', { class: 'v', text: fmtM(score) })),
            h('div', { class: d === 'pierde' ? 'win' : '' }, h('p', { class: 'k', text: T.rival }), h('p', { class: 'v', text: fmtM(rival) }))),
          h('p', { class: 'h2h-line', text: line }));
      }

      const title = h('h1', { class: 'sr-only', tabindex: '-1', text: T.resultTitle(n) });
      const node = h('section', { class: 'scene' },
        header(),
        title,
        h('p', { class: 'eyebrow', text: T.yourScore }),
        h('p', { class: 'score', text: fmtM(score) }),
        h('p', { class: 'squares', 'aria-label': T.squaresAria(ms.map((m) => T.levels[Core.nivel(m)])), text: squares }),
        h('p', { class: 'sub', text: Core.pistas(hints, L) + T.geoMean }),
        duel,
        h('div', { class: 'card' },
          h('ul', { class: 'rows' }, ...questions.map((q, i) => h('li', null,
            h('span', { class: 'q', text: q.pregunta }),
            h('span', { class: 'm ' + { verde: 'good', amarillo: 'ok', rojo: 'off' }[Core.nivel(ms[i])], text: fmtM(ms[i]) }))))),
        h('button', { class: 'btn-line', type: 'button', onclick: share, text: T.challengeFriend }),
        status,
        h('div', { class: 'cta' },
          h('a', { class: 'btn-main', href: APP_STORE, rel: 'noopener', text: T.getApp }),
          h('p', { class: 'line', text: T.appLine }),
          h('a', { class: 'btn-line', href: 'fermiquiz://reto?n=' + n + '&s=' + Core.urlScore(score) + LQ, text: T.openApp })),
        h('p', { class: 'note', text: nextNote() }));
      show('result', node, title);
    }

    render();
  }

  /* ---- Carga de datos ---- */
  setScene('cream');
  app.replaceChildren(h('section', { class: 'scene msg', 'aria-busy': 'true' }, h('p', { class: 'brand', text: 'Fermi' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton', style: 'width:40%' })));
  fetch(EN ? 'retos_en.json' : 'retos.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(start)
    .catch(errorScreen);
})();
