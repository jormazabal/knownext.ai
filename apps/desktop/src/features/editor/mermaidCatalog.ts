import type { AiDiagramConfig, DiagramVisualProfile } from "../../types/domain";

export type MermaidDiagramCategory = "core" | "business" | "technical" | "data" | "experimental";
export type MermaidDiagramMaturity = "stable" | "advanced" | "beta";

export type MermaidDiagramTemplate = {
  id: string;
  label: string;
  diagramType: string;
  category: MermaidDiagramCategory;
  maturity: MermaidDiagramMaturity;
  recommendedProfile: DiagramVisualProfile;
  supportsIcons: boolean;
  supportsImages: boolean;
  description: string;
  useWhen: string;
  avoidWhen: string;
  code: string;
};

export type MermaidPolicyValidation = {
  valid: boolean;
  error: string | null;
  warnings: string[];
};

export const mermaidDiagramTemplates: MermaidDiagramTemplate[] = [
  {
    id: "flowchart-process",
    label: "Flujo de proceso",
    diagramType: "flowchart",
    category: "core",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: true,
    supportsImages: true,
    description: "Procesos, decisiones, dependencias y rutas de trabajo.",
    useWhen: "Hay pasos conectados y decisiones visibles.",
    avoidWhen: "La prioridad es una linea temporal con fechas.",
    code: `flowchart TD
  A["Solicitud"] --> B{"Decision"}
  B -->|Aprobada| C["Ejecutar"]
  B -->|Revisar| D["Ajustar"]`,
  },
  {
    id: "flowchart-architecture-icons",
    label: "Arquitectura con iconos",
    diagramType: "flowchart",
    category: "technical",
    maturity: "advanced",
    recommendedProfile: "visual_local",
    supportsIcons: true,
    supportsImages: true,
    description: "Vista de arquitectura con nodos enriquecidos mediante iconos locales.",
    useWhen: "Un documento tecnico necesita reconocer capas o servicios rapidamente.",
    avoidWhen: "El lector necesita detalle de secuencia paso a paso.",
    code: `flowchart LR
  user@{ icon: "lucide:user", form: "circle", label: "Usuario", pos: "t", h: 54 }
  app@{ icon: "lucide:monitor", form: "rounded", label: "KnowNext.ai", pos: "t", h: 54 }
  docs@{ icon: "lucide:file-text", form: "rounded", label: "Documentos", pos: "t", h: 54 }
  ai@{ icon: "lucide:sparkles", form: "circle", label: "IA", pos: "t", h: 54 }
  user --> app --> docs
  app --> ai
  ai --> app`,
  },
  {
    id: "sequence-collaboration",
    label: "Secuencia",
    diagramType: "sequenceDiagram",
    category: "core",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Interacciones entre actores, sistemas o servicios a lo largo del tiempo.",
    useWhen: "Importa el orden de mensajes y respuestas.",
    avoidWhen: "Solo hay relaciones estaticas.",
    code: `sequenceDiagram
  participant Usuario
  participant App
  participant Runtime
  Usuario->>App: Solicita contenido
  App->>Runtime: Envia contexto
  Runtime-->>App: Devuelve propuesta
  App-->>Usuario: Muestra revision`,
  },
  {
    id: "class-domain",
    label: "Clases / modelo",
    diagramType: "classDiagram",
    category: "technical",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Entidades, atributos, metodos y relaciones de dominio.",
    useWhen: "Hay un modelo conceptual o tecnico que documentar.",
    avoidWhen: "El objetivo es explicar comportamiento temporal.",
    code: `classDiagram
  class Proyecto {
    +string id
    +string nombre
  }
  class Documento {
    +string ruta
    +guardar()
  }
  Proyecto "1" --> "*" Documento`,
  },
  {
    id: "state-lifecycle",
    label: "Estados",
    diagramType: "stateDiagram-v2",
    category: "core",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Ciclos de vida, estados de UI y maquinas de estado.",
    useWhen: "Un objeto cambia entre estados definidos.",
    avoidWhen: "Solo hay una lista de tareas sin transiciones.",
    code: `stateDiagram-v2
  [*] --> Borrador
  Borrador --> Revisado: guardar
  Revisado --> Publicado: exportar
  Revisado --> Borrador: editar
  Publicado --> [*]`,
  },
  {
    id: "er-data-model",
    label: "Entidad relacion",
    diagramType: "erDiagram",
    category: "technical",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Relaciones entre entidades de datos.",
    useWhen: "Necesitas documentar persistencia o datos maestros.",
    avoidWhen: "La audiencia no necesita cardinalidades.",
    code: `erDiagram
  PROJECT ||--o{ DOCUMENT : contains
  PROJECT {
    string id
    string name
  }
  DOCUMENT {
    string id
    string path
  }`,
  },
  {
    id: "journey-product",
    label: "Journey",
    diagramType: "journey",
    category: "business",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Experiencias de usuario por fases y puntos de friccion.",
    useWhen: "Quieres evaluar calidad de experiencia en un flujo.",
    avoidWhen: "Necesitas precision tecnica de llamadas.",
    code: `journey
  title Flujo de documentacion
  section Crear
    Redactar contenido: 4: Usuario
    Insertar diagrama: 5: Usuario
  section Exportar
    Generar PDF/DOCX: 5: KnowNext`,
  },
  {
    id: "gantt-plan",
    label: "Gantt",
    diagramType: "gantt",
    category: "business",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Planificacion temporal con tareas, hitos y dependencias.",
    useWhen: "Hay fechas, duraciones y fases.",
    avoidWhen: "No hay calendario real.",
    code: `gantt
  title Plan de entrega
  dateFormat  YYYY-MM-DD
  section Producto
    Diseno UX       :a1, 2026-06-08, 3d
    Implementacion  :after a1, 5d
    Validacion      :after a1, 2d`,
  },
  {
    id: "pie-mix",
    label: "Circular",
    diagramType: "pie",
    category: "data",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Distribuciones simples con pocas categorias.",
    useWhen: "Quieres mostrar participacion relativa.",
    avoidWhen: "Hay muchas categorias o valores pequenos.",
    code: `pie showData
  title Uso del tiempo
  "Analisis" : 35
  "Implementacion" : 45
  "Validacion" : 20`,
  },
  {
    id: "quadrant-priorities",
    label: "Cuadrante",
    diagramType: "quadrantChart",
    category: "business",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Priorizacion en dos ejes.",
    useWhen: "Comparas impacto, esfuerzo, riesgo o urgencia.",
    avoidWhen: "Necesitas valores numericos precisos.",
    code: `quadrantChart
  title Priorizacion de mejoras
  x-axis Bajo esfuerzo --> Alto esfuerzo
  y-axis Bajo impacto --> Alto impacto
  quadrant-1 Planificar
  quadrant-2 Priorizar
  quadrant-3 Evitar
  quadrant-4 Rapido
  "Catalogo de ejemplos": [0.35, 0.78]
  "Iconos locales": [0.55, 0.72]
  "Imagenes externas": [0.82, 0.35]`,
  },
  {
    id: "requirement-traceability",
    label: "Requisitos",
    diagramType: "requirementDiagram",
    category: "technical",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Trazabilidad entre requisitos, elementos y pruebas.",
    useWhen: "Necesitas documentar cobertura o cumplimiento.",
    avoidWhen: "El contenido es narrativo.",
    code: `requirementDiagram
  requirement exportacion {
    id: REQ-01
    text: Los diagramas se exportan a PDF y DOCX
    risk: medium
    verifymethod: test
  }
  element renderer {
    type: component
  }
  renderer - satisfies -> exportacion`,
  },
  {
    id: "gitgraph-release",
    label: "Git graph",
    diagramType: "gitGraph",
    category: "technical",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Historial conceptual de versiones.",
    useWhen: "Quieres explicar entregas, commits o evoluciones.",
    avoidWhen: "No quieres introducir conceptos de Git al usuario final.",
    code: `gitGraph
  commit id: "inicio"
  commit id: "diagramas"
  branch release
  checkout release
  commit id: "validacion"
  checkout main
  merge release`,
  },
  {
    id: "mindmap-concepts",
    label: "Mapa mental",
    diagramType: "mindmap",
    category: "business",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Ideas, taxonomias y estructura conceptual.",
    useWhen: "Quieres organizar conceptos alrededor de un tema.",
    avoidWhen: "Necesitas relaciones cruzadas precisas.",
    code: `mindmap
  root((Diagramas))
    Procesos
      Flujo
      Secuencia
    Producto
      Journey
      Cuadrante
    Datos
      ER
      Pie`,
  },
  {
    id: "timeline-history",
    label: "Linea temporal",
    diagramType: "timeline",
    category: "business",
    maturity: "stable",
    recommendedProfile: "compatible",
    supportsIcons: false,
    supportsImages: false,
    description: "Hitos por periodo.",
    useWhen: "Hay una evolucion cronologica.",
    avoidWhen: "Necesitas duraciones y dependencias exactas.",
    code: `timeline
  title Evolucion de la capacidad
  2026-06-01 : Insercion Mermaid
  2026-06-05 : Exportacion PDF y DOCX
  2026-06-07 : Catalogo y perfiles visuales`,
  },
  {
    id: "c4-context",
    label: "C4 contexto",
    diagramType: "C4Context",
    category: "technical",
    maturity: "advanced",
    recommendedProfile: "visual_local",
    supportsIcons: false,
    supportsImages: false,
    description: "Contexto de sistemas y actores.",
    useWhen: "Documentas arquitectura a nivel producto/sistema.",
    avoidWhen: "Necesitas detalle interno de componentes.",
    code: `C4Context
  title Contexto KnowNext.ai
  Person(user, "Usuario", "Redacta y revisa documentos")
  System(app, "KnowNext.ai", "Editor documental local")
  System_Ext(ai, "Proveedor IA", "Genera propuestas estructuradas")
  Rel(user, app, "Edita y consulta")
  Rel(app, ai, "Solicita contenido con contexto")`,
  },
  {
    id: "xychart-metrics",
    label: "XY chart",
    diagramType: "xychart-beta",
    category: "data",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Series numericas sencillas directamente en Mermaid.",
    useWhen: "Necesitas tendencia ligera sin crear una hoja de calculo.",
    avoidWhen: "La grafica requiere precision o multiples ejes.",
    code: `xychart-beta
  title "Tiempo de validacion"
  x-axis ["Dia 1", "Dia 2", "Dia 3", "Dia 4"]
  y-axis "Minutos" 0 --> 60
  line [45, 34, 28, 22]`,
  },
  {
    id: "sankey-flow",
    label: "Sankey",
    diagramType: "sankey-beta",
    category: "data",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Flujos ponderados entre etapas.",
    useWhen: "Hay volumen que se mueve entre categorias.",
    avoidWhen: "Solo quieres mostrar orden de pasos.",
    code: `sankey-beta
  Consulta,Respuesta,80
  Consulta,Propuesta,45
  Propuesta,Documento,35
  Documento,Exportacion,25`,
  },
  {
    id: "block-layout",
    label: "Bloques",
    diagramType: "block-beta",
    category: "technical",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Composicion espacial de bloques.",
    useWhen: "Quieres explicar disposicion logica de modulos.",
    avoidWhen: "Hay relaciones complejas o muchos conectores.",
    code: `block-beta
  columns 3
  input["Entrada"] space runtime["Runtime"]
  space editor["Editor"] space
  export["Exportacion"] space ai["IA"]`,
  },
  {
    id: "kanban-work",
    label: "Kanban",
    diagramType: "kanban",
    category: "business",
    maturity: "advanced",
    recommendedProfile: "visual_local",
    supportsIcons: false,
    supportsImages: false,
    description: "Trabajo por columnas de estado.",
    useWhen: "Quieres explicar un tablero o pipeline operativo.",
    avoidWhen: "Necesitas fechas de planificacion.",
    code: `kanban
  Pendiente
    [Definir perfiles]
    [Crear ejemplos]
  En curso
    [Validar render]
  Hecho
    [Exportar diagramas]`,
  },
  {
    id: "architecture-beta-local",
    label: "Arquitectura Mermaid",
    diagramType: "architecture-beta",
    category: "technical",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: true,
    supportsImages: false,
    description: "Arquitectura con grupos, servicios y conexiones.",
    useWhen: "El lector espera una vista moderna de arquitectura.",
    avoidWhen: "Necesitas maxima compatibilidad entre versiones Mermaid.",
    code: `architecture-beta
  group app(lucide:boxes)[Aplicacion]
  service ui(lucide:monitor)[React UI] in app
  service runtime(lucide:cpu)[Tauri Rust] in app
  service docs(lucide:file-text)[Documentos] in app
  service ai(lucide:sparkles)[IA]
  ui:R -- L:runtime
  runtime:B -- T:docs
  runtime:R -- L:ai`,
  },
  {
    id: "packet-structure",
    label: "Paquete",
    diagramType: "packet-beta",
    category: "technical",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Estructura de paquetes o mensajes.",
    useWhen: "Documentas campos de un payload o mensaje.",
    avoidWhen: "El mensaje se entiende mejor como JSON literal.",
    code: `packet-beta
  title Payload IA
  0-15: "action"
  16-47: "summary"
  48-95: "diagramCode"`,
  },
  {
    id: "radar-capabilities",
    label: "Radar",
    diagramType: "radar-beta",
    category: "data",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Comparacion radial de capacidades.",
    useWhen: "Quieres evaluar equilibrio entre dimensiones.",
    avoidWhen: "Hay datos exactos que requieren tabla o grafica formal.",
    code: `radar-beta
  title Capacidades
  axis UX, Exportacion, IA, Compatibilidad, Seguridad
  Visual local: 5, 4, 5, 4, 4
  Compatible: 3, 5, 3, 5, 5`,
  },
  {
    id: "treemap-assets",
    label: "Treemap",
    diagramType: "treemap-beta",
    category: "data",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Jerarquias cuantitativas por superficie.",
    useWhen: "Quieres mostrar peso relativo dentro de grupos.",
    avoidWhen: "La jerarquia tiene relaciones cruzadas.",
    code: `treemap-beta
  "Documento"
    "Texto": 45
    "Diagramas": 25
    "Imagenes": 20
    "Tablas": 10`,
  },
  {
    id: "venn-overlap",
    label: "Venn",
    diagramType: "venn-beta",
    category: "business",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Solapes conceptuales entre conjuntos.",
    useWhen: "Quieres explicar intersecciones de capacidades.",
    avoidWhen: "Necesitas cantidades exactas o mas de pocos conjuntos.",
    code: `venn-beta
  title Capacidades documentales
  "Texto": 45
  "Imagenes": 25
  "Diagramas": 30
  "Texto" & "Diagramas": 12
  "Imagenes" & "Diagramas": 8`,
  },
  {
    id: "zenuml-api",
    label: "ZenUML",
    diagramType: "zenuml",
    category: "technical",
    maturity: "advanced",
    recommendedProfile: "visual_local",
    supportsIcons: false,
    supportsImages: false,
    description: "Secuencias compactas con sintaxis orientada a llamadas.",
    useWhen: "La audiencia tecnica prefiere llamadas anidadas.",
    avoidWhen: "La secuencia debe ser muy accesible para negocio.",
    code: `zenuml
  title Guardado documental
  Usuario->App.guardar()
  App->Runtime.persistir()
  Runtime-->App: ok`,
  },
  {
    id: "ishikawa-quality",
    label: "Ishikawa",
    diagramType: "ishikawa",
    category: "business",
    maturity: "advanced",
    recommendedProfile: "visual_local",
    supportsIcons: false,
    supportsImages: false,
    description: "Causa-raiz y analisis de calidad.",
    useWhen: "Quieres ordenar posibles causas de un problema.",
    avoidWhen: "Hay una unica cadena causal clara.",
    code: `ishikawa
  title Diagrama no renderiza
  Render
    Mermaid
    Iconos
  Contenido
    Sintaxis
    Metadatos
  Exportacion
    SVG
    PNG`,
  },
  {
    id: "wardley-strategy",
    label: "Wardley",
    diagramType: "wardley",
    category: "business",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Estrategia y evolucion de capacidades.",
    useWhen: "Quieres analizar madurez y valor para el usuario.",
    avoidWhen: "Necesitas un roadmap con fechas.",
    code: `wardley
  title Capacidades KnowNext
  anchor Usuario [0.95, 0.65]
  component Documentos [0.82, 0.58]
  component Diagramas [0.68, 0.45]
  component Exportacion [0.52, 0.38]
  Usuario->Documentos
  Documentos->Diagramas
  Diagramas->Exportacion`,
  },
  {
    id: "eventmodeling-flow",
    label: "Event modeling",
    diagramType: "eventmodeling",
    category: "technical",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Eventos, comandos y vistas en flujos de producto.",
    useWhen: "Documentas comportamiento dirigido por eventos.",
    avoidWhen: "El equipo no usa modelado por eventos.",
    code: `flowchart LR
  C["Comando: insertar diagrama"] --> E["Evento: diagrama insertado"]
  E --> V["Vista: documento actualizado"]
  V --> Q["Consulta: exportar documento"]`,
  },
  {
    id: "treeview-structure",
    label: "Arbol",
    diagramType: "treeview",
    category: "business",
    maturity: "beta",
    recommendedProfile: "advanced",
    supportsIcons: false,
    supportsImages: false,
    description: "Estructuras jerarquicas simples.",
    useWhen: "Quieres mostrar una taxonomia o arbol de archivos.",
    avoidWhen: "Hay relaciones no jerarquicas.",
    code: `mindmap
  root((Proyecto))
    Documentos
      Informe.md
      Notas.md
    Assets
      generated
      diagrams`,
  },
];

