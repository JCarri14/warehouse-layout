# Warehouse Layout — editor web local

Editor y flujo operativo local de la nueva aplicación, independiente de la versión Windows existente. TypeScript, React, Vite y Three.js. Los archivos del usuario se leen y procesan en el navegador; no hay servidor de datos, cuentas, analítica ni recursos gráficos remotos.

## Ejecutar

Desde C:/Dev/optiruta/next, con Node 24:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Abrir http://127.0.0.1:5173. Para compilar: `npm run build`; para servir la compilación: `npm run preview -- --host 127.0.0.1`.

## Qué incluye

- Crear un almacén rectangular con nombre y dimensiones reales.
- Añadir estanterías con código único y colocación automática en un hueco libre.
- Editar dimensiones, posición, giros de 90°, color, alias, columnas, acceso, sentido de numeración y niveles/cotas.
- Aplicar o cancelar propiedades; impedir solapamientos y elementos fuera del suelo.
- Vistas superior e isométrica, selección desde lista o plano, zoom, desplazamiento y encuadre que considera alturas.
- Abrir un ejemplo de 15 estanterías y una muestra sintética de 200 en fixtures/representative-warehouse.json.
- Descargar y abrir archivos .optiruta.json, con formato identificado y versión 4; lectura y migración explícita de los archivos web de versiones 1, 2 y 3.
- Avisar antes de sustituir un documento o descartar propiedades pendientes. Diálogos con foco contenido y Escape para cancelar.
- Arrastrar estanterías en superior e isométrica con previsualización válida/inválida y cancelación mediante Escape o interrupción del gesto.
- Ajustar posiciones a 10 cm, 50 cm o 1 m, o trabajar sin ajuste (precisión de 1 mm).
- Duplicar, girar y eliminar con comandos reversibles; la copia tiene código e identificadores nuevos, incluidos sus niveles.
- Deshacer/rehacer hasta 100 acciones por documento, incluidas propiedades y creación. Cada arrastre se registra una sola vez al soltar; selección y navegación no generan acciones. Abrir/crear un documento reinicia su historial.
- Crear zonas de suelo con código, nombre, color, posición, dimensiones y giro. Sus nombres/códigos son únicos entre zonas; no se solapan entre ellas, pero pueden contener elementos físicos.
- Crear obstáculos rectangulares y mesas con nombre, código, color y altura real. Comparten las reglas de colisión con las estanterías y no generan ubicaciones.
- Seleccionar, arrastrar, girar, duplicar, eliminar y editar todos estos elementos, con el mismo historial y protección de cambios pendientes. En pantallas estrechas, Añadir… permite crear zona/obstáculo/mesa y el selector de elementos permite localizarlos.
- Configurar el formato de ubicaciones del almacén, previsualizar códigos por nivel y localizar una ubicación real en el plano.
- Ver cara de acceso, sentido de numeración y columnas de la estantería seleccionada; al localizar se marca también la cota del nivel.

La cuadrícula del almacén es configurable entre 0,01 y 10 m y comienza en 1 m (se dibuja espaciada en almacenes muy grandes). El ajuste sigue esa cuadrícula por defecto; se puede elegir otro paso o desactivarlo sin cambiar las medidas. También se pueden introducir posiciones exactas desde Propiedades, sin ajuste automático.

Seleccionar y mover permite arrastrar las estanterías. Mover vista, arrastrar el fondo o mantener Espacio con el plano enfocado desplaza la cámara. El botón derecho gira la cámara en isométrica. Rueda para zoom. Girar 90° conserva la esquina de posición e intercambia la huella; si no cabe, no modifica el documento. Duplicar intenta colocar la copia cerca, dejando 50 cm, y busca otros huecos si hace falta; ese margen no garantiza pasillos operativos. Una posición inválida al soltar conserva la posición anterior al gesto.

El mismo arrastre funciona para zonas, mesas y obstáculos. Una zona es una superficie independiente: moverla o eliminarla no mueve ni elimina lo que contiene. Al pulsar sobre una estantería o mesa dentro de una zona se selecciona el elemento físico; para seleccionar la zona se usa una parte libre de su superficie o su entrada en la lista.

## Ubicaciones y accesos

