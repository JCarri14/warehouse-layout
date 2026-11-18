# Visor por lotes, selección analítica, workers y colocación con pasillos: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir las llamadas de dibujo del visor 3D, desacoplar la selección de las mallas, sacar del hilo principal la lectura de libros Excel y hacer que la colocación automática respete pasillos de acceso.

**Architecture:** Las estanterías no seleccionadas se dibujan con un `InstancedMesh` por tipo de pieza para todo el almacén (color por instancia), en lugar de varias mallas por estantería. La selección deja de lanzar rayos contra la escena: calcula rayo contra cajas a partir del documento. Un helper común de workers sirve para rutas e importación. La colocación prueba primero posiciones que no invaden la franja de acceso de ninguna estantería y, si no hay ninguna, usa el comportamiento actual.

**Tech Stack:** React 19, TypeScript 7, Three.js 0.187 (WebGL), Vite 8, Vitest 5, Playwright 1.65, SheetJS 0.20.3.

**Spec:** No hay documento aparte. Este plan parte de la revisión de `wass08/wfc-magic-school` hecha en esta sesión (puntos 1–4) y del código actual de `next/src`.

## Global Constraints

- Sin dependencias nuevas de ejecución (ni `three-mesh-bvh` ni otras): el repositorio de referencia no tiene licencia, solo se reutilizan ideas.
- El formato de documento sigue en versión 4; nada de este plan añade campos persistidos.
- Sin recursos remotos; todo se procesa en el navegador.
- Textos visibles con `t()` y en español como idioma base; actualizar el diccionario de `src/i18n` si se añade alguno.
- Todo cambio deja verdes: `npm run lint`, `npx vitest run`, `npm run build`, `npm run test:e2e` (desde `next/`, Node 24).
- Comportamiento visible igual que hoy salvo donde una tarea diga lo contrario (colores, selección, atenuado, filtros, etiquetas).

## Decisiones tomadas (revisables)

- **Sin BVH ni rejilla DDA.** El documento limita a 260 códigos de estantería, 100 zonas y 200 elementos auxiliares, unos 560 elementos como máximo. Probar el rayo contra 560 cajas cuesta microsegundos; una estructura espacial no compensa su complejidad. Si la tarea 0 muestra lo contrario, se reabre.
- **Restricciones con rectángulos, no con arrays de bits.** Con 560 elementos como máximo, comprobar rectángulos es exacto y suficiente. Una rejilla de bits a 100 mm en 1000×1000 m serían 10⁸ celdas.
- **Pasillo mínimo por defecto: 1000 mm** (`DEFAULT_AISLE_MM`), constante y sin guardar en el documento.
- **Etiquetas fuera de alcance.** Cada estantería tiene un sprite con su propia textura. Tras agrupar en lotes serán probablemente la mayor parte de las llamadas de dibujo; si la tarea 0 y la tarea 3 lo confirman, un atlas de etiquetas va en un plan aparte.
- **La estantería seleccionada se queda fuera del lote** y se dibuja con el código actual por elemento (resaltado, contorno, haz, marcas de acceso). Así el estado activo no cambia.

## Review Focus

1. Filtro de inventario y modo foco con estanterías en lotes: las que no coinciden se atenúan igual que hoy y vuelven a su color al quitar el filtro. Tests en la tarea 3.
2. Pulsar una estantería dentro de una zona selecciona la estantería; pulsar la parte libre de la zona selecciona la zona. Tests en la tarea 1.
3. Estantería girada 90° y 270° con acceso lateral: la franja de acceso queda en la cara correcta. Tests en la tarea 6.
4. Abrir un segundo Excel mientras se lee el primero: gana el último y el primero no sobrescribe el resultado. Tests en la tarea 5.
5. Navegador sin Worker (o con un fallo al crearlo): la importación sigue funcionando en el hilo principal. Tests en la tarea 5.

---

### Task 0: Medición de partida

