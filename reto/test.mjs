// node reto/test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require('./reto.js');
const data = JSON.parse(readFileSync(path.join(dir, 'retos.json'), 'utf8'));
const cal = C.makeCalendar(data);
assert.ok(cal, 'calendario válido');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };
const on = (iso) => C.estado(cal, C.dayFromString(iso));

t('2026-11-03 -> reto 30', () => assert.equal(on('2026-11-03').numero, 30));
t('2026-11-12 -> sin reto, último 30, vuelve 2026-11-16', () => {
  const e = on('2026-11-12');
  assert.equal(e.kind, 'pausa'); assert.equal(e.numero, null); assert.equal(e.ultimo, 30);
  assert.equal(C.dayToString(e.vuelve), '2026-11-16');
});
t('2026-11-16 -> reto 31', () => assert.equal(on('2026-11-16').numero, 31));
t('2026-12-15 -> reto 60', () => assert.equal(on('2026-12-15').numero, 60));
t('2026-12-16 -> sin reto (fin de colección), último 60', () => {
  const e = on('2026-12-16'); assert.equal(e.kind, 'fin'); assert.equal(e.numero, null); assert.equal(e.ultimo, 60);
});
t('antes del inicio', () => assert.equal(on('2026-10-04').kind, 'antes'));
t('2026-10-05 -> reto 1', () => assert.equal(on('2026-10-05').numero, 1));
t('fecha de los retos', () => {
  assert.equal(C.dayToString(C.fechaDeNumero(cal, 30)), '2026-11-03');
  assert.equal(C.dayToString(C.fechaDeNumero(cal, 31)), '2026-11-16');
});
t('fechas inválidas', () => { assert.equal(C.dayFromString('2026-02-30'), null); assert.equal(C.dayFromString('x'), null); });
t('23:30 UTC en verano cuenta como el día siguiente en Madrid', () => {
  assert.equal(C.dayToString(C.madridDay(new Date('2026-07-15T23:30:00Z'))), '2026-07-16');
  assert.equal(C.dayToString(C.madridDay(new Date('2026-07-15T21:30:00Z'))), '2026-07-15');
  // invierno: 23:30 UTC = 00:30 Madrid
  assert.equal(C.dayToString(C.madridDay(new Date('2026-12-01T23:30:00Z'))), '2026-12-02');
  assert.equal(C.dayToString(C.madridDay(new Date('2026-12-01T22:59:00Z'))), '2026-12-01');
});
t('reanudación inválida (adelanta un reto) -> null', () => {
  assert.equal(C.makeCalendar({ fechaInicio: '2026-10-05', retos: data.retos, reanudacion: { numero: 31, fecha: '2026-11-01' } }), null);
});
t('sin reanudación: numeración continua', () => {
  const c = C.makeCalendar({ fechaInicio: '2026-10-05', retos: data.retos });
  assert.equal(C.numero(c, C.dayFromString('2026-10-10')), 6);
});

t('multiple: 50 vs 100 -> 2 (ambos sentidos)', () => {
  assert.equal(C.multiple(50, 100), 2); assert.equal(C.multiple(100, 50), 2);
  assert.equal(C.multiple(0, 5), Infinity);
});
t('media geométrica de 1,2,4 -> 2', () => assert.ok(Math.abs(C.geometricMean([1, 2, 4]) - 2) < 1e-12));
t('veredicto', () => {
  assert.equal(C.veredicto(104, 100), 'clavado'); assert.equal(C.veredicto(200, 100), 'pasado'); assert.equal(C.veredicto(50, 100), 'corto');
});
t('niveles y cuadrados', () => {
  assert.equal(C.emoji(1.5), '🟩'); assert.equal(C.emoji(1.51), '🟨'); assert.equal(C.emoji(3), '🟨'); assert.equal(C.emoji(3.01), '🟥');
});