En Plano general → Propiedades → Códigos de ubicación, elegir un formato o escribir una plantilla. El valor predeterminado es `{S}{N}{C}`: sección, nivel y columna (A50110 = A5 / 01 / 10). `{S}-{N}-{C}` añade guiones; `{C}/{S}/{N}` cambia el orden. El ejemplo se actualiza antes de aplicar; aplicar es una acción reversible del documento.

Marcadores: `{S}` sección (letra y dígito), o `{L}` letra junto con `{E}` dígito; `{N}` nivel y `{C}` columna. Cada campo aparece una sola vez. `{*}` ignora texto adicional al leer, con preferencia por la coincidencia más corta; al generar códigos no añade texto. Por ejemplo `{*}-{S}-{N}-{C}` lee `CENTRAL-A5-01-10` y genera `-A5-01-10`. El resto es texto literal, normalizado a mayúsculas. Límites: plantilla de 120 caracteres en una línea y códigos de entrada de 256 caracteres.

Los niveles y columnas se generan con dos cifras. La lectura admite una cifra si hay un literal separador antes o después del campo; esta última posibilidad amplía el comportamiento anterior para campos numéricos iniciales delimitados. Los campos numéricos adyacentes mantienen dos cifras, salvo el campo delimitado, con preferencia por dos antes de una. El lector utiliza búsqueda acotada con memoización, sin construir expresiones regulares desde el archivo. Los ejemplos de ERP y LocationTests.cs sirven de referencia de compatibilidad.

En Propiedades de estantería, Vista previa de ubicaciones muestra las columnas del nivel elegido. Solo se generan códigos para niveles reales definidos; sin niveles se pide configurarlos. Pulsar una fila o usar el buscador Código de ubicación selecciona y encuadra la estantería y marca la ubicación. La búsqueda comprueba sección, nivel y rango de columna, muestra el código canónico y no modifica el documento ni crea acciones en el historial. Las propiedades pendientes se deben resolver antes de localizar.

Acceso local: a 0°, Frontal es Y = fondo de la estantería, Trasero es Y = 0, Izquierda es X = 0 y Derecha es X = ancho. Las columnas se distribuyen uniformemente en esa cara, por sus centros. Los giros son horarios en el plano y conservan la esquina mínima de la huella; cara y numeración giran con ellos. Invertir numeración cambia el orden de los códigos, sin mover la estantería. Las marcas señalan el acceso configurado. El cálculo de recorridos comprueba el acceso y el espacio libre sobre una malla conservadora.

Atajos fuera de campos de texto: Ctrl/Cmd+Z deshace; Ctrl/Cmd+Mayús+Z o Ctrl/Cmd+Y rehace; Ctrl/Cmd+D duplica; Supr o Retroceso elimina la selección. R gira con el plano enfocado. Las propiedades pendientes se deben aplicar o descartar antes de operaciones de edición o historial. Eliminar es inmediato y reversible.

## Datos y archivos

El documento almacena milímetros enteros; la interfaz muestra metros y acepta coma o punto decimal, con hasta tres decimales. Se conservan los conceptos de sección, columna y nivel de la aplicación anterior; los recorridos y sus opciones se calculan por separado sin cambiar el almacén.

Guardar utiliza el selector de archivos nativo cuando el navegador lo permite. Tras elegir destino, los siguientes guardados actualizan ese mismo archivo durante la sesión; Abrir también vincula el archivo elegido. Guardar almacén como… permite elegir otro destino. El vínculo no se conserva al recargar. Si el navegador no admite este acceso, se genera una descarga con un aviso; en ese caso el navegador decide los sufijos y el destino. La recuperación automática es una copia de trabajo independiente y puede desaparecer al borrar los datos del sitio. La advertencia al cerrar depende del navegador.

No se importan archivos de la aplicación Windows antigua. Un archivo inválido, de formato incompatible o de versión futura mantiene el documento abierto y muestra el motivo. Apertura limitada inicialmente a 10 MiB. Secciones: letra A–Z y dígito 0–9; niveles y columnas conservan las reglas básicas existentes. Dimensiones del suelo hasta 1.000 m; alturas hasta 100 m; las cotas explícitas requieren altura real. Son límites de validación iniciales, no capacidades de ingeniería.