**Files:**
- Modify: `next/e2e/scene-performance.spec.ts`
- Modify: `next/e2e/performance.spec.ts`

**Interfaces:**
- Produces: `artifacts/scene-performance.json` con `calls` (llamadas de dibujo por fotograma, vista isométrica, modo bloques y modo detallado) y `pickMs` (mediana de 20 selecciones por clic en el canvas). `artifacts/performance.json` con `importMs` y `longestTaskMs` durante la importación de un XLSX sintético de 50.000 filas.

- [ ] **Step 1:** En el `addInitScript` de `scene-performance.spec.ts`, contar también `drawElements`, `drawArrays`, `drawElementsInstanced` y `drawArraysInstanced` en un contador `calls`. Registrar `calls` en un fotograma tras "Encuadrar" en isométrica, con bloques y con detallado.
- [ ] **Step 2:** Añadir `pickMs`: 20 clics en coordenadas fijas del canvas sobre estanterías conocidas, midiendo con `performance.now()` dentro de la página desde `pointerdown` hasta que la fila de la lista recibe `.active`.
- [ ] **Step 3:** En `performance.spec.ts`, generar en el test un XLSX de 50.000 filas × 4 columnas con `xlsx` (Node), importarlo desde el panel de operaciones y registrar `importMs` y la tarea larga más larga con `PerformanceObserver({ type: 'longtask' })`.
- [ ] **Step 4:** Ejecutar `npm ci` y después `npx playwright test e2e/performance.spec.ts e2e/scene-performance.spec.ts`. Resultado esperado: PASS y los dos JSON escritos. Copiar los números en la descripción del commit; son la referencia de las tareas 3, 4 y 5.
- [ ] **Step 5:** Commit `test: medir llamadas de dibujo, selección e importación de partida`.

### Task 1: Selección analítica por cajas

**Files:**
- Create: `next/src/viewport/elementPicker.ts`
- Create: `next/src/viewport/elementPicker.test.ts`
- Modify: `next/src/viewport/WarehouseViewport.tsx` (función `pick` de `installDragInteraction` y `solidAt`)
- Modify: `next/src/viewport/dragInteraction.ts` (tipo de `pick` y lecturas de `hit.object.userData.id`)

**Interfaces:**
- Produces:
  - `type PickBox = { id: string; kind: ElementKind; min: THREE.Vector3; max: THREE.Vector3 }` en metros, en coordenadas de escena (x = xMm/1000, z = yMm/1000).
  - `elementBoxes(doc: WarehouseDocument): PickBox[]`. Las zonas van de y −0,016 a −0,008 y el resto de 0 a `elementHeight/1000` sobre su `footprint`.
  - `pickElement(ray: THREE.Ray, boxes: readonly PickBox[], selected: string | null): { id: string; kind: ElementKind; point: THREE.Vector3 } | undefined`. Prioridad: el elemento físico más cercano; si no hay, la zona seleccionada atravesada; si no, la zona más cercana.
  - `DragOptions.pick: (ray: THREE.Raycaster) => { id: string | null; point: THREE.Vector3 } | undefined`, donde `id: null` significa suelo (intersección con el plano y = 0 dentro del almacén).

- [ ] **Step 1: tests que fallan** en `elementPicker.test.ts`:
  - `selecciona la estantería dentro de una zona`: almacén con una zona de 8×6 m y una estantería dentro. Un rayo vertical sobre la estantería devuelve `kind: 'rack'`, y sobre la parte libre de la zona devuelve `kind: 'zone'`.
  - `prefiere la zona seleccionada entre zonas superpuestas`: dos zonas superpuestas; con `selected` = la de abajo, devuelve la de abajo.
  - `elige la más cercana en isométrica`: dos estanterías alineadas con el rayo diagonal; devuelve la primera atravesada.
  - `respeta el giro`: una estantería de 6000×1200 a 90° tiene caja de 1,2×6 m.
