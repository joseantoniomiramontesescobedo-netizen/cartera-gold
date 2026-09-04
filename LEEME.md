# Cartera Gold — instalación en celular

Esta app ya está lista para instalarse como app en el celular (PWA). Los
datos se guardan directamente en el teléfono (localStorage), no dependen de
Claude ni de internet una vez cargada la primera vez.

## Paso 1 — Subir la app a internet (una sola vez, gratis)

Necesitas una URL pública para poder instalarla en el celular. La forma más
fácil sin usar la terminal:

1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta **`dist`** completa (la que está dentro de este
   paquete) a esa página.
3. Netlify te da un link tipo `https://algo-al-azar.netlify.app`. Ese es el
   link de tu app. (Puedes crear una cuenta gratis después para ponerle un
   nombre fijo y no perder el link.)

Alternativas equivalentes: Vercel, GitHub Pages, o cualquier hosting de
archivos estáticos — solo hay que subir el contenido de `dist/`.

## Paso 2 — Instalar en el celular

**Android (Chrome):**
1. Abre el link desde Chrome en el celular.
2. Toca el menú (⋮) → "Instalar app" o "Agregar a pantalla de inicio".
3. Queda como app normal, con ícono, sin barra del navegador.

**iPhone (Safari):**
1. Abre el link desde Safari (tiene que ser Safari, no Chrome).
2. Toca el botón de compartir (el cuadrito con la flecha hacia arriba).
3. Elige "Agregar a pantalla de inicio".

Listo — se abre en pantalla completa como cualquier app.

## Notas importantes

- **Los datos quedan guardados en ese celular/navegador específico.** Si la
  desinstalas o borras datos del navegador, se pierde la información. Si
  quieres respaldo o que varios celulares vean la misma cartera, eso ya
  requiere un servidor/base de datos real — se puede hacer, pero es un paso
  aparte.
- Si luego quieres actualizar la app (nuevos cambios que pidas), solo hay
  que repetir el Paso 1 subiendo la nueva carpeta `dist` al mismo hosting;
  el celular se actualiza solo la siguiente vez que la abras con internet.

## Novedades de esta versión (v4)

- **Sugerencias al recibir un préstamo**: si el nombre del cliente no
  coincide exacto con uno que ya tienes (le faltó un acento, un apellido, se
  escribió distinto), la pantalla de importación te sugiere con cuál de tus
  clientes ya registrados podría tratarse, y puedes elegir "es esta misma
  persona" o "es alguien nuevo" — así no se te llena la cartera de clientes
  duplicados. También hay un selector para buscar manualmente entre todos
  tus clientes si la sugerencia no es correcta.
- **Reenviar un préstamo ya importado ahora lo actualiza, no lo duplica**:
  si el prestador principal y el auxiliar cada uno registra pagos por su
  lado y luego se vuelven a compartir el mismo préstamo, la app junta el
  historial de pagos de ambos celulares (sin repetir ninguno) y dejas al
  día el saldo, la fecha de próximo pago y las comisiones del auxiliar.
- El nombre de quien te envía el préstamo también se reconcilia
  automáticamente: si ya tenías guardado ese mismo teléfono con otro
  nombre (por variantes de escritura), se usa el nombre que ya conocías.

## Novedades de la versión anterior (v3)

- **El link de traslado ya no se corta**: antes iba como `?compartir=...`, y
  WhatsApp cortaba el link clicable justo en el signo `=`. Ahora va como
  `.../t/XXXXX` (como parte de la dirección, sin `?`, `#` ni `=` en ningún
  lado), así que viaja completo. **Importante**: para que esta ruta funcione
  en Netlify hace falta el archivo `public/_redirects` que ya viene incluido
  en este zip — al subir la carpeta `dist` a Netlify Drop, asegúrate de que
  el archivo `_redirects` (sin extensión) quede también ahí adentro.
- **Link más corto**: los datos ahora se guardan con claves cortas antes de
  codificarse, así que para el mismo préstamo el link pesa bastante menos
  que antes.
- **Designar tu rol al dar de alta un préstamo**: en el formulario de nuevo
  préstamo hay un botón "Soy el prestador principal" / "Soy el auxiliar de
  otra persona". Si eliges que tú eres el auxiliar, en vez de pedirte los
  datos de un auxiliar, te pide los datos del prestador principal (para
  poder mandárselo después).
- **Ya no vuelve a pedir tus datos al compartir**: la primera vez que envías
  un préstamo por WhatsApp, tu nombre y teléfono quedan guardados en el
  celular. La próxima vez que compartas, si además el préstamo ya trae
  definido el rol (porque tú te marcaste como auxiliar al crearlo, o porque
  ya tiene un auxiliar designado), la app arma todo solo y solo falta tocar
  "Enviar por WhatsApp".

## Novedades de la versión anterior (v2)

- **Eliminar cliente y sus préstamos**: ya existía, está en la ficha del
  cliente ("Eliminar cliente y sus préstamos").
- **Borrar varios préstamos a la vez**: en la ficha del cliente, botón
  "Seleccionar" arriba de la lista de préstamos → marca los que quieras →
  "Eliminar (n)".
- **Trasladar préstamos entre prestador principal y auxiliar**: en la misma
  selección, botón "Enviar (n)" → eliges si tú eres el principal o el
  auxiliar, pones tu nombre y el teléfono de quien lo va a recibir → se
  genera un link (con todos los datos codificados adentro, sin depender de
  ningún servidor) y se abre WhatsApp con el mensaje listo. Quien reciba el
  link, al abrirlo con la app instalada, ve una pantalla de confirmación y,
  si acepta, esos préstamos se agregan a su cartera con el rol contrario al
  que puso quien los envió (si se los mandó el principal, él queda como
  auxiliar, y viceversa). Los comprobantes de pago (fotos) no viajan por
  este medio, solo los montos y fechas.

## Si más adelante se quieren hacer cambios de código

- `src/App.jsx` — toda la app (el mismo archivo que ya tenías).
- `src/storage-shim.js` — reemplaza el guardado de datos de Claude por
  guardado local en el teléfono; no hay que tocarlo.
- Para volver a compilar tras un cambio: `npm install` y luego
  `npm run build`, y subir de nuevo la carpeta `dist` generada.
