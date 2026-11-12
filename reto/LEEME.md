# Reto en el navegador

`retos.json` y `retos_en.json` son copias de `Resources/retos.json` y
`Resources/retos_en.json` del repositorio de la app (edición española e inglesa).
Hay que volver a copiarlos siempre que cambie el contenido (preguntas, retos,
`fechaInicio` o `reanudacion`), o el calendario de la web se desajustará con el de la app.
Cada edición tiene su propia numeración y su propio `fechaInicio`.

Idioma: parámetro `l` de la URL. `?l=en` -> inglés; sin `l` (o `l=es`) -> español.
No se autodetecta desde el navegador. Los enlaces internos mantienen `l=en` en inglés.
El progreso se guarda en localStorage con claves separadas por idioma
(`fermiquiz.reto.N` en español, `fermiquiz.en.reto.N` en inglés).

Depuración: en `localhost` / `127.0.0.1`, `?hoy=AAAA-MM-DD` sustituye al «hoy» de Madrid
(por ejemplo `reto/?l=en&hoy=2026-11-17`). En el dominio publicado se ignora.

Pruebas: `node reto/test.mjs`