- [ ] **Step 2:** `npx vitest run src/viewport/elementPicker.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `elementBoxes` y `pickElement` con `ray.intersectBox`. Las cajas se recalculan en `refresh` y se guardan en el cierre del visor.
- [ ] **Step 4:** Sustituir en `WarehouseViewport.tsx` el `pick` y `solidAt` basados en `intersectObjects(group.children, true)` por `pickElement`. `endpoint` y `handleAt` siguen con rayos, pero solo contra las mallas con `userData.endpoint` y `userData.resizeEdge` (guardarlas en una lista al crearlas).
- [ ] **Step 5:** `npx vitest run` y `npx playwright test e2e/editor.spec.ts e2e/hierarchy.spec.ts e2e/spatial.spec.ts e2e/point-placement.spec.ts e2e/element-resize.spec.ts` → PASS.
- [ ] **Step 6:** Commit `feat(visor): selección analítica por cajas independiente de las mallas`.

### Task 2: Piezas del modo detallado como datos

**Files:**
- Modify: `next/src/viewport/detailedVisuals.ts`
- Modify: `next/src/viewport/detailedVisuals.test.ts`

**Interfaces:**
- Produces:
  - `type PartMaterial = 'frame' | 'beam' | 'shelf' | 'body' | 'leg' | 'wood' | 'cardboard' | 'bin' | 'label'`
  - `type DetailedPart = { material: PartMaterial; color: THREE.Color; matrix: THREE.Matrix4 }`, con la matriz ya en coordenadas de escena (incluye la posición y el giro del elemento).
  - `detailedParts(element: PlacedElement, options: { active: boolean }): DetailedPart[]`
  - `PART_METALNESS: Record<PartMaterial, number>` con los valores actuales (frame .55, beam .3, shelf .1, body .05, leg .45, contenidos .02).
  - `addDetailedElement` se mantiene con la misma firma, implementada sobre `detailedParts` (la seleccionada sigue usándola).

- [ ] **Step 1: test que falla** `detailedParts reproduce las piezas de addDetailedElement`: para una estantería de cada tipo de `contents`, una mesa y un obstáculo, el número de piezas por material y la caja envolvente de todas las matrices coinciden con las del grupo que devuelve hoy `addDetailedElement` (calculada con `Box3.setFromObject`).
- [ ] **Step 2:** `npx vitest run src/viewport/detailedVisuals.test.ts` → FAIL.
- [ ] **Step 3:** Extraer `detailedParts` moviendo la lógica actual de `part()` y `batch()`. Componer cada matriz como matriz del grupo × matriz de la pieza.
- [ ] **Step 4:** Tests → PASS, y los existentes de `detailedVisuals.test.ts` siguen en verde.
- [ ] **Step 5:** Commit `refactor(visor): piezas detalladas como datos reutilizables`.

### Task 3: Lotes de estanterías en modo bloques

**Files:**
- Create: `next/src/viewport/rackBatches.ts`
- Create: `next/src/viewport/rackBatches.test.ts`
- Modify: `next/src/viewport/rackAppearance.ts` (interfaz común)
- Modify: `next/src/viewport/WarehouseViewport.tsx` (bucle de `document.racks`)
- Modify: `next/e2e/scene-performance.spec.ts`

**Interfaces:**
- Consumes: `detailedParts` y `PART_METALNESS` (tarea 2), `elementBoxes` (tarea 1).
- Produces:
  - `interface Dimmable { setDimmed(value: boolean, strength?: number): boolean }`, que `RackAppearance` implementa.
  - `class RackBatches { constructor(racks: readonly Rack[], options: { mode: 'blocks' | 'detailed'; exclude: string | null }); readonly objects: THREE.Object3D[]; appearance(id: string): Dimmable | undefined; dispose(): void }`
  - En modo `blocks`: un `InstancedMesh` de cuerpos, un `InstancedMesh` de niveles (las mismas cajas `w+.035 × .045 × d+.035`) y un único `LineSegments` con las aristas de todos los cuerpos y atributo de color por vértice. Material blanco y color en `instanceColor`.
  - `userData.ids: string[]` en cada `InstancedMesh` (índice de instancia → id de estantería), para depuración y tests.

- [ ] **Step 1: tests que fallan** en `rackBatches.test.ts`:
  - `una malla por tipo de pieza`: con 200 estanterías y `exclude` = una de ellas, `objects` tiene 3 objetos; cuerpos con `count` 199, niveles con la suma de niveles de las 199.
  - `excluye la seleccionada`: su id no aparece en `userData.ids`.
  - `atenúa solo su rango`: `appearance(id).setDimmed(true, .58)` cambia los colores de instancia de esa estantería y de ninguna otra; `setDimmed(false)` restaura los originales y devuelve `true`, y una segunda llamada igual devuelve `false`.
  - `matrices en su sitio`: la caja de cada cuerpo coincide con `elementBoxes` de la tarea 1.
- [ ] **Step 2:** `npx vitest run src/viewport/rackBatches.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `RackBatches`. Al atenuar, actualizar solo el rango afectado con `instanceColor.addUpdateRange` y `needsUpdate = true`.
- [ ] **Step 4:** En `WarehouseViewport.tsx`, en modo bloques: una capa `layers.use('rack-batch', [document.racks, selection, detailed], ...)` que crea `RackBatches` y registra `appearances.set(id, batches.appearance(id)!)` para cada estantería del lote. La seleccionada sigue en su capa `rack:${id}` actual. Las etiquetas y `drawAccess` de las no seleccionadas siguen por estantería, en una capa `rack-labels:${id}`. El tipo de `appearances` pasa a `Map<string, Dimmable>`.
- [ ] **Step 5: e2e.** En `scene-performance.spec.ts`, exigir en modo bloques `calls` ≤ 60 % del valor de partida de la tarea 0, y mantener las aserciones actuales (`buffers < 100` y `textures < 20` al seleccionar, 0 en reposo). Añadir `el filtro de inventario atenúa estanterías en lote`: con un filtro que deja 10 coincidencias, el color de instancia de una no coincidente es distinto del original y vuelve al quitar el filtro (leído desde `window.__viewportDebug`, expuesto solo con `import.meta.env.DEV`).
- [ ] **Step 6:** `npx vitest run` y `npm run test:e2e` → PASS.
- [ ] **Step 7:** Commit `feat(visor): estanterías no seleccionadas en lotes instanciados`.

