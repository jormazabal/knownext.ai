use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub source: String,
    pub description: String,
    pub categories: Vec<String>,
    pub capabilities: Vec<String>,
    pub output_actions: Vec<String>,
    pub requires: Vec<String>,
    pub validators: Vec<String>,
    #[serde(default)]
    pub orchestrates_skills: Vec<String>,
    #[serde(default)]
    pub auxiliary_skill_categories: Vec<String>,
    #[serde(default)]
    pub required_capabilities: Vec<String>,
    #[serde(default)]
    pub modes: Vec<AiSkillMode>,
    #[serde(default)]
    pub runtime_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillMode {
    pub id: String,
    pub name: String,
    pub description: String,
    pub when_to_use: Vec<String>,
    pub when_not_to_use: Vec<String>,
    pub supported_actions: Vec<String>,
    pub requires_capabilities: Vec<String>,
    pub validators: Vec<String>,
    pub risk_level: String,
    pub context_budget: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillExample {
    pub name: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub source: String,
    pub status: String,
    pub visibility: String,
    pub runtime_enabled: bool,
    pub description: String,
    pub categories: Vec<String>,
    pub capabilities: Vec<String>,
    pub output_actions: Vec<String>,
    pub modes: Vec<AiSkillMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MermaidDiagramType {
    pub id: String,
    pub label: String,
    pub family: String,
    pub maturity: String,
    pub aliases: Vec<String>,
    pub required_policy: String,
    pub validator_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillDetail {
    #[serde(flatten)]
    pub summary: AiSkillSummary,
    pub manifest: AiSkillManifest,
    pub manifest_json: String,
    pub instructions_markdown: String,
    pub examples: Vec<AiSkillExample>,
    pub diagnostics: Vec<AiSkillDiagnostic>,
    pub mermaid_catalog: Vec<MermaidDiagramType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillDiagnostic {
    pub skill_id: String,
    pub status: String,
    pub title: String,
    pub notes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validator_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillApplication {
    pub skill_id: String,
    pub mode_id: String,
    pub action: String,
    pub status: String,
    pub reason: String,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillValidationResponse {
    pub skill_id: String,
    pub status: String,
    pub diagnostics: Vec<AiSkillDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillSelectorChoice {
    pub skill_id: String,
    pub mode_id: String,
    pub action: String,
    pub confidence: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillSelectorProposal {
    #[serde(default)]
    pub selected: Vec<AiSkillSelectorChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillSelectionPreview {
    pub status: String,
    pub selector_status: String,
    pub candidate_skills: Vec<AiSkillSummary>,
    pub proposed: Vec<AiSkillSelectorChoice>,
    pub applications: Vec<AiSkillApplication>,
    pub diagnostics: Vec<AiSkillDiagnostic>,
    pub prompt_guidance: String,
}

#[derive(Debug, Clone)]
pub struct SkillRuntimeContext {
    pub used_skill_ids: Vec<String>,
    pub applications: Vec<AiSkillApplication>,
    pub diagnostics: Vec<AiSkillDiagnostic>,
    pub prompt_guidance: String,
}

#[derive(Debug, Clone)]
struct BaseSkillSource {
    manifest_json: &'static str,
    instructions_markdown: &'static str,
    examples: &'static [(&'static str, &'static str)],
}

#[derive(Debug, Clone)]
struct LoadedSkill {
    source: BaseSkillSource,
    manifest: Result<AiSkillManifest, String>,
}

const BASE_SKILLS: &[BaseSkillSource] = &[
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.research_report/manifest.json"),
        instructions_markdown: include_str!("base/knownext.research_report/SKILL.md"),
        examples: &[(
            "informe-profesional.md",
            include_str!("base/knownext.research_report/examples/informe-profesional.md"),
        )],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.mermaid/manifest.json"),
        instructions_markdown: include_str!("base/knownext.mermaid/SKILL.md"),
        examples: &[(
            "flowchart-basico.md",
            include_str!("base/knownext.mermaid/examples/flowchart-basico.md"),
        )],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.markdown/manifest.json"),
        instructions_markdown: include_str!("base/knownext.markdown/SKILL.md"),
        examples: &[(
            "tabla-comparativa.md",
            include_str!("base/knownext.markdown/examples/tabla-comparativa.md"),
        )],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.document.review/manifest.json"),
        instructions_markdown: include_str!("base/knownext.document.review/SKILL.md"),
        examples: &[],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.document.compose/manifest.json"),
        instructions_markdown: include_str!("base/knownext.document.compose/SKILL.md"),
        examples: &[],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.document.edit/manifest.json"),
        instructions_markdown: include_str!("base/knownext.document.edit/SKILL.md"),
        examples: &[],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.project.knowledge/manifest.json"),
        instructions_markdown: include_str!("base/knownext.project.knowledge/SKILL.md"),
        examples: &[],
    },
    BaseSkillSource {
        manifest_json: include_str!("base/knownext.governance/manifest.json"),
        instructions_markdown: include_str!("base/knownext.governance/SKILL.md"),
        examples: &[],
    },
];

pub fn list_ai_skills_json() -> Value {
    json!({ "skills": list_ai_skills() })
}

pub fn list_ai_skills() -> Vec<AiSkillSummary> {
    load_skills()
        .into_iter()
        .map(|skill| skill_summary(&skill))
        .collect()
}

pub fn get_ai_skill_json(skill_id: &str) -> Option<Value> {
    get_ai_skill(skill_id).map(|skill| json!(skill))
}

pub fn get_ai_skill(skill_id: &str) -> Option<AiSkillDetail> {
    load_skills()
        .into_iter()
        .find(|skill| skill_id_for_loaded(skill).as_deref() == Some(skill_id))
        .map(|skill| skill_detail(&skill))
}

pub fn validate_ai_skill_json(skill_id: &str) -> Option<Value> {
    validate_ai_skill(skill_id).map(|validation| json!(validation))
}

pub fn validate_ai_skill(skill_id: &str) -> Option<AiSkillValidationResponse> {
    get_ai_skill(skill_id).map(|skill| AiSkillValidationResponse {
        skill_id: skill.summary.id,
        status: skill.summary.status,
        diagnostics: skill.diagnostics,
    })
}

pub fn validate_manifest_json(manifest_json: &str) -> AiSkillValidationResponse {
    match parse_manifest(manifest_json) {
        Ok(manifest) => AiSkillValidationResponse {
            skill_id: manifest.id.clone(),
            status: "valid".to_string(),
            diagnostics: vec![valid_diagnostic(&manifest.id)],
        },
        Err(error) => AiSkillValidationResponse {
            skill_id: "invalid-skill".to_string(),
            status: "error".to_string(),
            diagnostics: vec![diagnostic(
                "invalid-skill",
                "",
                "error",
                "validation",
                "error",
                "Manifest invalido",
                vec![error],
                None,
            )],
        },
    }
}

pub fn selection_preview_json(body: &Value) -> Value {
    let proposal = parse_selector_proposal(body.get("selectorProposal")).unwrap_or_default();
    let preview = selection_preview(body, Some(&proposal), "preview");
    json!(preview)
}

pub fn selection_preview(
    payload: &Value,
    proposal: Option<&AiSkillSelectorProposal>,
    selector_status: &str,
) -> AiSkillSelectionPreview {
    let candidates = prefilter_skills(payload);
    let context = select_skills_for_request(payload, proposal);
    AiSkillSelectionPreview {
        status: "ok".to_string(),
        selector_status: selector_status.to_string(),
        candidate_skills: candidates,
        proposed: proposal
            .map(|value| value.selected.clone())
            .unwrap_or_default(),
        applications: context.applications,
        diagnostics: context.diagnostics,
        prompt_guidance: context.prompt_guidance,
    }
}

pub fn selector_candidates_json(payload: &Value) -> Value {
    json!({ "candidateSkills": prefilter_skills(payload) })
}

pub fn parse_selector_proposal(value: Option<&Value>) -> Option<AiSkillSelectorProposal> {
    value.and_then(|value| serde_json::from_value::<AiSkillSelectorProposal>(value.clone()).ok())
}

pub fn select_skills_for_request(
    payload: &Value,
    proposal: Option<&AiSkillSelectorProposal>,
) -> SkillRuntimeContext {
    let candidates = prefilter_skills(payload);
    let mut diagnostics = candidates
        .iter()
        .map(|skill| {
            diagnostic(
                &skill.id,
                "",
                "candidate",
                "prefilter",
                "info",
                "Skill candidata",
                vec!["La configuracion runtime permite considerar esta skill.".to_string()],
                None,
            )
        })
        .collect::<Vec<_>>();

    let execution_mode = payload
        .get("executionMode")
        .and_then(Value::as_str)
        .unwrap_or("quick");
    let expected_action = payload
        .get("expectedAction")
        .and_then(Value::as_str)
        .unwrap_or("");
    let limit = if expected_action == "create_research_report" {
        6
    } else if execution_mode == "reasoning" {
        2
    } else {
        1
    };
    let mut applications = Vec::new();

    if let Some(proposal) = proposal {
        for choice in &proposal.selected {
            if applications.len() >= limit {
                diagnostics.push(diagnostic(
                    &choice.skill_id,
                    &choice.mode_id,
                    "rejected",
                    "policy",
                    "warning",
                    "Limite de skills alcanzado",
                    vec![format!(
                        "El modo {execution_mode} acepta como maximo {limit} skill(s)."
                    )],
                    None,
                ));
                continue;
            }
            match accept_choice(&candidates, choice, payload) {
                Ok(application) => {
                    diagnostics.push(diagnostic(
                        &application.skill_id,
                        &application.mode_id,
                        "applied",
                        "policy",
                        "info",
                        "Skill aceptada",
                        vec![application.reason.clone()],
                        None,
                    ));
                    applications.push(application);
                }
                Err(reason) => diagnostics.push(diagnostic(
                    &choice.skill_id,
                    &choice.mode_id,
                    "rejected",
                    "policy",
                    "warning",
                    "Skill rechazada",
                    vec![reason],
                    None,
                )),
            }
        }
    }

    if applications.is_empty() {
        applications.extend(deterministic_fallback(
            payload,
            &candidates,
            limit,
            &mut diagnostics,
        ));
    }

    let mut used_skill_ids = applications
        .iter()
        .filter(|application| application.status == "applied")
        .map(|application| application.skill_id.clone())
        .collect::<Vec<_>>();
    used_skill_ids = unique(used_skill_ids);

    let prompt_guidance = compose_prompt_guidance(&applications, payload);
    SkillRuntimeContext {
        used_skill_ids,
        applications,
        diagnostics,
        prompt_guidance,
    }
}

/// Compatibility wrapper retained for consumers that still pass an expected diagram type.
pub fn resolve_for_request(
    payload: &Value,
    expected_diagram_type: Option<&str>,
) -> SkillRuntimeContext {
    let proposal = expected_diagram_type.map(|diagram_type| AiSkillSelectorProposal {
        selected: vec![AiSkillSelectorChoice {
            skill_id: "knownext.mermaid".to_string(),
            mode_id: mermaid_mode_for_type(diagram_type).to_string(),
            action: "insert_diagram".to_string(),
            confidence: "high".to_string(),
            reason: "Tipo de diagrama esperado por el runtime.".to_string(),
        }],
    });
    select_skills_for_request(payload, proposal.as_ref())
}

pub fn validate_mermaid_diagram(
    code: &str,
    diagram_type: Option<&str>,
    payload: &Value,
) -> Vec<AiSkillDiagnostic> {
    let mode_id = diagram_type
        .map(mermaid_mode_for_type)
        .unwrap_or_else(|| mermaid_mode_for_type(infer_mermaid_type(&normalize_code(code))));
    let mut diagnostics = vec![diagnostic(
        "knownext.mermaid",
        mode_id,
        "applied",
        "validation",
        "info",
        "Validador Mermaid aplicado",
        vec!["La propuesta se valida contra la politica de diagramas activa.".to_string()],
        Some("mermaid.policy"),
    )];
    let config = payload
        .pointer("/clientContext/diagramConfig")
        .or_else(|| payload.pointer("/runtimeAi/diagrams"));
    let enabled = config
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    if !enabled {
        diagnostics.push(diagnostic(
            "knownext.mermaid",
            mode_id,
            "error",
            "validation",
            "error",
            "Diagramas desactivados",
            vec![
                "La propuesta Mermaid no puede aplicarse porque los diagramas estan desactivados."
                    .to_string(),
            ],
            Some("mermaid.policy"),
        ));
        return diagnostics;
    }

    let normalized = normalize_code(code);
    if code.trim_start().starts_with("```") || code.contains("```mermaid") {
        diagnostics.push(diagnostic(
            "knownext.mermaid",
            mode_id,
            "error",
            "validation",
            "error",
            "Codigo Mermaid con fences",
            vec!["diagramCode debe contener solo Mermaid, sin bloques ```mermaid.".to_string()],
            Some("mermaid.policy"),
        ));
    }

    let beta_policy = config_string(config, "betaPolicy", "ask");
    let diagram_type = diagram_type.unwrap_or_else(|| infer_mermaid_type(&normalized));
    if diagram_type.contains("beta") && beta_policy == "disabled" {
        diagnostics.push(diagnostic(
            "knownext.mermaid",
            mode_id,
            "error",
            "validation",
            "error",
            "Tipo beta bloqueado",
            vec![format!(
                "{diagram_type} no esta permitido con la politica beta actual."
            )],
            Some("mermaid.policy"),
        ));
    }

    if diagram_type == "architecture-beta" && looks_like_flowchart_edges(&normalized) {
        diagnostics.push(diagnostic(
            "knownext.mermaid",
            "diagram_structure",
            "error",
            "validation",
            "error",
            "Sintaxis incompatible con architecture-beta",
            vec![
                "architecture-beta usa service/group y conexiones con puertos, no enlaces flowchart tipo A --> B."
                    .to_string(),
            ],
            Some("mermaid.architecture_beta"),
        ));
    }

    let visual_profile = config_string(config, "visualProfile", "visual_local");
    let icon_set = config_string(config, "iconSet", "lucide");
    if (visual_profile == "compatible" || icon_set == "none")
        && (normalized.contains("lucide:") || normalized.contains("icon:"))
    {
        diagnostics.push(diagnostic(
            "knownext.mermaid",
            mode_id,
            "error",
            "validation",
            "error",
            "Iconos no permitidos",
            vec![
                "La configuracion actual no permite iconos dentro de diagramas Mermaid."
                    .to_string(),
            ],
            Some("mermaid.policy"),
        ));
    }

    let image_policy = config_string(config, "imagePolicy", "project_assets");
    if image_policy != "external_confirm"
        && (normalized.contains("http://") || normalized.contains("https://"))
    {
        diagnostics.push(diagnostic(
            "knownext.mermaid",
            mode_id,
            "error",
            "validation",
            "error",
            "URL externa bloqueada",
            vec![
                "Los diagramas no pueden cargar recursos externos con la politica actual."
                    .to_string(),
            ],
            Some("mermaid.policy"),
        ));
    }

    diagnostics
}

pub fn validate_markdown_table(markdown: &str) -> Vec<AiSkillDiagnostic> {
    let mut diagnostics = vec![diagnostic(
        "knownext.markdown",
        "table",
        "applied",
        "validation",
        "info",
        "Validador de tabla Markdown aplicado",
        vec!["Se revisa que la tabla tenga separador y filas consistentes.".to_string()],
        Some("markdown.table.syntax"),
    )];
    let lines = markdown
        .lines()
        .map(str::trim)
        .filter(|line| line.contains('|'))
        .collect::<Vec<_>>();
    if lines.len() < 2 {
        diagnostics.push(diagnostic(
            "knownext.markdown",
            "table",
            "error",
            "validation",
            "error",
            "Tabla Markdown ausente",
            vec!["No se encontro una tabla Markdown suficiente para validar.".to_string()],
            Some("markdown.table.syntax"),
        ));
        return diagnostics;
    }
    let separator_index = lines.iter().position(|line| is_table_separator(line));
    let Some(separator_index) = separator_index else {
        diagnostics.push(diagnostic(
            "knownext.markdown",
            "table",
            "error",
            "validation",
            "error",
            "Separador de tabla ausente",
            vec!["La tabla debe incluir una fila separadora con guiones.".to_string()],
            Some("markdown.table.syntax"),
        ));
        return diagnostics;
    };
    if separator_index == 0 {
        diagnostics.push(diagnostic(
            "knownext.markdown",
            "table",
            "error",
            "validation",
            "error",
            "Cabecera de tabla ausente",
            vec!["La tabla debe incluir una fila de cabecera antes del separador.".to_string()],
            Some("markdown.table.syntax"),
        ));
        return diagnostics;
    }
    let column_count = table_cell_count(lines[separator_index - 1]);
    if column_count < 2 {
        diagnostics.push(diagnostic(
            "knownext.markdown",
            "table",
            "error",
            "validation",
            "error",
            "Tabla con columnas insuficientes",
            vec!["La tabla debe tener al menos dos columnas.".to_string()],
            Some("markdown.table.syntax"),
        ));
        return diagnostics;
    }
    for line in lines.iter().skip(separator_index) {
        if table_cell_count(line) != column_count {
            diagnostics.push(diagnostic(
                "knownext.markdown",
                "table",
                "error",
                "validation",
                "error",
                "Filas de tabla inconsistentes",
                vec!["Todas las filas deben tener el mismo numero de columnas.".to_string()],
                Some("markdown.table.syntax"),
            ));
            break;
        }
    }
    diagnostics
}

pub fn diagnostics_have_errors(diagnostics: &[AiSkillDiagnostic]) -> bool {
    diagnostics.iter().any(|diagnostic| {
        diagnostic.status == "error" || diagnostic.severity.as_deref() == Some("error")
    })
}

pub fn mermaid_catalog() -> Vec<MermaidDiagramType> {
    MERMAID_TYPES
        .iter()
        .map(|item| MermaidDiagramType {
            id: item.id.to_string(),
            label: item.label.to_string(),
            family: item.family.to_string(),
            maturity: item.maturity.to_string(),
            aliases: item
                .aliases
                .iter()
                .map(|alias| (*alias).to_string())
                .collect(),
            required_policy: item.required_policy.to_string(),
            validator_id: item.validator_id.to_string(),
        })
        .collect()
}

fn load_skills() -> Vec<LoadedSkill> {
    BASE_SKILLS
        .iter()
        .cloned()
        .map(|source| LoadedSkill {
            manifest: parse_manifest(source.manifest_json),
            source,
        })
        .collect()
}

fn parse_manifest(manifest_json: &str) -> Result<AiSkillManifest, String> {
    let raw = serde_json::from_str::<Value>(manifest_json)
        .map_err(|error| format!("No se pudo leer manifest.json: {error}"))?;
    let schema_version = raw
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(1);
    let manifest = if schema_version == 1 {
        manifest_v1_to_v2(raw)?
    } else {
        serde_json::from_value::<AiSkillManifest>(raw)
            .map_err(|error| format!("No se pudo leer manifest.json: {error}"))?
    };
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn manifest_v1_to_v2(raw: Value) -> Result<AiSkillManifest, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ManifestV1 {
        schema_version: u32,
        id: String,
        name: String,
        version: String,
        source: String,
        description: String,
        categories: Vec<String>,
        capabilities: Vec<String>,
        output_actions: Vec<String>,
        requires: Vec<String>,
        validators: Vec<String>,
    }
    let v1 = serde_json::from_value::<ManifestV1>(raw)
        .map_err(|error| format!("No se pudo leer manifest v1: {error}"))?;
    Ok(AiSkillManifest {
        schema_version: v1.schema_version,
        id: v1.id,
        name: v1.name,
        version: v1.version,
        source: v1.source,
        description: v1.description,
        categories: v1.categories,
        capabilities: v1.capabilities,
        output_actions: v1.output_actions,
        requires: v1.requires,
        validators: v1.validators,
        orchestrates_skills: vec![],
        auxiliary_skill_categories: vec![],
        required_capabilities: vec![],
        modes: vec![],
        runtime_enabled: false,
    })
}

fn validate_manifest(manifest: &AiSkillManifest) -> Result<(), String> {
    if manifest.schema_version != 1 && manifest.schema_version != 2 {
        return Err("schemaVersion debe ser 1 o 2.".to_string());
    }
    if !manifest.id.starts_with("knownext.") {
        return Err("id debe empezar por knownext.".to_string());
    }
    if !matches!(manifest.source.as_str(), "base" | "user" | "imported") {
        return Err("source debe ser base, user o imported.".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("name es obligatorio.".to_string());
    }
    if manifest.version.trim().is_empty() {
        return Err("version es obligatoria.".to_string());
    }
    if manifest.description.trim().is_empty() {
        return Err("description es obligatoria.".to_string());
    }
    if manifest.categories.is_empty()
        || manifest.capabilities.is_empty()
        || manifest.output_actions.is_empty()
    {
        return Err(
            "categories, capabilities y outputActions deben tener al menos un valor.".to_string(),
        );
    }
    let mut mode_ids = BTreeSet::new();
    let known_validators = known_validators();
    let known_capabilities = known_capabilities();
    for mode in &manifest.modes {
        if mode.id.trim().is_empty() || !mode_ids.insert(mode.id.clone()) {
            return Err(format!("Modo duplicado o invalido en {}.", manifest.id));
        }
        if mode.name.trim().is_empty()
            || mode.description.trim().is_empty()
            || mode.supported_actions.is_empty()
            || mode.validators.is_empty()
        {
            return Err(format!("Modo {} incompleto.", mode.id));
        }
        if !matches!(mode.risk_level.as_str(), "low" | "medium" | "high") {
            return Err(format!("Modo {} tiene riskLevel invalido.", mode.id));
        }
        for validator in &mode.validators {
            if !known_validators.contains(validator.as_str()) {
                return Err(format!("Validador inexistente: {validator}."));
            }
        }
        for capability in &mode.requires_capabilities {
            if !known_capabilities.contains(capability.as_str()) {
                return Err(format!("Capacidad inexistente: {capability}."));
            }
        }
    }
    Ok(())
}

fn skill_summary(skill: &LoadedSkill) -> AiSkillSummary {
    match &skill.manifest {
        Ok(manifest) => AiSkillSummary {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            source: manifest.source.clone(),
            status: "valid".to_string(),
            visibility: if manifest.source == "base" {
                "readonly"
            } else {
                "editable"
            }
            .to_string(),
            runtime_enabled: manifest.runtime_enabled,
            description: manifest.description.clone(),
            categories: manifest.categories.clone(),
            capabilities: manifest.capabilities.clone(),
            output_actions: manifest.output_actions.clone(),
            modes: manifest.modes.clone(),
        },
        Err(error) => AiSkillSummary {
            id: fallback_skill_id(skill.source.manifest_json),
            name: "Skill base invalida".to_string(),
            version: "0.0.0".to_string(),
            source: "base".to_string(),
            status: "error".to_string(),
            visibility: "readonly".to_string(),
            runtime_enabled: false,
            description: error.clone(),
            categories: vec![],
            capabilities: vec![],
            output_actions: vec![],
            modes: vec![],
        },
    }
}

fn skill_detail(skill: &LoadedSkill) -> AiSkillDetail {
    let summary = skill_summary(skill);
    let manifest = skill.manifest.clone().unwrap_or_else(|_| AiSkillManifest {
        schema_version: 2,
        id: summary.id.clone(),
        name: summary.name.clone(),
        version: summary.version.clone(),
        source: summary.source.clone(),
        description: summary.description.clone(),
        categories: summary.categories.clone(),
        capabilities: summary.capabilities.clone(),
        output_actions: summary.output_actions.clone(),
        requires: vec![],
        validators: vec![],
        orchestrates_skills: vec![],
        auxiliary_skill_categories: vec![],
        required_capabilities: vec![],
        modes: vec![],
        runtime_enabled: false,
    });
    let diagnostics = match &skill.manifest {
        Ok(manifest) => vec![valid_diagnostic(&manifest.id)],
        Err(error) => vec![diagnostic(
            &summary.id,
            "",
            "error",
            "validation",
            "error",
            "Manifest invalido",
            vec![error.clone()],
            None,
        )],
    };
    AiSkillDetail {
        summary,
        manifest,
        manifest_json: skill.source.manifest_json.trim().to_string(),
        instructions_markdown: skill.source.instructions_markdown.trim().to_string(),
        examples: skill
            .source
            .examples
            .iter()
            .map(|(name, markdown)| AiSkillExample {
                name: (*name).to_string(),
                markdown: markdown.trim().to_string(),
            })
            .collect(),
        diagnostics,
        mermaid_catalog: if skill_id_for_loaded(skill).as_deref() == Some("knownext.mermaid") {
            mermaid_catalog()
        } else {
            vec![]
        },
    }
}

fn prefilter_skills(payload: &Value) -> Vec<AiSkillSummary> {
    let mut skills = list_ai_skills()
        .into_iter()
        .filter(|skill| skill.status == "valid")
        .filter(|skill| skill.source == "base")
        .collect::<Vec<_>>();
    let diagrams_enabled = diagram_config(payload)
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    skills.retain(|skill| {
        if skill.id == "knownext.mermaid" {
            return diagrams_enabled;
        }
        if !skill.runtime_enabled {
            return true;
        }
        true
    });
    skills
}

fn accept_choice(
    candidates: &[AiSkillSummary],
    choice: &AiSkillSelectorChoice,
    payload: &Value,
) -> Result<AiSkillApplication, String> {
    let skill = candidates
        .iter()
        .find(|skill| skill.id == choice.skill_id)
        .ok_or_else(|| "La skill no esta entre las candidatas permitidas.".to_string())?;
    if !skill.runtime_enabled {
        return Err(
            "La skill es visible pero no esta habilitada para ejecucion runtime.".to_string(),
        );
    }
    let mode = skill
        .modes
        .iter()
        .find(|mode| mode.id == choice.mode_id)
        .ok_or_else(|| "El modo seleccionado no existe en la skill.".to_string())?;
    if !mode
        .supported_actions
        .iter()
        .any(|action| action == &choice.action)
    {
        return Err("La accion no es compatible con el modo seleccionado.".to_string());
    }
    if mode.risk_level == "high"
        && payload.get("executionMode").and_then(Value::as_str) != Some("reasoning")
    {
        return Err("Los modos de alto riesgo requieren modo reasoning.".to_string());
    }
    for capability in &mode.requires_capabilities {
        if capability == "diagrams" && !diagrams_enabled(payload) {
            return Err("La capacidad de diagramas esta desactivada.".to_string());
        }
        if capability == "document_edit" && !permission_enabled(payload, "canEditDocument") {
            return Err("La edicion de documentos no esta permitida.".to_string());
        }
    }
    Ok(AiSkillApplication {
        skill_id: choice.skill_id.clone(),
        mode_id: choice.mode_id.clone(),
        action: choice.action.clone(),
        status: "applied".to_string(),
        reason: choice.reason.clone(),
        confidence: normalize_confidence(&choice.confidence).to_string(),
    })
}

fn deterministic_fallback(
    payload: &Value,
    candidates: &[AiSkillSummary],
    limit: usize,
    diagnostics: &mut Vec<AiSkillDiagnostic>,
) -> Vec<AiSkillApplication> {
    let mut applications = Vec::new();
    let expected_action = payload
        .get("expectedAction")
        .and_then(Value::as_str)
        .unwrap_or("");
    if expected_action == "create_research_report" {
        if candidates
            .iter()
            .any(|skill| skill.id == "knownext.research_report")
        {
            let mode_id = payload
                .pointer("/researchProfile/recommendedReportStyle")
                .and_then(Value::as_str)
                .map(research_report_mode)
                .unwrap_or("profundo");
            applications.push(AiSkillApplication {
                skill_id: "knownext.research_report".to_string(),
                mode_id: mode_id.to_string(),
                action: "create_research_report".to_string(),
                status: "applied".to_string(),
                reason: "Skill base coordinadora para informes de investigación.".to_string(),
                confidence: "high".to_string(),
            });
            diagnostics.push(diagnostic(
                "knownext.research_report",
                mode_id,
                "applied",
                "selection",
                "info",
                "Skill de informe aplicada",
                vec!["La investigación usa el skill base de informe profesional.".to_string()],
                None,
            ));
        }
        if applications.len() < limit
            && candidates
                .iter()
                .any(|skill| skill.id == "knownext.markdown")
        {
            applications.push(AiSkillApplication {
                skill_id: "knownext.markdown".to_string(),
                mode_id: "table".to_string(),
                action: "create_document".to_string(),
                status: "applied".to_string(),
                reason: "Las tablas Markdown están disponibles como recurso base del informe."
                    .to_string(),
                confidence: "medium".to_string(),
            });
        }
        if applications.len() < limit
            && payload
                .pointer("/researchProfile/diagramsEnabled")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            && diagrams_enabled(payload)
            && candidates
                .iter()
                .any(|skill| skill.id == "knownext.mermaid")
        {
            applications.push(AiSkillApplication {
                skill_id: "knownext.mermaid".to_string(),
                mode_id: "diagram_flow".to_string(),
                action: "create_document".to_string(),
                status: "applied".to_string(),
                reason: "El tipo de investigación permite diagramas Mermaid si aportan claridad."
                    .to_string(),
                confidence: "medium".to_string(),
            });
        }
    }
    let expected_diagram_type = payload.get("diagramType").and_then(Value::as_str);
    if expected_diagram_type.is_some() && diagrams_enabled(payload) && applications.len() < limit {
        if candidates
            .iter()
            .any(|skill| skill.id == "knownext.mermaid")
        {
            let mode_id = mermaid_mode_for_type(expected_diagram_type.unwrap_or("flowchart"));
            applications.push(AiSkillApplication {
                skill_id: "knownext.mermaid".to_string(),
                mode_id: mode_id.to_string(),
                action: "insert_diagram".to_string(),
                status: "applied".to_string(),
                reason: "Fallback determinista por tipo de diagrama esperado.".to_string(),
                confidence: "high".to_string(),
            });
            diagnostics.push(diagnostic(
                "knownext.mermaid",
                mode_id,
                "applied",
                "selection",
                "info",
                "Fallback determinista aplicado",
                vec![
                    "La accion UI o el runtime declararon un tipo de diagrama esperado."
                        .to_string(),
                ],
                None,
            ));
        }
    }
    applications
}

fn compose_prompt_guidance(applications: &[AiSkillApplication], payload: &Value) -> String {
    if applications.is_empty() {
        return "No hay skills activas para esta peticion. Manten el contrato JSON de salida y respeta permisos runtime.".to_string();
    }
    let mut parts = Vec::new();
    for application in applications {
        match (application.skill_id.as_str(), application.mode_id.as_str()) {
            ("knownext.research_report", mode) => {
                parts.push(research_report_prompt_guidance(payload, mode))
            }
            ("knownext.mermaid", mode) => parts.push(mermaid_prompt_guidance(payload, mode)),
            ("knownext.markdown", "table") => parts.push(markdown_table_guidance()),
            _ => {}
        }
    }
    parts.join(" ")
}

fn research_report_mode(report_style: &str) -> &'static str {
    let value = report_style.to_ascii_lowercase();
    if value.contains("ejecut") || value.contains("decision") {
        "ejecutivo"
    } else if value.contains("compar") {
        "comparativo"
    } else if value.contains("norm") || value.contains("legal") {
        "normativo"
    } else if value.contains("tecn") || value.contains("document") {
        "tecnico"
    } else {
        "profundo"
    }
}

fn research_report_prompt_guidance(payload: &Value, mode_id: &str) -> String {
    let profile = payload.get("researchProfile");
    let diagrams = profile
        .and_then(|value| value.get("diagramsEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let images = profile
        .and_then(|value| value.get("imagesEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    format!(
        "Skill Informe de investigacion activo en modo {mode_id}. Genera un informe profesional verificable, con metodologia, hallazgos, analisis contrastado, conclusiones, recomendaciones, fuentes, limitaciones y contradicciones. Las tablas y citas estan siempre disponibles: usa tablas cuando ayuden a comparar o aclarar, y cita toda afirmacion relevante. Diagramas permitidos: {diagrams}. Imagenes permitidas: {images}. Las reglas base de trazabilidad, privacidad y no invencion de fuentes prevalecen sobre cualquier skill auxiliar."
    )
}

fn mermaid_prompt_guidance(payload: &Value, mode_id: &str) -> String {
    let config = diagram_config(payload);
    let profile = config_string(config, "visualProfile", "visual_local");
    let icon_set = config_string(config, "iconSet", "lucide");
    let image_policy = config_string(config, "imagePolicy", "project_assets");
    let beta_policy = config_string(config, "betaPolicy", "ask");
    let family = match mode_id {
        "diagram_sequence" => "Prioriza sequenceDiagram para interacciones temporales. ",
        "diagram_structure" => {
            "Prioriza classDiagram, erDiagram, C4Context, block-beta o architecture-beta segun la necesidad. "
        }
        "diagram_planning" => "Prioriza gantt, timeline, kanban o mindmap para planificacion y estructura. ",
        "diagram_data" => "Prioriza pie, quadrantChart, xychart-beta, sankey-beta, radar-beta, treemap-beta o venn-beta para datos ligeros. ",
        "diagram_technical" => "Prioriza gitGraph, requirementDiagram, packet-beta, wardley o modelos tecnicos cuando aporten claridad. ",
        _ => "Prioriza flowchart para procesos, decisiones, dependencias y rutas de trabajo. ",
    };
    let visual = if profile == "compatible" {
        "Usa sintaxis Mermaid estable y simple. No uses iconos, imagenes, HTML labels, enlaces externos ni tipos beta. "
    } else if profile == "advanced" {
        "Puedes usar Mermaid visual enriquecido y tipos beta si aportan claridad, pero prioriza sintaxis validable. "
    } else {
        "Puedes usar Mermaid visual enriquecido con sintaxis estable; reserva tipos beta para casos donde aporten mucho valor. "
    };
    let icons = if icon_set == "lucide" && profile != "compatible" {
        "Si usas iconos, usa solo IDs locales lucide existentes como lucide:user, lucide:monitor, lucide:file-text, lucide:database, lucide:cloud, lucide:cpu, lucide:shield-check o lucide:sparkles. "
    } else {
        "No uses iconos dentro de diagramas. "
    };
    let images = match image_policy.as_str() {
        "external_confirm" if profile == "advanced" => {
            "Evita imagenes externas salvo que el usuario las pida expresamente; no uses CDN para iconos. "
        }
        "project_assets" if profile != "compatible" => {
            "No uses URLs externas en diagramas; referencia solo assets locales del proyecto cuando existan claramente en el contexto. "
        }
        _ => "No uses imagenes dentro de diagramas. ",
    };
    let beta = match beta_policy.as_str() {
        "enabled" if profile == "advanced" => {
            "Puedes usar tipos beta de Mermaid cuando sean la mejor representacion. "
        }
        "ask" if profile != "compatible" => {
            "Evita tipos beta si hay una alternativa estable; si los usas, mantenlos pequenos y editables. "
        }
        _ => "No uses tipos beta de Mermaid. ",
    };
    format!(
        "Skill Mermaid activa en modo {mode_id}. {family}{visual}{icons}{images}{beta} En action insert_diagram, diagramCode debe contener Mermaid valido sin fences."
    )
}

fn markdown_table_guidance() -> String {
    "Skill Markdown activa en modo table. Usa tablas Markdown compactas cuando el usuario pida comparar, resumir o estructurar datos tabulares. Manten filas con el mismo numero de columnas, incluye cabecera y separador, y evita HTML salvo necesidad explicita.".to_string()
}

fn diagram_config(payload: &Value) -> Option<&Value> {
    payload
        .pointer("/clientContext/diagramConfig")
        .or_else(|| payload.pointer("/runtimeAi/diagrams"))
}

fn diagrams_enabled(payload: &Value) -> bool {
    diagram_config(payload)
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn permission_enabled(payload: &Value, key: &str) -> bool {
    payload
        .get("runtimePermissions")
        .and_then(|permissions| permissions.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn config_string(config: Option<&Value>, key: &str, fallback: &str) -> String {
    config
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn normalize_code(code: &str) -> String {
    code.replace("\r\n", "\n")
        .replace('\r', "\n")
        .to_lowercase()
}

fn infer_mermaid_type(code: &str) -> &str {
    code.lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("%%"))
        .and_then(|line| line.split_whitespace().next())
        .unwrap_or("")
}

fn mermaid_mode_for_type(diagram_type: &str) -> &'static str {
    let normalized = diagram_type.to_ascii_lowercase();
    MERMAID_TYPES
        .iter()
        .find(|item| {
            item.id.eq_ignore_ascii_case(&normalized)
                || item
                    .aliases
                    .iter()
                    .any(|alias| alias.eq_ignore_ascii_case(&normalized))
        })
        .map(|item| item.mode_id)
        .unwrap_or("diagram_flow")
}

fn looks_like_flowchart_edges(code: &str) -> bool {
    code.contains("-->") || code.contains("-.->") || code.contains("==>")
}

fn is_table_separator(line: &str) -> bool {
    line.trim_matches('|').split('|').all(|cell| {
        cell.trim()
            .chars()
            .all(|ch| ch == '-' || ch == ':' || ch == ' ')
    })
}

fn table_cell_count(line: &str) -> usize {
    line.trim().trim_matches('|').split('|').count()
}

fn normalize_confidence(value: &str) -> &str {
    match value {
        "high" | "medium" | "low" => value,
        _ => "medium",
    }
}

fn skill_id_for_loaded(skill: &LoadedSkill) -> Option<String> {
    skill
        .manifest
        .as_ref()
        .ok()
        .map(|manifest| manifest.id.clone())
        .or_else(|| Some(fallback_skill_id(skill.source.manifest_json)))
}

fn fallback_skill_id(manifest_json: &str) -> String {
    serde_json::from_str::<Value>(manifest_json)
        .ok()
        .and_then(|value| value.get("id").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| "knownext.invalid-skill".to_string())
}

fn valid_diagnostic(skill_id: &str) -> AiSkillDiagnostic {
    diagnostic(
        skill_id,
        "",
        "applied",
        "validation",
        "info",
        "Skill valida",
        vec!["Manifest, modos y contenido base disponibles.".to_string()],
        None,
    )
}

fn diagnostic(
    skill_id: &str,
    mode_id: &str,
    status: &str,
    phase: &str,
    severity: &str,
    title: &str,
    notes: Vec<String>,
    validator_id: Option<&str>,
) -> AiSkillDiagnostic {
    AiSkillDiagnostic {
        skill_id: skill_id.to_string(),
        status: status.to_string(),
        title: title.to_string(),
        notes,
        phase: Some(phase.to_string()),
        severity: Some(severity.to_string()),
        mode_id: if mode_id.is_empty() {
            None
        } else {
            Some(mode_id.to_string())
        },
        validator_id: validator_id.map(str::to_string),
    }
}

fn unique(values: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn known_validators() -> BTreeSet<&'static str> {
    [
        "mermaid.policy",
        "mermaid.flow",
        "mermaid.sequence",
        "mermaid.structure",
        "mermaid.planning",
        "mermaid.data",
        "mermaid.technical",
        "mermaid.experimental",
        "mermaid.architecture_beta",
        "markdown.table.syntax",
        "markdown.structure",
        "document.review.evidence",
        "document.compose.sections",
        "document.edit.anchor_policy",
        "project.knowledge.sources",
        "governance.privacy",
        "research.report.structure",
        "research.report.citations",
        "research.report.visuals",
    ]
    .into_iter()
    .collect()
}

fn known_capabilities() -> BTreeSet<&'static str> {
    [
        "diagrams",
        "document_edit",
        "document_create",
        "project_context",
        "rag",
        "privacy_scan",
        "markdown",
        "research",
        "citations",
        "image_generation",
        "report_format",
    ]
    .into_iter()
    .collect()
}

struct MermaidTypeSpec {
    id: &'static str,
    label: &'static str,
    family: &'static str,
    maturity: &'static str,
    aliases: &'static [&'static str],
    required_policy: &'static str,
    validator_id: &'static str,
    mode_id: &'static str,
}

const MERMAID_TYPES: &[MermaidTypeSpec] = &[
    MermaidTypeSpec {
        id: "flowchart",
        label: "Flowchart",
        family: "flow",
        maturity: "stable",
        aliases: &["graph"],
        required_policy: "stable",
        validator_id: "mermaid.flow",
        mode_id: "diagram_flow",
    },
    MermaidTypeSpec {
        id: "sequenceDiagram",
        label: "Sequence",
        family: "sequence",
        maturity: "stable",
        aliases: &["sequence"],
        required_policy: "stable",
        validator_id: "mermaid.sequence",
        mode_id: "diagram_sequence",
    },
    MermaidTypeSpec {
        id: "classDiagram",
        label: "Class",
        family: "structure",
        maturity: "stable",
        aliases: &["class"],
        required_policy: "stable",
        validator_id: "mermaid.structure",
        mode_id: "diagram_structure",
    },
    MermaidTypeSpec {
        id: "stateDiagram-v2",
        label: "State",
        family: "flow",
        maturity: "stable",
        aliases: &["stateDiagram"],
        required_policy: "stable",
        validator_id: "mermaid.flow",
        mode_id: "diagram_flow",
    },
    MermaidTypeSpec {
        id: "erDiagram",
        label: "ER",
        family: "structure",
        maturity: "stable",
        aliases: &["er"],
        required_policy: "stable",
        validator_id: "mermaid.structure",
        mode_id: "diagram_structure",
    },
    MermaidTypeSpec {
        id: "journey",
        label: "Journey",
        family: "flow",
        maturity: "stable",
        aliases: &[],
        required_policy: "stable",
        validator_id: "mermaid.flow",
        mode_id: "diagram_flow",
    },
    MermaidTypeSpec {
        id: "gantt",
        label: "Gantt",
        family: "planning",
        maturity: "stable",
        aliases: &[],
        required_policy: "stable",
        validator_id: "mermaid.planning",
        mode_id: "diagram_planning",
    },
    MermaidTypeSpec {
        id: "pie",
        label: "Pie",
        family: "data",
        maturity: "stable",
        aliases: &[],
        required_policy: "stable",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "quadrantChart",
        label: "Quadrant",
        family: "data",
        maturity: "stable",
        aliases: &["quadrant"],
        required_policy: "stable",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "requirementDiagram",
        label: "Requirement",
        family: "technical",
        maturity: "stable",
        aliases: &["requirement"],
        required_policy: "stable",
        validator_id: "mermaid.technical",
        mode_id: "diagram_technical",
    },
    MermaidTypeSpec {
        id: "gitGraph",
        label: "Git graph",
        family: "technical",
        maturity: "stable",
        aliases: &["gitgraph"],
        required_policy: "stable",
        validator_id: "mermaid.technical",
        mode_id: "diagram_technical",
    },
    MermaidTypeSpec {
        id: "mindmap",
        label: "Mindmap",
        family: "planning",
        maturity: "stable",
        aliases: &[],
        required_policy: "stable",
        validator_id: "mermaid.planning",
        mode_id: "diagram_planning",
    },
    MermaidTypeSpec {
        id: "timeline",
        label: "Timeline",
        family: "planning",
        maturity: "stable",
        aliases: &[],
        required_policy: "stable",
        validator_id: "mermaid.planning",
        mode_id: "diagram_planning",
    },
    MermaidTypeSpec {
        id: "C4Context",
        label: "C4 context",
        family: "structure",
        maturity: "advanced",
        aliases: &["c4"],
        required_policy: "visual_local",
        validator_id: "mermaid.structure",
        mode_id: "diagram_structure",
    },
    MermaidTypeSpec {
        id: "xychart-beta",
        label: "XY chart",
        family: "data",
        maturity: "beta",
        aliases: &["xychart"],
        required_policy: "beta",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "sankey-beta",
        label: "Sankey",
        family: "data",
        maturity: "beta",
        aliases: &["sankey"],
        required_policy: "beta",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "block-beta",
        label: "Block",
        family: "structure",
        maturity: "beta",
        aliases: &["block"],
        required_policy: "beta",
        validator_id: "mermaid.structure",
        mode_id: "diagram_structure",
    },
    MermaidTypeSpec {
        id: "kanban",
        label: "Kanban",
        family: "planning",
        maturity: "advanced",
        aliases: &[],
        required_policy: "visual_local",
        validator_id: "mermaid.planning",
        mode_id: "diagram_planning",
    },
    MermaidTypeSpec {
        id: "architecture-beta",
        label: "Architecture",
        family: "structure",
        maturity: "beta",
        aliases: &["architecture"],
        required_policy: "beta",
        validator_id: "mermaid.architecture_beta",
        mode_id: "diagram_structure",
    },
    MermaidTypeSpec {
        id: "packet-beta",
        label: "Packet",
        family: "technical",
        maturity: "beta",
        aliases: &["packet"],
        required_policy: "beta",
        validator_id: "mermaid.technical",
        mode_id: "diagram_technical",
    },
    MermaidTypeSpec {
        id: "radar-beta",
        label: "Radar",
        family: "data",
        maturity: "beta",
        aliases: &["radar"],
        required_policy: "beta",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "treemap-beta",
        label: "Treemap",
        family: "data",
        maturity: "beta",
        aliases: &["treemap"],
        required_policy: "beta",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "venn-beta",
        label: "Venn",
        family: "data",
        maturity: "beta",
        aliases: &["venn"],
        required_policy: "beta",
        validator_id: "mermaid.data",
        mode_id: "diagram_data",
    },
    MermaidTypeSpec {
        id: "zenuml",
        label: "ZenUML",
        family: "sequence",
        maturity: "advanced",
        aliases: &[],
        required_policy: "visual_local",
        validator_id: "mermaid.sequence",
        mode_id: "diagram_sequence",
    },
    MermaidTypeSpec {
        id: "ishikawa",
        label: "Ishikawa",
        family: "flow",
        maturity: "advanced",
        aliases: &[],
        required_policy: "visual_local",
        validator_id: "mermaid.flow",
        mode_id: "diagram_flow",
    },
    MermaidTypeSpec {
        id: "wardley",
        label: "Wardley",
        family: "technical",
        maturity: "beta",
        aliases: &[],
        required_policy: "beta",
        validator_id: "mermaid.technical",
        mode_id: "diagram_technical",
    },
    MermaidTypeSpec {
        id: "eventmodeling",
        label: "Event modeling",
        family: "technical",
        maturity: "beta",
        aliases: &["event-modeling"],
        required_policy: "beta",
        validator_id: "mermaid.technical",
        mode_id: "diagram_technical",
    },
    MermaidTypeSpec {
        id: "treeview",
        label: "Tree view",
        family: "planning",
        maturity: "beta",
        aliases: &["tree"],
        required_policy: "beta",
        validator_id: "mermaid.planning",
        mode_id: "diagram_planning",
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_loads_compact_base_skills_with_unique_valid_ids() {
        let skills = list_ai_skills();
        assert_eq!(skills.len(), 8);
        let ids = skills
            .iter()
            .map(|skill| skill.id.clone())
            .collect::<BTreeSet<_>>();
        assert_eq!(ids.len(), skills.len());
        assert!(ids.contains("knownext.research_report"));
        assert!(ids.contains("knownext.mermaid"));
        assert!(ids.contains("knownext.markdown"));
        assert!(skills.iter().all(|skill| skill.status == "valid"));
        assert!(skills.iter().all(|skill| !skill.modes.is_empty()));
    }

    #[test]
    fn detail_returns_manifest_modes_instructions_examples_and_catalog() {
        let skill = get_ai_skill("knownext.mermaid").unwrap();
        assert_eq!(skill.manifest.id, "knownext.mermaid");
        assert!(skill.instructions_markdown.contains("Mermaid"));
        assert!(!skill.examples.is_empty());
        assert!(skill
            .mermaid_catalog
            .iter()
            .any(|item| item.id == "architecture-beta"));
        assert!(skill
            .summary
            .modes
            .iter()
            .any(|mode| mode.id == "diagram_structure"));
    }

    #[test]
    fn validator_detects_invalid_manifest_and_bad_mode_validator() {
        let validation = validate_manifest_json(r#"{"id":"bad"}"#);
        assert_eq!(validation.status, "error");
        let validation = validate_manifest_json(
            r#"{
          "schemaVersion": 2,
          "id": "knownext.bad",
          "name": "Bad",
          "version": "1.0.0",
          "source": "base",
          "description": "Bad",
          "categories": ["bad"],
          "capabilities": ["bad"],
          "outputActions": ["answer"],
          "requires": [],
          "validators": [],
          "runtimeEnabled": true,
          "modes": [{
            "id": "bad",
            "name": "Bad",
            "description": "Bad",
            "whenToUse": ["bad"],
            "whenNotToUse": [],
            "supportedActions": ["answer"],
            "requiresCapabilities": [],
            "validators": ["missing.validator"],
            "riskLevel": "low",
            "contextBudget": 200
          }]
        }"#,
        );
        assert_eq!(validation.status, "error");
    }

    #[test]
    fn selector_prefilter_omits_mermaid_when_diagrams_are_disabled() {
        let context = select_skills_for_request(
            &json!({ "clientContext": { "diagramConfig": { "enabled": false } } }),
            None,
        );
        assert!(context.used_skill_ids.is_empty());
        assert!(context
            .diagnostics
            .iter()
            .all(|diagnostic| diagnostic.skill_id != "knownext.mermaid"));
    }

    #[test]
    fn policy_gate_rejects_incompatible_action_and_runtime_disabled_skill() {
        let proposal = AiSkillSelectorProposal {
            selected: vec![
                AiSkillSelectorChoice {
                    skill_id: "knownext.markdown".to_string(),
                    mode_id: "table".to_string(),
                    action: "insert_diagram".to_string(),
                    confidence: "high".to_string(),
                    reason: "bad action".to_string(),
                },
                AiSkillSelectorChoice {
                    skill_id: "knownext.document.review".to_string(),
                    mode_id: "clarity".to_string(),
                    action: "answer".to_string(),
                    confidence: "high".to_string(),
                    reason: "not enabled".to_string(),
                },
            ],
        };
        let context = select_skills_for_request(&json!({}), Some(&proposal));
        assert!(context.applications.is_empty());
        assert!(context
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.status == "rejected"));
    }

    #[test]
    fn quick_mode_accepts_one_skill_and_reasoning_accepts_two() {
        let proposal = AiSkillSelectorProposal {
            selected: vec![
                AiSkillSelectorChoice {
                    skill_id: "knownext.markdown".to_string(),
                    mode_id: "table".to_string(),
                    action: "answer".to_string(),
                    confidence: "high".to_string(),
                    reason: "table".to_string(),
                },
                AiSkillSelectorChoice {
                    skill_id: "knownext.mermaid".to_string(),
                    mode_id: "diagram_flow".to_string(),
                    action: "insert_diagram".to_string(),
                    confidence: "high".to_string(),
                    reason: "diagram".to_string(),
                },
            ],
        };
        let quick =
            select_skills_for_request(&json!({ "executionMode": "quick" }), Some(&proposal));
        assert_eq!(quick.applications.len(), 1);
        let reasoning =
            select_skills_for_request(&json!({ "executionMode": "reasoning" }), Some(&proposal));
        assert_eq!(reasoning.applications.len(), 2);
    }

    #[test]
    fn mermaid_catalog_covers_current_frontend_types() {
        let ids = mermaid_catalog()
            .into_iter()
            .map(|item| item.id)
            .collect::<BTreeSet<_>>();
        for expected in [
            "flowchart",
            "sequenceDiagram",
            "classDiagram",
            "stateDiagram-v2",
            "erDiagram",
            "journey",
            "gantt",
            "pie",
            "quadrantChart",
            "requirementDiagram",
            "gitGraph",
            "mindmap",
            "timeline",
            "C4Context",
            "xychart-beta",
            "sankey-beta",
            "block-beta",
            "kanban",
            "architecture-beta",
            "packet-beta",
            "radar-beta",
            "treemap-beta",
            "venn-beta",
            "zenuml",
            "ishikawa",
            "wardley",
            "eventmodeling",
            "treeview",
        ] {
            assert!(ids.contains(expected), "missing {expected}");
        }
    }

    #[test]
    fn validator_blocks_architecture_beta_with_flowchart_edges() {
        let diagnostics = validate_mermaid_diagram(
            "architecture-beta\n  app --> runtime",
            Some("architecture-beta"),
            &json!({ "clientContext": { "diagramConfig": { "enabled": true, "betaPolicy": "enabled", "visualProfile": "advanced" } } }),
        );
        assert!(diagnostics_have_errors(&diagnostics));
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.validator_id.as_deref()
                == Some("mermaid.architecture_beta")));
    }

    #[test]
    fn markdown_table_validator_accepts_valid_and_rejects_inconsistent_rows() {
        let valid = validate_markdown_table("| A | B |\n|---|---|\n| 1 | 2 |");
        assert!(!diagnostics_have_errors(&valid));
        let invalid = validate_markdown_table("| A | B |\n|---|---|\n| 1 | 2 | 3 |");
        assert!(diagnostics_have_errors(&invalid));
    }
}