t('parse', () => {
  assert.equal(C.parse('1.234,5'), 1234.5);
  assert.equal(C.parse('1234,5'), 1234.5);
  assert.equal(C.parse('1.234'), 1234);
  assert.equal(C.parse('2,5'), 2.5);
  assert.equal(C.parse('1234567'), 1234567);
  assert.equal(C.parse(',5'), 0.5);
  assert.equal(C.parse('3', 6), 3e6);
  assert.equal(C.parse(''), null); assert.equal(C.parse('abc'), null); assert.equal(C.parse('1e5'), null); assert.equal(C.parse('1,2,3'), null);
});
t('parseEntry: punto único decimal salvo miles', () => {
  assert.equal(C.parseEntry('1.5'), 1.5); assert.equal(C.parseEntry('1.234'), 1234); assert.equal(C.parseEntry('1.234.567'), 1234567);
  assert.equal(C.parseEntry('2,5'), 2.5);
});
t('shiftDecimal', () => {
  assert.equal(C.shiftDecimal('', 6), '1000000'); assert.equal(C.shiftDecimal('2,5', 3), '2500');
  assert.equal(C.shiftDecimal('12', 9), '12000000000'); assert.equal(C.shiftDecimal('0,0012', 3), '1,2');
  assert.equal(C.shiftDecimal('1.234', 3), '1234000'); assert.equal(C.shiftDecimal('x', 3), null);
});

t('formato de múltiplos', () => {
  assert.equal(C.fmtMultiple(2.4), '2,4×'); assert.equal(C.fmtMultiple(1), '1,0×'); assert.equal(C.fmtMultiple(99.94), '99,9×');
  assert.equal(C.fmtMultiple(100), '100×'); assert.equal(C.fmtMultiple(1234), '1.234×'); assert.equal(C.fmtMultiple(999999), '999.999×');
  assert.equal(C.fmtMultiple(1.2e7), '(1,2 × 10⁷)×'); assert.equal(C.fmtMultiple(1e6), '(1 × 10⁶)×');
});
t('formato de números y palabras', () => {
  assert.equal(C.number(26.8), '26,8'); assert.equal(C.number(68), '68'); assert.equal(C.number(1234567), '1.234.567');
  assert.equal(C.words(12e6), '12 millones'); assert.equal(C.words(3.4e9), '3.400 millones');
  assert.equal(C.words(2.5e12), '2,5 billones'); assert.equal(C.words(1e6), '1 millón'); assert.equal(C.words(1e9), '1.000 millones'); assert.equal(C.words(999960), '≈ 1 millón');
  assert.equal(C.words(999), null); assert.equal(C.words(1500), '1,5 mil'); assert.equal(C.words(1.234e6), '≈ 1,2 millones');
});
t('URL: puntuación y rival', () => {
  assert.equal(C.urlScore(2.4), '2.4'); assert.equal(C.urlScore(2), '2'); assert.equal(C.urlScore(2.456), '2.46'); assert.equal(C.urlScore(2.401), '2.4');
  assert.equal(C.parseRivalScore('2.4'), 2.4); assert.equal(C.parseRivalScore('0.5'), null); assert.equal(C.parseRivalScore('abc'), null);
  assert.equal(C.parseRivalScore('Infinity'), null); assert.equal(C.parseRivalScore(null), null); assert.equal(C.parseRivalScore('1e3'), null);
});
t('duelo con margen del 2 %', () => {
  assert.equal(C.duelo(2, 3), 'gana'); assert.equal(C.duelo(3, 2), 'pierde'); assert.equal(C.duelo(2.01, 2), 'empate'); assert.equal(C.duelo(1.95, 2), 'gana');
});
t('datos: todos los retos tienen 3 preguntas existentes', () => {
  const ids = new Set(data.preguntas.map((q) => q.id));
  for (const r of data.retos) { assert.equal(r.preguntas.length, 3); r.preguntas.forEach((id) => assert.ok(ids.has(id), id)); }
});


/* ---------- Edición inglesa ---------- */
const dataEn = JSON.parse(readFileSync(path.join(dir, 'retos_en.json'), 'utf8'));
const calEn = C.makeCalendar(dataEn);
assert.ok(calEn, 'calendario inglés válido');
const onEn = (iso) => C.estado(calEn, C.dayFromString(iso));