### Task 4: Lotes en modo detallado

**Files:**
- Modify: `next/src/viewport/rackBatches.ts`
- Modify: `next/src/viewport/rackBatches.test.ts`
- Modify: `next/src/viewport/WarehouseViewport.tsx`
- Modify: `next/e2e/scene-performance.spec.ts`

**Interfaces:**
- Consumes: `RackBatches` (tarea 3), `detailedParts` y `PART_METALNESS` (tarea 2).
- Produces: en modo `detailed`, `objects` tiene un `InstancedMesh` por `PartMaterial` presente (como máximo 9), con `metalness` de `PART_METALNESS` y color de pieza en `instanceColor`.

- [ ] **Step 1: test que falla** `detallado: una malla por material`: con 200 estanterías de los cuatro tipos de contenido, `objects.length` ≤ 9 y el total de instancias es igual a la suma de `detailedParts(...).length` de las 199 no excluidas.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Implementar la rama `detailed` agrupando `detailedParts` por material. Aplicar el atenuado sobre las piezas de esa estantería con el mismo mecanismo de rangos.
- [ ] **Step 4:** En el visor, `detailed` usa `RackBatches` con `mode: 'detailed'`; la seleccionada sigue con `addDetailedElement`.
- [ ] **Step 5: e2e.** En modo detallado, `calls` ≤ 40 % del valor de partida y `detailedSelection.textures < 20` se mantiene. Capturas `artifacts/editor-detallado-200.png` revisadas a mano antes y después: misma imagen salvo diferencias mínimas de antialiasing.
- [ ] **Step 6:** `npm run test:e2e` → PASS.
- [ ] **Step 7:** Commit `feat(visor): modo detallado en lotes por material`.

