/**
 * Monta y borra los fixtures de I-14 (D-11): los casos que el disco real de este repo no
 * tiene (tarea aparcada con pendiente, historial vacío, JSON inválido, evento desconocido).
 * Viven en carpetas `.orquestador/fixture-<caso>/`, nunca tocan un archivo real.
 *
 * Uso: npm run fixtures:montar | npm run fixtures:borrar
 */
import fs from "node:fs";
import path from "node:path";
import { DIR_ESTADO } from "../src/raices.js";
import type { EstadoTarea } from "../../src/buzon.js";
import type { Pregunta } from "../../src/canal.js";

const CARPETAS = [
  "fixture-aparcada",
  "fixture-historial-vacio",
  "fixture-json-invalido",
  "fixture-evento-desconocido",
] as const;

const pregunta: Pregunta = {
  id: "a->b#1",
  agente: "a",
  repo: "/tmp/fixture-aparcada/a",
  tarea: "aparcada-2026-01-05T00-00-00-000Z",
  feature: "aparcada",
  pregunta: "¿Usamos la tabla existente o creamos una nueva para guardar el estado intermedio?",
  porQue:
    "Sin esto no puedo escribir la migración: cualquiera de las dos opciones es difícil de revertir una vez corrida.",
  dondeBusque: ["src/config.ts", "specs/lectura/diseño.md"],
  opciones: ["Usar la tabla existente", "Crear una tabla nueva"],
  recomendacion: "Usar la tabla existente: ya tiene los campos de auditoría que hacen falta.",
};

const estadoAparcada: EstadoTarea = {
  tareaId: "aparcada-2026-01-05T00-00-00-000Z",
  proyecto: "fixture-aparcada",
  feature: "aparcada",
  descripcion:
    "Fixture de I-14: tarea aparcada esperando respuesta humana, con pendiente.pregunta completo (porQue, dondeBusque, opciones, recomendacion).",
  estado: "aparcada",
  motivo: "Esperando respuesta a una pregunta bloqueante.",
  solicitudes: 1,
  costoEstimadoUsd: 1.2345,
  sesiones: { a: "sesion-fixture-a" },
  cola: [],
  pendiente: {
    pregunta,
    trabajo: {
      tipo: "solicitud",
      agente: "a",
      solicitud: {
        id: "a->b#1",
        origen: "a",
        destino: "b",
        feature: "aparcada",
        problema: "Falta decidir el esquema antes de escribir la migración.",
        esperado: "Confirmación de qué tabla usar.",
        referencias: ["src/config.ts"],
        creada: "2026-01-05T00:00:00.000Z",
      },
    },
  },
  ramas: { "/tmp/fixture-aparcada/a": "agente/aparcada" },
  reposParticipantes: ["/tmp/fixture-aparcada/a"],
  historial: [
    {
      fecha: "2026-01-05T00:00:00.000Z",
      evento: "inicio",
      detalle: { agenteInicial: "a", ramas: { "/tmp/fixture-aparcada/a": "agente/aparcada" } },
    },
    {
      fecha: "2026-01-05T00:05:00.000Z",
      evento: "aparcada",
      detalle: { motivo: "Esperando respuesta a una pregunta bloqueante.", pregunta },
    },
  ],
};

const estadoHistorialVacio: EstadoTarea = {
  tareaId: "historial-vacio-2026-01-05T00-00-00-000Z",
  proyecto: "fixture-historial-vacio",
  feature: "historial-vacio",
  descripcion: "Fixture de I-14: tarea recién creada, sin eventos en el historial todavía.",
  estado: "en_curso",
  solicitudes: 0,
  costoEstimadoUsd: 0,
  sesiones: {},
  cola: [],
  ramas: {},
  reposParticipantes: [],
  historial: [],
};

const estadoEventoDesconocido: EstadoTarea = {
  tareaId: "evento-desconocido-2026-01-05T00-00-00-000Z",
  proyecto: "fixture-evento-desconocido",
  feature: "evento-desconocido",
  descripcion:
    "Fixture de I-14: historial con un evento de nombre inventado, fuera de la lista cerrada de D-9.",
  estado: "completada",
  solicitudes: 0,
  costoEstimadoUsd: 0.5,
  sesiones: { a: "sesion-fixture-a" },
  cola: [],
  ramas: {},
  reposParticipantes: [],
  historial: [
    { fecha: "2026-01-05T00:00:00.000Z", evento: "inicio", detalle: { agenteInicial: "a", ramas: {} } },
    {
      fecha: "2026-01-05T00:03:00.000Z",
      evento: "migracion_de_esquema",
      detalle: { nota: "Evento inventado para probar que uno desconocido no rompe la vista (D-9)." },
    },
    { fecha: "2026-01-05T00:05:00.000Z", evento: "completada", detalle: "Listo." },
  ],
};

const JSON_INVALIDO_ID = "json-invalido-2026-01-05T00-00-00-000Z";
const JSON_INVALIDO = `{
  "tareaId": "${JSON_INVALIDO_ID}",
  "proyecto": "fixture-json-invalido",
  "feature": "json-invalido",
  "descripcion": "Fixture de I-14: archivo cortado a la mitad, como puede quedar si el proceso
`;

function escribir(proyecto: string, tareaId: string, contenido: string) {
  const dir = path.join(DIR_ESTADO, proyecto);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${tareaId}.json`), contenido);
}

function montar() {
  escribir("fixture-aparcada", estadoAparcada.tareaId, JSON.stringify(estadoAparcada, null, 2));
  escribir(
    "fixture-historial-vacio",
    estadoHistorialVacio.tareaId,
    JSON.stringify(estadoHistorialVacio, null, 2),
  );
  escribir("fixture-json-invalido", JSON_INVALIDO_ID, JSON_INVALIDO);
  escribir(
    "fixture-evento-desconocido",
    estadoEventoDesconocido.tareaId,
    JSON.stringify(estadoEventoDesconocido, null, 2),
  );
  console.log("Fixtures montados en .orquestador/fixture-*/:");
  for (const carpeta of CARPETAS) console.log(`  - ${carpeta}`);
}

function borrar() {
  for (const carpeta of CARPETAS) {
    fs.rmSync(path.join(DIR_ESTADO, carpeta), { recursive: true, force: true });
  }
  console.log("Fixtures borrados de .orquestador/fixture-*/");
}

const comando = process.argv[2];
if (comando === "montar") montar();
else if (comando === "borrar") borrar();
else {
  console.error("Uso: tsx scripts/fixtures.ts montar|borrar");
  process.exit(1);
}