t('EN: calendario', () => {
  assert.equal(onEn('2026-11-15').kind, 'antes');
  assert.equal(C.dayToString(onEn('2026-11-15').vuelve), '2026-11-16');
  assert.equal(onEn('2026-11-16').numero, 1);
  assert.equal(onEn('2026-11-18').numero, 3);
  const lastDay = C.dayFromString(dataEn.fechaInicio) + dataEn.retos.length - 1;
  assert.equal(C.estado(calEn, lastDay).numero, dataEn.retos.length);
  assert.equal(C.estado(calEn, lastDay + 1).kind, 'fin');
});
t('EN: datos', () => {
  const ids = new Set(dataEn.preguntas.map((q) => q.id));
  assert.equal(dataEn.preguntas.length, dataEn.retos.length * 3);
  for (const r of dataEn.retos) { assert.equal(r.preguntas.length, 3); r.preguntas.forEach((id) => assert.ok(ids.has(id), id)); }
});
t('EN: fecha', () => assert.equal(C.dayLabel(C.dayFromString('2026-11-16'), 'en'), 'Monday, November 16'));
t('EN: formato de múltiplos', () => {
  assert.equal(C.fmtMultiple(2.4, 'en'), '2.4×'); assert.equal(C.fmtMultiple(1, 'en'), '1.0×');
  assert.equal(C.fmtMultiple(1234, 'en'), '1,234×'); assert.equal(C.fmtMultiple(999999, 'en'), '999,999×');
  assert.equal(C.fmtMultiple(1.2e7, 'en'), '(1.2 × 10⁷)×'); assert.equal(C.fmtMultiple(1e6, 'en'), '(1 × 10⁶)×');
});
t('EN: formato de números', () => {
  assert.equal(C.number(26.8, 'en'), '26.8'); assert.equal(C.number(1234567, 'en'), '1,234,567');
  assert.equal(C.decimal(1234.5, 1, 'en'), '1,234.5');
});
t('EN: palabras (escala corta)', () => {
  assert.equal(C.words(1e9, 'en'), '1 billion'); assert.equal(C.words(1e9), '1.000 millones');
  assert.equal(C.words(12e6, 'en'), '12 million'); assert.equal(C.words(3.4e9, 'en'), '3.4 billion');
  assert.equal(C.words(2.5e12, 'en'), '2.5 trillion'); assert.equal(C.words(1e6, 'en'), '1 million');
  assert.equal(C.words(1500, 'en'), '1.5 thousand'); assert.equal(C.words(1000, 'en'), '1 thousand');
  assert.equal(C.words(999, 'en'), null); assert.equal(C.words(999960, 'en'), '≈ 1 million');
  assert.equal(C.words(1.234e6, 'en'), '≈ 1.2 million'); assert.equal(C.words(3.5e14, 'en'), '350 trillion');
});
t('EN: parseo', () => {
  assert.equal(C.parseEntry('1,234.5', 'en'), 1234.5); assert.equal(C.parseEntry('2.5', 'en'), 2.5);
  assert.equal(C.parseEntry('1,234', 'en'), 1234); assert.equal(C.parseEntry('1.234', 'en'), 1.234);
  assert.equal(C.parseEntry('.5', 'en'), 0.5); assert.equal(C.parse('3', 6, 'en'), 3e6);
  assert.equal(C.parseEntry('abc', 'en'), null); assert.equal(C.parseEntry('', 'en'), null); assert.equal(C.parseEntry('1.2.3', 'en'), null);
  assert.equal(C.sanitize('1,2.3.4x', 'en'), '1,2.34');
});
t('EN: shiftDecimal', () => {
  assert.equal(C.shiftDecimal('', 9, 'en'), '1000000000'); assert.equal(C.shiftDecimal('2.5', 3, 'en'), '2500');
  assert.equal(C.shiftDecimal('1,234', 3, 'en'), '1234000'); assert.equal(C.shiftDecimal('0.0012', 3, 'en'), '1.2');
  assert.equal(C.groupRaw('1234567.5', 'en'), '1,234,567.5'); assert.equal(C.shiftDecimal('x', 3, 'en'), null);
});
t('EN: pistas', () => {
  assert.equal(C.pistas(0, 'en'), 'No hints'); assert.equal(C.pistas(1, 'en'), '1 hint used'); assert.equal(C.pistas(2, 'en'), '2 hints used');
  assert.equal(C.pistas(0), 'Sin pistas');
});
t('EN: URL de compartir con l=en', () => {
  const url = 'https://fermi.getmindmap.com/reto/?n=14&s=' + C.urlScore(2.4) + '&l=en';
  assert.equal(url, 'https://fermi.getmindmap.com/reto/?n=14&s=2.4&l=en');
});

console.log(`\n${passed} grupos de pruebas OK`);