### Task 5: Helper de workers e importación de Excel fuera del hilo principal

**Files:**
- Create: `next/src/operations/workerTask.ts`
- Create: `next/src/operations/workerTask.test.ts`
- Create: `next/src/operations/import.worker.ts`
- Modify: `next/src/operations/RoutePanel.tsx` (usar el helper; mismo comportamiento)
- Modify: `next/src/operations/route.worker.ts` (protocolo común)
- Modify: `next/src/operations/OperationsPanel.tsx` (llamada a `readTables`)
- Modify: `next/e2e/performance.spec.ts`

**Interfaces:**
- Produces:
  - `type WorkerReply<O> = { ok: true; result: O } | { ok: false; message: string }`
  - `runWorkerTask<I, O>(create: () => Worker, input: I, transfer?: Transferable[]): { promise: Promise<O>; cancel(): void }`. Rechaza con `Error(message)` si `ok: false` o en `onerror`. `cancel()` termina el worker y rechaza con un `DOMException` de nombre `AbortError`. El worker se termina siempre al acabar.
  - `readTablesInBackground(file: File): { promise: Promise<ImportTable[]>; cancel(): void }` en `workerTask.ts`. Si `new Worker` lanza una excepción, usa `readTables(file)` en el hilo principal.
  - `import.worker.ts` recibe `{ file: File; language: Language }`, llama a `setLanguage` y responde `WorkerReply<ImportTable[]>`.

- [ ] **Step 1: tests que fallan** en `workerTask.test.ts`, con una clase `FakeWorker` que se inyecta con `create`:
  - `resuelve con result y termina el worker`.
  - `rechaza con el mensaje del worker`.
  - `cancel rechaza con AbortError y termina`.
  - `sin Worker usa el hilo principal`: con `create` que lanza una excepción, `readTablesInBackground` sobre `ejemplo-ERP.csv` devuelve las mismas tablas que `readTables`.
