import { defineProyecto } from "../src/tipos.js";

export default defineProyecto({
    nombre: "prueba",
    raiz: "/tmp/prueba-orq",
    agentePrincipal: "a",
    maxTurnos: 30,
    agentes: [
        {
            id: "a", descripcion: "Agente A, sin relación con B.", raiz: "a",
            prompt: "prueba/a.md", verificacion: []
        },
        {
            id: "b", descripcion: "Agente B, sin relación con A.", raiz: "b",
            prompt: "prueba/b.md", verificacion: [], maxTurnos: 10
        },
    ],
});