La versión 2 añadió listas zones y fixtures obligatorias; la versión 3 añade locationTemplate. La versión web 1 se migra conservando identificadores, estanterías, medidas y niveles y añadiendo listas vacías. La versión 2 conserva sus zonas y elementos físicos. Las versiones 1 y 2 reciben el formato predeterminado. La versión 4 añade gridSizeMm; las versiones 1–3 reciben una cuadrícula de 1 m al migrar y guardar produce versión 4. Las extensiones de una versión posterior declaradas con un número anterior se rechazan para no perder datos. Las aplicaciones web anteriores no abren archivos de versión 4. El JSON de la aplicación Windows sigue siendo un formato distinto.

Límites iniciales adicionales: 100 zonas y 200 elementos físicos auxiliares; códigos de 1–20 caracteres y nombres de 1–80. Los identificadores son únicos entre todas las colecciones. Los códigos de mesas y obstáculos comparten categoría; los códigos de zona y sección tienen categorías independientes. Las estanterías y los elementos físicos no pueden solaparse; las zonas solo se comparan con otras zonas. El contacto entre bordes está permitido.

El visor utiliza bloques operativos con marcas de niveles reales. Sin altura real se usa una representación ilustrativa de 2,4 m, sin guardarla como dato real. No representa inventario ni capacidad de carga.

La web necesita que se sirvan los archivos de la aplicación. No hay todavía instalación offline/PWA ni paquete desktop.

## Comprobaciones