export const diagramIconExamples = [
  { id: "lucide:user", label: "Usuario" },
  { id: "lucide:monitor", label: "Aplicacion" },
  { id: "lucide:file-text", label: "Documento" },
  { id: "lucide:database", label: "Base de datos" },
  { id: "lucide:cloud", label: "Cloud" },
  { id: "lucide:cpu", label: "Runtime" },
  { id: "lucide:shield-check", label: "Seguridad" },
  { id: "lucide:sparkles", label: "IA" },
];

export function diagramProfileLabel(profile: DiagramVisualProfile) {
  if (profile === "compatible") return "Maxima compatibilidad";
  if (profile === "advanced") return "Experimental controlado";
  return "Visual local";
}

export function templateAllowedByConfig(template: MermaidDiagramTemplate, config: AiDiagramConfig) {
  if (!config.enabled) return false;
  if (template.maturity === "beta" && config.betaPolicy === "disabled") return false;
  if (template.supportsIcons && template.recommendedProfile !== "compatible" && config.visualProfile === "compatible") return false;
  return true;
}

export function validateMermaidPolicy(code: string, config: AiDiagramConfig): MermaidPolicyValidation {
  const normalized = code.toLowerCase();
  const warnings: string[] = [];
  if (!config.enabled) return { valid: false, error: "La capacidad de diagramas esta desactivada en configuracion.", warnings };
  if (config.visualProfile === "compatible" && /\bicon\s*:|@{\s*icon\b|\bimage\s*:|@{\s*img\b/.test(normalized)) {
    return { valid: false, error: "El perfil de maxima compatibilidad no permite iconos ni imagenes dentro del diagrama.", warnings };
  }
  if (config.iconSet === "none" && /\bicon\s*:|@{\s*icon\b|lucide:/.test(normalized)) {
    return { valid: false, error: "Los iconos estan desactivados para diagramas.", warnings };
  }
  if (config.imagePolicy === "disabled" && /\bimage\s*:|@{\s*img\b/.test(normalized)) {
    return { valid: false, error: "Las imagenes dentro de diagramas estan desactivadas.", warnings };
  }
  if (config.imagePolicy !== "external_confirm" && /https?:\/\//i.test(code)) {
    return { valid: false, error: "Los diagramas no pueden cargar imagenes externas con la politica actual.", warnings };
  }
  if (config.betaPolicy !== "enabled" && /\b(beta|architecture-beta|xychart-beta|sankey-beta|block-beta|packet-beta|radar-beta|treemap-beta|venn-beta)\b/i.test(code)) {
    warnings.push(config.betaPolicy === "disabled"
      ? "Este diagrama usa sintaxis beta y puede no estar disponible con la politica actual."
      : "Este diagrama usa sintaxis beta; revisa la vista previa antes de insertarlo.");
  }
  return { valid: true, error: null, warnings };
}