- [ ] **Step 2:** `npx vitest run src/operations/workerTask.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `runWorkerTask`, `readTablesInBackground` e `import.worker.ts`. Migrar `RoutePanel.calculate` y `cancel` a `runWorkerTask`, conservando `runId` y `latestKey` para descartar respuestas viejas.
- [ ] **Step 4:** En `OperationsPanel`, guardar el `cancel` de la lectura en curso y cancelarlo al elegir otro archivo o al desmontar. Ignorar el `AbortError`.
- [ ] **Step 5: e2e.** En `performance.spec.ts`: con el XLSX de 50.000 filas de la tarea 0, `longestTaskMs` < 200. Test nuevo `el último archivo gana`: elegir el XLSX grande e inmediatamente `ejemplo-ERP.csv`; la vista previa muestra el CSV.
- [ ] **Step 6:** `npx vitest run` y `npx playwright test e2e/operations.spec.ts e2e/operational.spec.ts e2e/native-files.spec.ts e2e/performance.spec.ts` → PASS.
- [ ] **Step 7:** Commit `feat(operaciones): leer libros Excel en un worker con cancelación`.

> `previewImport` y `buildReport` se quedan en el hilo principal. Solo se mueven si la tarea 0 mide más de 100 ms con 50.000 filas o con el informe más grande del ejemplo, usando el mismo `runWorkerTask`.

### Task 6: Colocación automática que respeta pasillos de acceso

**Files:**
- Create: `next/src/warehouse/placement.ts`
- Create: `next/src/warehouse/placement.test.ts`
- Modify: `next/src/editor/commands.ts` (función `place`)

**Interfaces:**
- Consumes: `accessFace(rack)` de `src/warehouse/locations.ts`, y `footprint` y `allElements` de `document.ts`.
- Produces:
  - `export const DEFAULT_AISLE_MM = 1000`
  - `type Rect = { x: number; y: number; w: number; d: number }` (igual que lo que devuelve `footprint`).
  - `accessStrip(rack: Rack, aisleMm: number): Rect`: rectángulo de profundidad `aisleMm` pegado a la cara de acceso, hacia fuera, a lo largo de toda la cara. Se deriva de `accessFace` (inicio, fin y normal), así que respeta el giro.
  - `findPlacement(doc: WarehouseDocument, element: PlacedElement, preferred: readonly { x: number; y: number }[], aisleMm = DEFAULT_AISLE_MM): { x: number; y: number } | null`. Devuelve la primera candidata, en el orden actual (preferidas, después la barrida de `xs`×`ys`), que cumple todo esto:
    1. Dentro del suelo y sin solaparse con elementos de su categoría (igual que hoy).
    2. Si no es zona: su huella no invade la franja de acceso de ninguna estantería existente.
    3. Si es estantería: su propia franja de acceso está dentro del suelo y no invade ningún elemento físico.
    Las candidatas de la barrida añaden también `a.x + a.w + aisleMm` y `a.y + a.d + aisleMm`. Las zonas ignoran las reglas 2 y 3.
  - `place()` en `commands.ts` llama a `findPlacement` y, si devuelve `null`, ejecuta la lógica actual sin cambios.

- [ ] **Step 1: tests que fallan** en `placement.test.ts`:
  - `accessStrip en los cuatro giros`: estantería de 6000×1200 en (10000, 10000) con acceso `front`. A 0° la franja es `{x:10000, y:11200, w:6000, d:1000}`; a 90°, 180° y 270° queda pegada a la cara girada correspondiente (comprobar cada `Rect`). Repetir con acceso `left`.
  - `duplicar no tapa el acceso`: estantería con acceso `front` y un obstáculo justo a su derecha. La copia no se coloca en su franja frontal.
  - `un obstáculo nuevo evita la franja`: `addElement(doc, 'obstacle')` con una estantería cuya franja cubre (1000, 1000) coloca el obstáculo fuera de ella.
  - `si no cabe con pasillo, se usa lo de hoy`: un almacén de 8×3 m con una estantería; duplicar sigue funcionando y devuelve la misma posición que la lógica actual.
  - `las zonas no tienen restricción`: añadir una zona en (1000, 1000) encima de una franja de acceso conserva esa posición.
- [ ] **Step 2:** `npx vitest run src/warehouse/placement.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `accessStrip` y `findPlacement`, y conectarlos en `place`.
- [ ] **Step 4:** `npx vitest run` → PASS, incluido `src/warehouse/spatial.test.ts`. Si algún test existente fija una posición que ahora cambia por la franja, actualizar la expectativa y explicarlo en el commit.
- [ ] **Step 5:** `npx playwright test e2e/editor.spec.ts e2e/spatial.spec.ts` → PASS.
- [ ] **Step 6:** Actualizar el párrafo de `next/README.md` que dice que el margen de 50 cm «no garantiza pasillos operativos»: ahora se intenta dejar 1 m frente a las caras de acceso y, si no cabe, se coloca como antes.
- [ ] **Step 7:** Commit `feat(editor): colocación automática que respeta franjas de acceso`.

---

## Orden y dependencias

- **Visor:** 0 → 1 → 2 → 3 → 4, en este orden. La 3 necesita la 1 porque las mallas en lote ya no llevan `userData.id` por estantería.
- **Workers:** la 5 depende solo de la 0.
- **Colocación:** la 6 es independiente de todo lo demás.
- La 5 y la 6 tocan archivos distintos de las 1–4 y pueden ir en paralelo con ellas.