```powershell
npm run test -- --run
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest comprueba precisión de medidas, límites, colisiones entre tipos, zonas, códigos, niveles, comandos, ramas/límites del historial, migración, lectura/escritura, plantillas y geometría de accesos girados/invertidos. Playwright comprueba edición/descarga/reapertura, errores, apertura asíncrona, pantallas estrechas, alturas, muestra de 200 estanterías, historial, atajos, navegación, arrastre superior/isométrico, cancelación, zonas independientes y configuración/búsqueda de ubicaciones sin modificar datos. Capturas y medición se generan en artifacts/ (excluido de Git).

Comprobaciones del 09/11/2026: Chromium 158 headless con SwiftShader, Windows, 8 procesadores lógicos; tamaños 1440×900, 1100×740 y 760×800. La muestra de 200 estanterías abrió y cambió de vista en aproximadamente 3–5 s entre ejecuciones concurrentes de pruebas. No es una medición en hardware real de almacén ni una garantía de rendimiento. El visor renderiza cuando hay cambios, sin bucle continuo en reposo; las mediciones detalladas están en artifacts/performance.json.

El recorrido principal registra solicitudes y comprueba ausencia de destinos externos. Esto verifica la versión probada, no sustituye revisar cambios futuros en dependencias o servicios.

## Estructura y siguientes entregas

- src/warehouse: documento, unidades, validación y locations.ts (formatos, ubicación de columnas y comprobación de identidades), independientes del visor.
- src/editor: formularios, SpatialProperties, LocationPreview, LocationSearch, comandos atómicos comunes, historial y herramientas.
- src/viewport: escena/cámara Three.js, accessVisuals para anotaciones de acceso y controlador de arrastre con captura/cancelación de puntero y liberación de recursos.
- src/persistence: formato versionado, archivos del navegador y recuperación de sesión con propiedades pendientes.
- src/operations: importación, inventario, borradores de OT, rutas en un trabajador e informes locales.
- src/App.tsx: sesión, modos, selección, acciones de archivo y protección de cambios.

El documento se mantiene independiente del visor. El historial conserva instantáneas inmutables del documento y selección asociada; cámaras, herramientas, ajustes e información de archivo quedan fuera. dragInteraction.ts mantiene la previsualización transitoria separada del documento y solo envía el comando final al soltar. No se añadió un gestor de monorepo ni paquetes internos prematuros.

Secuencia integrada: recuperación local → inventario → OT → recorridos → informes. La nueva distribución desktop queda aparcada por decisión del usuario; no forma parte del trabajo activo.


## Flujo operativo local

- **Recuperación:** copia automática tras cambios, al ocultar la página o salir. Al volver se ofrece recuperar o descartar; incluye almacén, selección, inventario, borrador de OT, opciones aplicadas y texto pendiente en propiedades. Se informa si el navegador bloquea el almacenamiento o agota su cuota. No sustituye descargar los archivos.
- **Inventario:** importar CSV, TSV, XLS o XLSX, elegir hoja y cabecera, asignar columnas y revisar errores antes de sustituir los datos. Consulta con búsqueda, ordenación, paginación y filtros por estantería o ubicaciones desconocidas. Seleccionar una ubicación la muestra en el plano.
- **OT:** añadir desde inventario, escribir líneas o importar archivos, reemplazando o acumulando lotes con su origen. Cantidades con coma o punto decimal. Guardar y reabrir `.optiruta-ot.json` conserva incluso los borradores con errores. Una cantidad inválida o una ubicación inexistente bloquea el recorrido.
- **Recorridos:** inicio y destino en metros, retorno al inicio y resolución de malla. Se evita atravesar estanterías, mesas y obstáculos y se accede por la cara configurada. El cálculo se puede cancelar; cambiar el almacén, la OT o las opciones invalida el resultado. Las paradas conservan las líneas y permiten seguir la recogida en el plano.
- **Informes:** PDF con plano vectorial y tablas paginadas; CSV de inventario, OT y recorrido. Se exporta todo el conjunto elegido, aunque la pantalla esté filtrada. El CSV protege las celdas que podrían interpretarse como fórmulas.

La importación admite 10 MiB, 50.000 filas y 100 columnas. Las filas sin ubicación se enumeran como omitidas; los errores bloquean la confirmación. Las ubicaciones con formato válido pero inexistentes permanecen identificadas en el inventario. La OT limita sus campos a 4.096 caracteres y nunca trunca silenciosamente un dato al añadirlo.

El recorrido usa una malla ortogonal conservadora: puede considerar cerrado un paso estrecho que requeriría menor celda. Máximo 160.000 celdas y 200 paradas; orden óptimo sobre la malla hasta 16 paradas y aproximado por encima. Las distancias son horizontales; no incluyen tiempo de recogida, desplazamiento vertical, anchura de carro ni circulación de personas. La resolución se muestra junto al resultado y en el PDF.

Los archivos Windows antiguos siguen siendo un formato distinto. La recuperación pertenece al navegador y al origen de la aplicación; no sincroniza dispositivos. No se ha añadido instalación offline, cuentas ni paquete desktop.

Verificación integrada del 09/11/2026: compilación y análisis estático correctos, 70 pruebas unitarias y 29 pruebas de navegador aprobadas, incluidos los 20 recorridos anteriores del editor. Se comprobó la ausencia de solicitudes externas durante inventario → OT → ruta → PDF/CSV. PDF de estrés de 21 páginas renderizado e inspeccionado; capturas operativas de 1440×900 y 1100×740. El bloque principal con Three.js conserva un aviso de tamaño de compilación; Excel e informes se cargan bajo demanda.

## Jerarquía visual web

La cabecera agrupa los archivos del almacén en «Archivo del almacén», diferenciando «Guardar almacén» de «Guardar OT». El menú se cierra al elegir, pulsar Escape, salir con el foco o pulsar fuera. La sección activa y las acciones principales comparten acento petróleo; estados de OT válidos y pendientes combinan fondo, texto y símbolo.

Inventario y OT priorizan la tabla. «Ocultar plano» amplía el área de datos sin desmontar el visor ni cambiar cantidades; «Mostrar plano» restaura la consulta. Una OT válida ofrece «Preparar recorrido» y las opciones de origen/destino se despliegan cuando se necesitan; la precisión del cálculo se gestiona automáticamente. Las pruebas de jerarquía generan capturas a 1440×900, 1100×740 y 760×800.

## Mejoras de interacción e idiomas

- Deshacer/rehacer al principio de la barra de edición; el ajuste muestra el paso real de la cuadrícula (1 m inicialmente).
- Ambos laterales de Diseñar y la división datos/plano se ajustan con el ratón o las flechas del teclado. Escape cancela un arrastre; Inicio o doble clic restablecen tamaños. Se recuerda una distribución por sección; a 800 px o menos se usa el diseño apilado.
- El plegado del plano es un icono en su barra. Al plegarlo aparece el control para recuperarlo en la cabecera de datos; la proporción elegida se conserva.
- Marcar inicio/destino permite elegir suelo libre en el plano; sus marcadores se pueden arrastrar. Elegir destino crea una ruta abierta. Escape cancela. Las coordenadas pendientes se deben aplicar o cancelar antes de marcar puntos.
- En Diseñar, los cuatro bordes y sus tiradores están disponibles directamente, sin botón de activación. Al acercar el ratón se resaltan y cambia el cursor; Seleccionar permite redimensionar, mientras Mover vista o Espacio conservan la navegación. Arrastrar previsualiza el nuevo perímetro y ajusta por celdas. Izquierda/arriba desplazan todo el contenido y los extremos del recorrido. No se permite recortar elementos ni puntos; cada gesto se puede deshacer como una sola acción.
- Bloques/Detallada cambia la representación de estanterías en isométrica. Detallada usa medidas y cotas reales para montantes, baldas y travesaños. Los vanos físicos siguen el criterio de escritorio (hasta tres vanos, según longitud), independientes de las columnas de ubicación. La preferencia no cambia los datos del almacén. En superior se conservan bloques operativos.
- Español/English cambia interfaz, validaciones, formatos numéricos e informes. La preferencia se conserva localmente; nombres, referencias y descripciones introducidos por el usuario no se traducen.

La cuadrícula visual, el ajuste de edición y la malla de cálculo son conceptos diferentes. Recorridos ya no ofrece un segundo selector de tamaño de celda: calcula la resolución automáticamente, normalmente 0,25 m y más gruesa en almacenes grandes para respetar el máximo de 160.000 celdas. Sigue siendo una aproximación conservadora del espacio libre; no modela anchura del operario o vehículo. El resultado y el PDF indican la resolución utilizada.

Verificación de estas mejoras: 101 pruebas unitarias y 39 de navegador aprobadas; compilación correcta y análisis sin avisos. Se comprobó el flujo completo en inglés, el cambio de idioma conservando datos, los cuatro bordes con historial y los separadores a 800/1100/1440 px. La muestra de 200 estanterías se abrió en Bloques y Detallada y se comprobó la reconstrucción al alternar. Las mediciones de Chromium headless/SwiftShader son sintéticas y no garantizan rendimiento en todos los portátiles.


## Contenido ilustrativo por estantería

Propiedades → Vista detallada → Contenido ilustrativo ofrece Solo baldas, Cajas de cartón, Palets con cajas y Cajas pequeñas / gavetas. Aplicar muestra el resultado en isométrica detallada; Cancelar conserva el contenido anterior. Se guarda por estantería, admite deshacer/rehacer y recuperación de propiedades pendientes. La propiedad opcional contents conserva el formato web 4; los archivos sin ella se muestran como Solo baldas. Se rechazan valores desconocidos.

La geometría toma como referencia RackGeometry28.cs y RackAppearance29.cs de escritorio: palets con carga ilustrativa, gavetas abiertas con pared baja hacia la cara de acceso, dimensiones ajustadas al hueco y piezas agrupadas por material. No representa existencias reales. Sin niveles se dibujan tres baldas orientativas (cinco para gavetas), sin añadir niveles ni ubicaciones al documento. Sin altura real se usan 4,5 m para palets, 2 m para gavetas y 2,4 m para baldas o cartón; las alturas y cotas reales configuradas prevalecen.

Verificación del redimensionado directo y contenidos: 110 pruebas unitarias y 40 de navegador aprobadas, compilación correcta y análisis sin avisos. Se han revisado capturas de palets con cajas y gavetas, y probado una muestra de 200 estanterías con contenidos mixtos. Continúa siendo una muestra sintética de Chromium/SwiftShader, no una garantía de rendimiento en todos los equipos.


## Gavetas coherentes y ejemplo de escritorio

Las gavetas usan un tamaño común por estantería, elegido con el hueco vertical más restrictivo, como en escritorio. En una estantería real de 3 m con niveles 0/1,4/2,8 m, el hueco superior de 0,2 m exige gavetas más pequeñas; las cotas no se cambian para rellenar visualmente el espacio. Las cajas de cartón se apoyan sobre las baldas, con cinta y etiqueta ilustrativas, sin palets.

Archivo del almacén → Abrir ejemplo detallado carga una copia web de almacen-vista-detallada.json, además del ejemplo sencillo. El archivo convertido está en src/warehouse/examples/almacen-detallado.optiruta.json. Conserva suelo de 32×34 m, 22 secciones, posiciones, medidas, caras de acceso, numeración inversa, diez columnas por sección y los contenidos originales. Se conservan las tres zonas y el borde bloqueado oriental como obstáculo de altura ilustrativa 0,65 m, igual que la vista de escritorio. Los colores de estantería distinguen contenidos.

Es una conversión del ejemplo, no un importador general de Windows. El original sigue intacto. No se convierten los antiguos Spots en niveles ni se importan OT/inventario o extremos de recorrido. El ejemplo reconoce ubicaciones por sección y columna como escritorio: A60208 corresponde a A6, columna 08, nivel 02, aunque su cota sea desconocida. Sus copias web anteriores se actualizan al abrir por su identificador estable. Las alturas y baldas orientativas permanecen exclusivamente en la representación. Los almacenes nuevos exigen niveles configurados por defecto; Propiedades permite elegir el criterio compatible con escritorio.

Verificación de cartón/gavetas/ejemplo: 118 pruebas unitarias y 41 de navegador aprobadas, compilación correcta y análisis sin avisos. Se comparó la conversión con el JSON original y se revisaron capturas. La muestra de 200 estanterías incluye los cuatro contenidos. El ejemplo detallado abre Diseñar en isométrica detallada tras la confirmación de cambios; cancelar conserva el modo y la vista anteriores.

Verificación de compatibilidad y guardado: 121 pruebas unitarias y 44 de navegador aprobadas, compilación correcta y análisis sin avisos. Se comprueban A60208 en inventario/ruta, escritura repetida en el mismo destino, apertura vinculada, cancelación y errores. El selector nativo se simula en las pruebas; no se automatiza el diálogo del sistema operativo. Continúa el aviso de tamaño de paquete de Vite.

Rutas web: `/` presenta el producto; `/app` abre la aplicación (también admite `/app/`). `/?page=welcome` conserva compatibilidad y normaliza la URL a `/`. La marca dentro de la aplicación vuelve a su Inicio sin salir de `/app`. Para producción, el alojamiento debe servir `index.html` como fallback de `/app` y `/app/` (Vite dev y preview ya lo hacen). Los recursos mantienen la ruta base del despliegue.

## Publicación y SEO

- `/`: presentación en español; `/en/`: presentación en inglés; `/app`: editor con `noindex`.
- `npm run build` genera HTML con contenido visible sin JavaScript, metadatos, `robots.txt`, sitemap y `404.html`.
- Para un dominio confirmado, definir `SITE_URL` como origen HTTPS sin subruta antes de compilar. Ejemplo PowerShell: `$env:SITE_URL='https://tu-dominio-confirmado.dev'`; después `npm run build`.
- Sin `SITE_URL`, la compilación es de previsualización: `noindex`, sin canonical, URLs inventadas ni entradas en el sitemap. No publicar esa compilación esperando indexación.
- Con `SITE_URL`, se generan canonical, alternates ES/EN/x-default, Open Graph y JSON-LD WebSite/WebPage/WebApplication. No se declaran precios, valoraciones ni integraciones inexistentes.
- El alojamiento debe servir `/` → `index.html`, `/en/` → `en/index.html`, `/app` → `app/index.html`; redirigir `/en` a `/en/`, `/app/` a `/app`, y `?page=welcome` a `/` con 301. Las rutas desconocidas deben responder **404**, usando `404.html`, nunca el fallback general de la landing. Vite dev/preview ya aplican estas reglas. Sustituye las instrucciones anteriores de fallback SPA general por estas rutas explícitas.
- Servir `robots.txt` como texto y `sitemap.xml` como XML; no bloquear `/app` en robots, para que los buscadores puedan leer su `noindex`.
- La política por defecto permite rastreo. Permitir búsqueda y permitir entrenamiento son decisiones distintas; no se añaden bloqueos específicos de entrenamiento en este cambio.
- Tras publicar: validar el dominio real en Search Console/Bing Webmaster Tools, enviar sitemap, comprobar HTTPS/redirecciones/404 y validar el JSON-LD con Schema.org. No se ha conectado ninguna cuenta ni publicado el sitio.
- Comprobaciones: `node scripts/check-seo.mjs`, `playwright test e2e/seo.spec.ts`; repetir las pruebas de HTML sin JavaScript contra la compilación servida.
