# Entrecuerdas

Entrecuerdas es una aplicación web progresiva para explorar guitarra y bajo mientras practicas o compones. Calcula notas y posiciones a partir de la afinación elegida, explica intervalos y permite guardar material musical en el dispositivo.

## Empezar

Necesitas Node.js 22.12 o posterior y npm. Desde la carpeta del proyecto:

```sh
npm install
npm run dev
```

Vite mostrará la dirección local en la que puedes abrir la aplicación. Para generar una versión de producción y servirla localmente:

```sh
npm run build
npm run preview
```

## Comprobaciones

```sh
npm test
npm run test:e2e
npm run test:offline
```

Las pruebas de navegador usan Playwright y arrancan el servidor de desarrollo en el puerto 5173. En una instalación nueva de Playwright quizá tengas que instalar sus navegadores con `npx playwright install`.

## Publicar

El proyecto incluye configuración de Wrangler para Cloudflare Workers. `npm run deploy` genera la versión de producción y la publica en el destino configurado por Wrangler. Revisa la cuenta y el destino seleccionados en Wrangler antes de publicar.

## Datos y copias de seguridad

Los ajustes, afinaciones personales, favoritos y progresiones se guardan localmente en el navegador. No hace falta crear una cuenta. Exporta una copia de seguridad desde la aplicación y guárdala en otro lugar si quieres conservar tus datos al cambiar de dispositivo, perfil del navegador o almacenamiento. Borrar los datos del sitio también puede borrar el contenido local.

## Alcance actual

La primera versión se centra en la exploración manual: mástil interactivo, guitarra y bajos de cuatro o cinco cuerdas, afinaciones, cejilla, orientación para zurdos, intervalos, acordes, escalas, progresiones y biblioteca local. Incluye un teclado musical virtual, un diccionario de 34 tipos de acordes con búsqueda, fórmulas y posiciones, y un círculo de quintas interactivo con relativas menores, armaduras y recorridos que puedes abrir en el editor de progresiones.

La entrada de audio monofónica está disponible para probar una nota cada vez. La detección de acordes por audio y de manos sobre instrumentos todavía no está implementada. La consulta de fotos reales es manual. El reconocimiento de diagramas se valida por separado y siempre requiere confirmar cuerdas al aire, silencios y traste inicial. Consulta `docs/recognition.md` para los límites y próximos criterios de evaluación.

## Organización del código

- `src/lib/music.ts` contiene las operaciones de teoría musical y posiciones.
- `src/lib/audio.ts` contiene las utilidades relacionadas con la entrada de audio.
- `src/stores/app.ts` gestiona estado, ajustes y persistencia local.
- `src/components/` reúne controles reutilizables como el mástil y los ajustes del instrumento.
- `src/views/` contiene las pantallas principales.
- `tests/` contiene las pruebas unitarias y de navegador.

La interfaz usa Vue 3, TypeScript, Vue Router y Pinia. Vite prepara la app y `vite-plugin-pwa` configura su instalación y uso sin conexión.
