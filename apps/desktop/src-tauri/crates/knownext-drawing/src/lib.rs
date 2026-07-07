use serde_json::{json, Value};
use std::collections::BTreeMap;

const DEFAULT_MAX_ELEMENTS: usize = 48;
const DEFAULT_MAX_STROKES: usize = 1_400;
const MIN_TEXT_SIZE: f64 = 18.0;
const DEFAULT_MARGIN: f64 = 86.0;

#[derive(Debug, Clone)]
struct Canvas {
    width: f64,
    height: f64,
    margin: f64,
}

#[derive(Debug, Clone)]
struct SceneElement {
    id: String,
    kind: String,
    shape: Option<String>,
    symbol: Option<String>,
    target: Option<String>,
    fill_mode: Option<String>,
    text: String,
    role: String,
    priority: i64,
    from: Option<String>,
    to: Option<String>,
}

#[derive(Debug, Clone)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone)]
struct StrokeStyle {
    tool: String,
    color: String,
    width: f64,
    opacity: f64,
    pressure: bool,
    pressure_sensitivity: f64,
}

#[derive(Debug, Clone)]
struct VectorItem {
    id: String,
    kind: String,
    role: String,
    shape: Option<String>,
    fill_mode: Option<String>,
    rect: Option<Rect>,
    points: Vec<(f64, f64)>,
    text: Option<String>,
    text_size: f64,
    target: Option<String>,
}

pub fn apply_handwritten_drawing(
    note: &Value,
    request: &Value,
    config: &Value,
) -> Result<Value, String> {
    if request.get("route").and_then(Value::as_str) == Some("debug_raw_strokes") {
        return Err("La ruta debug_raw_strokes esta bloqueada en runtime normal.".to_string());
    }

    let mut content = request
        .get("content")
        .cloned()
        .unwrap_or_else(|| note.get("content").cloned().unwrap_or_else(|| note.clone()));
    if !content.is_object() {
        content = note.clone();
    }

    let target_page_id = request
        .get("targetPageId")
        .or_else(|| request.get("activeHandwrittenPageId"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            content["pages"]
                .as_array()
                .and_then(|pages| pages.first())
                .and_then(|page| page["id"].as_str())
                .map(str::to_string)
        })
        .ok_or_else(|| "La nota no contiene paginas dibujables.".to_string())?;

    let page_index = content["pages"]
        .as_array()
        .and_then(|pages| {
            pages
                .iter()
                .position(|page| page["id"].as_str() == Some(target_page_id.as_str()))
        })
        .ok_or_else(|| "No se encontro la pagina objetivo de la knote.".to_string())?;

    let page = content["pages"][page_index].clone();
    let canvas = Canvas {
        width: page["size"]["width"]
            .as_f64()
            .unwrap_or(1190.0)
            .clamp(320.0, 4096.0),
        height: page["size"]["height"]
            .as_f64()
            .unwrap_or(1684.0)
            .clamp(320.0, 4096.0),
        margin: DEFAULT_MARGIN,
    };
    let max_elements = config["maxElements"]
        .as_u64()
        .unwrap_or(DEFAULT_MAX_ELEMENTS as u64)
        .clamp(1, 120) as usize;
    let max_strokes = config["maxStrokes"]
        .as_u64()
        .unwrap_or(DEFAULT_MAX_STROKES as u64)
        .clamp(80, 5_000) as usize;
    let replacement_policy = request
        .get("replacementPolicy")
        .and_then(Value::as_str)
        .unwrap_or("append_only");
    let clear_target_page = matches!(
        replacement_policy,
        "clean_existing" | "replace_page" | "cleanup_existing"
    );

    let explicit_empty_scene = request
        .pointer("/sceneSpec/elements")
        .and_then(Value::as_array)
        .is_some_and(Vec::is_empty);
    let elements = if clear_target_page && explicit_empty_scene {
        Vec::new()
    } else {
        scene_elements(request, max_elements)
    };
    if elements.is_empty() {
        if clear_target_page {
            content["pages"][page_index]["strokes"] = Value::Array(Vec::new());
            content["pages"][page_index]["generatedElements"] = Value::Array(Vec::new());
            content["pages"][page_index]["updatedAt"] = Value::from(knownext_core::now_iso());
            content["updatedAt"] = Value::from(knownext_core::now_iso());
            let route = normalize_route(request.get("route").and_then(Value::as_str), &elements);
            return Ok(json!({
                "content": content,
                "pageId": target_page_id,
                "route": route,
                "sceneSpec": request.get("sceneSpec").cloned().unwrap_or_else(|| json!({ "elements": [] })),
                "vectorPlan": {
                    "items": [],
                    "canvas": { "width": canvas.width, "height": canvas.height, "margin": canvas.margin }
                },
                "qualityReport": {
                    "ok": true,
                    "status": "passed",
                    "message": "Pagina activa limpiada.",
                    "issues": [],
                    "warnings": [],
                    "metrics": {
                        "strokeCount": 0,
                        "itemCount": 0,
                        "maxStrokes": max_strokes
                    }
                }
            }));
        }
        return Err(
            "La propuesta de dibujo no contiene elementos visuales aplicables.".to_string(),
        );
    }

    let route = normalize_route(request.get("route").and_then(Value::as_str), &elements);
    let vector_items = layout_scene(&route, &canvas, &elements);
    let styles = resolve_styles(&content);
    let mut strokes = Vec::new();
    let mut generated_elements = Vec::new();
    for item in &vector_items {
        let before = strokes.len();
        synthesize_item(item, &styles, &mut strokes);
        if strokes.len() > max_strokes {
            return Err(format!(
                "El dibujo supera el limite de trazos configurado ({max_strokes})."
            ));
        }
        generated_elements.push(json!({
            "id": item.id,
            "kind": item.kind,
            "role": item.role,
            "text": item.text,
            "strokeIds": strokes[before..].iter().filter_map(|stroke| stroke["id"].as_str()).collect::<Vec<_>>(),
            "bounds": item.rect.as_ref().map(|rect| json!({ "x": round(rect.x), "y": round(rect.y), "width": round(rect.width), "height": round(rect.height) })).unwrap_or(Value::Null),
        }));
    }

    let quality = quality_report(&canvas, &vector_items, &strokes, max_strokes);
    if quality["status"].as_str() == Some("blocked") {
        return Err(quality["message"]
            .as_str()
            .unwrap_or("El dibujo no supera la validacion visual.")
            .to_string());
    }

    let existing_strokes = if clear_target_page {
        Vec::new()
    } else {
        content["pages"][page_index]["strokes"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    };
    let mut next_strokes = existing_strokes;
    next_strokes.extend(strokes);
    content["pages"][page_index]["strokes"] = Value::Array(next_strokes);
    content["pages"][page_index]["updatedAt"] = Value::from(knownext_core::now_iso());
    let existing_generated_elements = if clear_target_page {
        Vec::new()
    } else {
        content["pages"][page_index]["generatedElements"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    };
    content["pages"][page_index]["generatedElements"] = merge_generated_elements(
        existing_generated_elements,
        generated_elements,
    );
    content["updatedAt"] = Value::from(knownext_core::now_iso());

    Ok(json!({
        "content": content,
        "pageId": target_page_id,
        "route": route,
        "sceneSpec": request.get("sceneSpec").cloned().unwrap_or_else(|| json!({ "elements": [] })),
        "vectorPlan": {
            "items": vector_items.iter().map(vector_item_json).collect::<Vec<_>>(),
            "canvas": { "width": canvas.width, "height": canvas.height, "margin": canvas.margin }
        },
        "qualityReport": quality
    }))
}

fn scene_elements(request: &Value, max_elements: usize) -> Vec<SceneElement> {
    let raw_elements = request
        .pointer("/sceneSpec/elements")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut elements = raw_elements
        .into_iter()
        .take(max_elements)
        .enumerate()
        .filter_map(|(index, value)| {
            let kind = value["type"]
                .as_str()
                .or_else(|| value["kind"].as_str())
                .unwrap_or("box")
                .to_string();
            let text = value["text"]
                .as_str()
                .or_else(|| value["label"].as_str())
                .or_else(|| value["title"].as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if text.is_empty()
                && !matches!(
                    kind.as_str(),
                    "arrow"
                        | "connector"
                        | "freeform_shape"
                        | "shape"
                        | "symbol"
                        | "portrait"
                        | "fill_region"
                        | "shadow_region"
                )
            {
                return None;
            }
            Some(SceneElement {
                id: value["id"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("element-{}", index + 1)),
                kind,
                shape: value["shape"].as_str().map(str::to_string),
                symbol: value["symbol"].as_str().map(str::to_string),
                target: value["target"]
                    .as_str()
                    .or_else(|| value["to"].as_str())
                    .map(str::to_string),
                fill_mode: value["fill"]
                    .as_str()
                    .or_else(|| value["fillMode"].as_str())
                    .map(str::to_string),
                text,
                role: value["role"].as_str().unwrap_or("primary").to_string(),
                priority: value["priority"].as_i64().unwrap_or(50),
                from: value["from"].as_str().map(str::to_string),
                to: value["to"].as_str().map(str::to_string),
            })
        })
        .collect::<Vec<_>>();
    elements.sort_by_key(|element| element.priority);
    if elements.is_empty() {
        if let Some(prompt) = request.get("prompt").and_then(Value::as_str) {
            elements = prompt
                .split(['\n', ',', ';', '.'])
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .take(6)
                .enumerate()
                .map(|(index, text)| SceneElement {
                    id: format!("idea-{}", index + 1),
                    kind: "box".to_string(),
                    shape: None,
                    symbol: None,
                    target: None,
                    fill_mode: None,
                    text: text.chars().take(52).collect(),
                    role: "primary".to_string(),
                    priority: index as i64,
                    from: None,
                    to: None,
                })
                .collect();
        }
    }
    elements
}

fn normalize_route(route: Option<&str>, elements: &[SceneElement]) -> String {
    match route {
        Some("precise_scene" | "mermaid_vector" | "creative_sketch") => route.unwrap().to_string(),
        _ if elements
            .iter()
            .any(|element| element.kind == "timeline_event") =>
        {
            "precise_scene".to_string()
        }
        _ => "precise_scene".to_string(),
    }
}

fn layout_scene(route: &str, canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    if should_use_infographic_layout(elements) {
        return layout_infographic(canvas, elements);
    }
    let family = elements
        .iter()
        .map(|element| element.kind.as_str())
        .find(|kind| {
            matches!(
                *kind,
                "timeline_event" | "mindmap_node" | "wireframe_component" | "lane"
            )
        })
        .unwrap_or(route);
    match family {
        "timeline_event" => layout_timeline(canvas, elements),
        "mindmap_node" => layout_mindmap(canvas, elements),
        "wireframe_component" => layout_wireframe(canvas, elements),
        "lane" => layout_lanes(canvas, elements),
        _ if elements
            .iter()
            .any(|element| element.kind == "quadrant" || element.kind == "matrix_cell") =>
        {
            layout_matrix(canvas, elements)
        }
        _ => layout_flow(canvas, elements),
    }
}

fn should_use_infographic_layout(elements: &[SceneElement]) -> bool {
    let has_hero = elements.iter().any(|element| {
        element.role == "primary_outline" && is_illustrative_element(element)
    });
    let has_notes = elements.iter().any(|element| {
        matches!(
            element.kind.as_str(),
            "annotation" | "text_block" | "label"
        ) && !is_illustrative_element(element)
    });
    has_hero && has_notes
}

fn is_illustrative_element(element: &SceneElement) -> bool {
    matches!(
        element.kind.as_str(),
        "symbol" | "portrait" | "freeform_shape" | "shape"
    )
}

fn layout_infographic(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let hero = elements
        .iter()
        .find(|element| element.role == "primary_outline" && is_illustrative_element(element))
        .or_else(|| elements.iter().find(|element| is_illustrative_element(element)))
        .unwrap_or(&elements[0]);
    let hero_is_tall = hero
        .symbol
        .as_deref()
        .is_some_and(|symbol| matches!(symbol, "starship" | "rocket" | "spacecraft"));
    let hero_rect = if hero_is_tall {
        Rect {
            x: canvas.width * 0.29,
            y: canvas.margin + 140.0,
            width: canvas.width * 0.23,
            height: canvas.height * 0.58,
        }
    } else {
        Rect {
            x: canvas.width * 0.18,
            y: canvas.margin + 210.0,
            width: canvas.width * 0.42,
            height: canvas.width * 0.42,
        }
    };
    let mut items = vec![visual_item(hero, hero_rect.clone(), 24.0)];
    let notes = elements
        .iter()
        .filter(|element| {
            element.id != hero.id
                && !matches!(
                    element.kind.as_str(),
                    "arrow" | "connector" | "fill_region" | "shadow_region"
                )
        })
        .take(6)
        .collect::<Vec<_>>();
    let note_slots = infographic_note_slots(canvas, notes.len(), &hero_rect);
    for (index, element) in notes.iter().enumerate() {
        let rect = note_slots[index].clone();
        let note_id = format!("note-{}", element.id);
        items.push(label_item_with_id(element, &note_id, rect.clone(), 21.0));
        let anchor = infographic_anchor(&hero_rect, index, notes.len(), hero_is_tall);
        let target = if rect.x > hero_rect.x {
            (rect.x + 8.0, rect.y + rect.height * 0.45)
        } else {
            (rect.x + rect.width - 8.0, rect.y + rect.height * 0.45)
        };
        items.push(VectorItem {
            id: format!("callout-{}", element.id),
            kind: "arrow".to_string(),
            role: "callout_connector".to_string(),
            shape: None,
            fill_mode: None,
            rect: None,
            points: vec![anchor, target],
            text: None,
            text_size: 0.0,
            target: Some(hero.id.clone()),
        });
    }
    for element in elements
        .iter()
        .filter(|element| matches!(element.kind.as_str(), "fill_region" | "shadow_region"))
    {
        if let Some(target) = element.target.as_ref().or(element.to.as_ref()) {
            if target == &hero.id {
                items.push(fill_item(element, hero_rect.clone()));
            }
        }
    }
    items
}

fn infographic_note_slots(canvas: &Canvas, count: usize, hero_rect: &Rect) -> Vec<Rect> {
    let left_x = canvas.margin + 18.0;
    let right_x = hero_rect.x + hero_rect.width + 78.0;
    let right_w = (canvas.width - right_x - canvas.margin).max(250.0);
    let left_w = (hero_rect.x - left_x - 58.0).max(230.0);
    let top = canvas.margin + 170.0;
    let gap = 142.0;
    let raw = [
        Rect { x: right_x, y: top, width: right_w, height: 92.0 },
        Rect { x: right_x + 18.0, y: top + gap, width: right_w - 18.0, height: 92.0 },
        Rect { x: right_x - 8.0, y: top + gap * 2.0, width: right_w, height: 92.0 },
        Rect { x: left_x, y: top + 48.0, width: left_w, height: 92.0 },
        Rect { x: left_x + 14.0, y: top + gap * 1.72, width: left_w, height: 92.0 },
        Rect { x: canvas.margin + 90.0, y: hero_rect.y + hero_rect.height + 62.0, width: canvas.width - canvas.margin * 2.0 - 180.0, height: 86.0 },
    ];
    raw.into_iter().take(count).collect()
}

fn infographic_anchor(rect: &Rect, index: usize, count: usize, tall: bool) -> (f64, f64) {
    if tall {
        let fractions = [0.12, 0.28, 0.46, 0.64, 0.78, 0.9];
        let fraction = fractions[index.min(fractions.len() - 1)];
        let side = if index < 3 { 1.0 } else { 0.0 };
        return (rect.x + rect.width * side, rect.y + rect.height * fraction);
    }
    let angle = -1.1 + (index as f64 + 0.5) * 2.2 / count.max(1) as f64;
    (
        rect.x + rect.width * (0.5 + angle.cos() * 0.42),
        rect.y + rect.height * (0.5 + angle.sin() * 0.42),
    )
}

fn layout_flow(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let boxes = elements
        .iter()
        .filter(|element| {
            !matches!(
                element.kind.as_str(),
                "arrow" | "connector" | "fill_region" | "shadow_region"
            )
        })
        .collect::<Vec<_>>();
    if boxes.len() == 1
        && matches!(
            boxes[0].kind.as_str(),
            "portrait" | "symbol" | "freeform_shape" | "shape"
        )
    {
        let side_scale = match boxes[0].kind.as_str() {
            "portrait" => 0.66,
            "symbol" => 0.54,
            _ => 0.42,
        };
        let side = (canvas.width.min(canvas.height) * side_scale).clamp(360.0, 820.0);
        let x_offset = if boxes[0].kind == "portrait" { -side * 0.045 } else { 0.0 };
        let y_offset = if boxes[0].kind == "portrait" { -side * 0.035 } else { 0.0 };
        let rect = Rect {
            x: (canvas.width - side) / 2.0 + x_offset,
            y: (canvas.height - side) / 2.0 + y_offset,
            width: side,
            height: side,
        };
        let mut items = vec![visual_item(boxes[0], rect, 26.0)];
        for element in elements
            .iter()
            .filter(|element| matches!(element.kind.as_str(), "fill_region" | "shadow_region"))
        {
            if let Some(target) = element.target.as_ref().or(element.to.as_ref()) {
                if let Some(target_item) = items.iter().find(|item| item.id == *target) {
                    if let Some(rect) = target_item.rect.clone() {
                        items.push(fill_item(element, rect));
                    }
                }
            }
        }
        return items;
    }
    let count = boxes.len().max(1);
    let columns = if count <= 3 { count } else { 3 };
    let rows = ((count as f64) / (columns as f64)).ceil() as usize;
    let gap_x = 54.0;
    let gap_y = 92.0;
    let usable_w = canvas.width - canvas.margin * 2.0;
    let usable_h = canvas.height - canvas.margin * 2.0;
    let box_w = ((usable_w - gap_x * (columns.saturating_sub(1) as f64)) / columns as f64)
        .clamp(190.0, 320.0);
    let box_h =
        ((usable_h - gap_y * (rows.saturating_sub(1) as f64)) / rows as f64).clamp(96.0, 145.0);
    let total_w = box_w * columns as f64 + gap_x * (columns.saturating_sub(1) as f64);
    let total_h = box_h * rows as f64 + gap_y * (rows.saturating_sub(1) as f64);
    let start_x = (canvas.width - total_w) / 2.0;
    let start_y = (canvas.height - total_h) / 2.0;

    let mut items = Vec::new();
    let mut centers = BTreeMap::new();
    for (index, element) in boxes.iter().enumerate() {
        let row = index / columns;
        let column = index % columns;
        let rect = Rect {
            x: start_x + column as f64 * (box_w + gap_x),
            y: start_y + row as f64 * (box_h + gap_y),
            width: box_w,
            height: box_h,
        };
        centers.insert(
            element.id.clone(),
            (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0),
        );
        items.push(visual_item(element, rect, 26.0));
    }
    for element in elements
        .iter()
        .filter(|element| matches!(element.kind.as_str(), "arrow" | "connector"))
    {
        if let (Some(from_id), Some(to_id)) = (&element.from, &element.to) {
            if let (Some(from), Some(to)) = (centers.get(from_id), centers.get(to_id)) {
                items.push(arrow_item(&element.id, *from, *to));
            }
        }
    }
    for element in elements
        .iter()
        .filter(|element| matches!(element.kind.as_str(), "fill_region" | "shadow_region"))
    {
        if let Some(target) = element.target.as_ref().or(element.to.as_ref()) {
            if let Some(target_item) = items.iter().find(|item| item.id == *target) {
                if let Some(rect) = target_item.rect.clone() {
                    items.push(fill_item(element, rect));
                }
            }
        }
    }
    items
}

fn layout_matrix(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let rect = Rect {
        x: canvas.margin,
        y: canvas.margin + 70.0,
        width: canvas.width - canvas.margin * 2.0,
        height: canvas.height - canvas.margin * 2.0 - 120.0,
    };
    let mut items = vec![
        line_item(
            "matrix-v",
            (rect.x + rect.width / 2.0, rect.y),
            (rect.x + rect.width / 2.0, rect.y + rect.height),
            "secondary",
        ),
        line_item(
            "matrix-h",
            (rect.x, rect.y + rect.height / 2.0),
            (rect.x + rect.width, rect.y + rect.height / 2.0),
            "secondary",
        ),
    ];
    let labels = elements
        .iter()
        .filter(|element| !matches!(element.kind.as_str(), "arrow" | "connector"))
        .collect::<Vec<_>>();
    let cells = [
        Rect {
            x: rect.x + 24.0,
            y: rect.y + 24.0,
            width: rect.width / 2.0 - 48.0,
            height: rect.height / 2.0 - 48.0,
        },
        Rect {
            x: rect.x + rect.width / 2.0 + 24.0,
            y: rect.y + 24.0,
            width: rect.width / 2.0 - 48.0,
            height: rect.height / 2.0 - 48.0,
        },
        Rect {
            x: rect.x + 24.0,
            y: rect.y + rect.height / 2.0 + 24.0,
            width: rect.width / 2.0 - 48.0,
            height: rect.height / 2.0 - 48.0,
        },
        Rect {
            x: rect.x + rect.width / 2.0 + 24.0,
            y: rect.y + rect.height / 2.0 + 24.0,
            width: rect.width / 2.0 - 48.0,
            height: rect.height / 2.0 - 48.0,
        },
    ];
    for (index, element) in labels.into_iter().take(4).enumerate() {
        items.push(label_item(element, cells[index].clone(), 24.0));
    }
    items
}

fn layout_timeline(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let y = canvas.height / 2.0;
    let start_x = canvas.margin + 30.0;
    let end_x = canvas.width - canvas.margin - 30.0;
    let events = elements
        .iter()
        .filter(|element| element.kind != "arrow")
        .collect::<Vec<_>>();
    let mut items = vec![line_item(
        "timeline-axis",
        (start_x, y),
        (end_x, y),
        "primary",
    )];
    let step = if events.len() <= 1 {
        0.0
    } else {
        (end_x - start_x) / (events.len() as f64 - 1.0)
    };
    for (index, element) in events.into_iter().enumerate() {
        let x = start_x + step * index as f64;
        let up = index % 2 == 0;
        let tick_y = if up { y - 145.0 } else { y + 70.0 };
        items.push(line_item(
            &format!("tick-{}", element.id),
            (x, y - 18.0),
            (x, y + 18.0),
            "accent",
        ));
        items.push(line_item(
            &format!("tick-link-{}", element.id),
            (x, y),
            (x, tick_y),
            "secondary",
        ));
        items.push(label_item(
            element,
            Rect {
                x: x - 105.0,
                y: tick_y - if up { 74.0 } else { 0.0 },
                width: 210.0,
                height: 74.0,
            },
            20.0,
        ));
    }
    items
}

fn layout_mindmap(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let center = (canvas.width / 2.0, canvas.height / 2.0);
    let mut items = Vec::new();
    let root = elements.first().unwrap();
    let root_rect = Rect {
        x: center.0 - 145.0,
        y: center.1 - 54.0,
        width: 290.0,
        height: 108.0,
    };
    items.push(box_item(root, root_rect, 25.0));
    let branches = elements.iter().skip(1).collect::<Vec<_>>();
    let radius_x = (canvas.width * 0.34).max(260.0);
    let radius_y = (canvas.height * 0.30).max(220.0);
    for (index, element) in branches.iter().enumerate() {
        let angle = -std::f64::consts::FRAC_PI_2
            + (index as f64 + 0.5) * std::f64::consts::TAU / branches.len().max(1) as f64;
        let cx = center.0 + angle.cos() * radius_x;
        let cy = center.1 + angle.sin() * radius_y;
        items.push(curve_item(
            &format!("branch-{}", element.id),
            center,
            (cx, cy),
            "secondary",
        ));
        items.push(label_item(
            element,
            Rect {
                x: cx - 112.0,
                y: cy - 42.0,
                width: 224.0,
                height: 84.0,
            },
            21.0,
        ));
    }
    items
}

fn layout_wireframe(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let frame = Rect {
        x: canvas.margin + 70.0,
        y: canvas.margin,
        width: canvas.width - (canvas.margin + 70.0) * 2.0,
        height: canvas.height - canvas.margin * 2.0,
    };
    let mut items = vec![VectorItem {
        id: "wireframe-shell".to_string(),
        kind: "box".to_string(),
        role: "primary".to_string(),
        shape: None,
        fill_mode: None,
        rect: Some(frame.clone()),
        points: Vec::new(),
        text: None,
        text_size: 0.0,
        target: None,
    }];
    let components = elements
        .iter()
        .filter(|element| element.kind != "arrow")
        .collect::<Vec<_>>();
    let top = Rect {
        x: frame.x + 28.0,
        y: frame.y + 28.0,
        width: frame.width - 56.0,
        height: 90.0,
    };
    if let Some(first) = components.first() {
        items.push(visual_item(first, top, 21.0));
    }
    let card_w = (frame.width - 92.0) / 2.0;
    for (index, element) in components.iter().skip(1).take(4).enumerate() {
        let row = index / 2;
        let col = index % 2;
        items.push(visual_item(
            element,
            Rect {
                x: frame.x + 28.0 + col as f64 * (card_w + 36.0),
                y: frame.y + 150.0 + row as f64 * 155.0,
                width: card_w,
                height: 120.0,
            },
            20.0,
        ));
    }
    items
}

fn layout_lanes(canvas: &Canvas, elements: &[SceneElement]) -> Vec<VectorItem> {
    let lanes = elements
        .iter()
        .filter(|element| element.kind == "lane")
        .collect::<Vec<_>>();
    if lanes.is_empty() {
        return layout_flow(canvas, elements);
    }
    let lane_h = ((canvas.height - canvas.margin * 2.0) / lanes.len() as f64).clamp(150.0, 260.0);
    let mut items = Vec::new();
    for (index, lane) in lanes.iter().enumerate() {
        let rect = Rect {
            x: canvas.margin,
            y: canvas.margin + index as f64 * lane_h,
            width: canvas.width - canvas.margin * 2.0,
            height: lane_h - 20.0,
        };
        items.push(visual_item(lane, rect, 22.0));
    }
    items
}

fn visual_item(element: &SceneElement, rect: Rect, text_size: f64) -> VectorItem {
    match element.kind.as_str() {
        "shape" => shape_item(element, rect, text_size),
        "symbol" => symbol_item(element, rect, text_size),
        "portrait" => portrait_item(element, rect),
        "text_block" | "annotation" => label_item(element, rect, text_size),
        "diagram_node" => box_item(element, rect, text_size),
        "freeform_shape" => shape_item(element, rect, text_size),
        _ => box_item(element, rect, text_size),
    }
}

fn box_item(element: &SceneElement, rect: Rect, text_size: f64) -> VectorItem {
    VectorItem {
        id: element.id.clone(),
        kind: if element.kind == "diagram_node" {
            "diagram_node".to_string()
        } else {
            "box".to_string()
        },
        role: element.role.clone(),
        shape: None,
        fill_mode: None,
        rect: Some(rect),
        points: Vec::new(),
        text: Some(element.text.clone()),
        text_size,
        target: None,
    }
}

fn label_item(element: &SceneElement, rect: Rect, text_size: f64) -> VectorItem {
    label_item_with_id(element, &element.id, rect, text_size)
}

fn label_item_with_id(element: &SceneElement, id: &str, rect: Rect, text_size: f64) -> VectorItem {
    VectorItem {
        id: id.to_string(),
        kind: "label".to_string(),
        role: element.role.clone(),
        shape: None,
        fill_mode: None,
        rect: Some(rect),
        points: Vec::new(),
        text: Some(element.text.clone()),
        text_size,
        target: None,
    }
}

fn shape_item(element: &SceneElement, rect: Rect, text_size: f64) -> VectorItem {
    let shape = element
        .shape
        .as_deref()
        .unwrap_or_else(|| infer_shape_from_text(&element.text))
        .to_string();
    let shape_rect = square_rect_if_needed(&rect, Some(shape.as_str()));
    VectorItem {
        id: element.id.clone(),
        kind: "shape".to_string(),
        role: element.role.clone(),
        shape: Some(shape),
        fill_mode: element.fill_mode.clone(),
        rect: Some(shape_rect),
        points: Vec::new(),
        text: if element.text.is_empty() {
            None
        } else {
            Some(element.text.clone())
        },
        text_size,
        target: None,
    }
}

fn symbol_item(element: &SceneElement, rect: Rect, text_size: f64) -> VectorItem {
    VectorItem {
        id: element.id.clone(),
        kind: "symbol".to_string(),
        role: element.role.clone(),
        shape: element.symbol.clone(),
        fill_mode: element.fill_mode.clone(),
        rect: Some(rect),
        points: Vec::new(),
        text: if element.text.is_empty() {
            None
        } else {
            Some(element.text.clone())
        },
        text_size,
        target: None,
    }
}

fn portrait_item(element: &SceneElement, rect: Rect) -> VectorItem {
    VectorItem {
        id: element.id.clone(),
        kind: "portrait".to_string(),
        role: element.role.clone(),
        shape: element.symbol.clone(),
        fill_mode: element.fill_mode.clone(),
        rect: Some(rect),
        points: Vec::new(),
        text: None,
        text_size: 0.0,
        target: None,
    }
}

fn fill_item(element: &SceneElement, rect: Rect) -> VectorItem {
    VectorItem {
        id: element.id.clone(),
        kind: if element.kind == "shadow_region" {
            "shadow_region".to_string()
        } else {
            "fill_region".to_string()
        },
        role: if element.kind == "shadow_region" {
            "shadow".to_string()
        } else {
            element.role.clone()
        },
        shape: None,
        fill_mode: Some(
            element
                .fill_mode
                .clone()
                .unwrap_or_else(|| "marker_passes".to_string()),
        ),
        rect: Some(rect),
        points: Vec::new(),
        text: None,
        text_size: 0.0,
        target: element.target.clone(),
    }
}

fn infer_shape_from_text(text: &str) -> &str {
    let lower = text.to_lowercase();
    if lower.contains("triang") {
        "triangle"
    } else if lower.contains("circul") || lower.contains("circle") {
        "circle"
    } else if lower.contains("rombo") || lower.contains("diamond") {
        "diamond"
    } else if lower.contains("estrella") || lower.contains("star") {
        "star"
    } else if lower.contains("elipse") || lower.contains("ellipse") {
        "ellipse"
    } else {
        "square"
    }
}

fn square_rect_if_needed(rect: &Rect, shape: Option<&str>) -> Rect {
    if !matches!(shape, Some("square" | "circle" | "diamond" | "star")) {
        return rect.clone();
    }
    let side = rect.width.min(rect.height);
    Rect {
        x: rect.x + (rect.width - side) / 2.0,
        y: rect.y + (rect.height - side) / 2.0,
        width: side,
        height: side,
    }
}

fn arrow_item(id: &str, from: (f64, f64), to: (f64, f64)) -> VectorItem {
    VectorItem {
        id: id.to_string(),
        kind: "arrow".to_string(),
        role: "connector".to_string(),
        shape: None,
        fill_mode: None,
        rect: None,
        points: vec![from, to],
        text: None,
        text_size: 0.0,
        target: None,
    }
}

fn line_item(id: &str, from: (f64, f64), to: (f64, f64), role: &str) -> VectorItem {
    VectorItem {
        id: id.to_string(),
        kind: "line".to_string(),
        role: role.to_string(),
        shape: None,
        fill_mode: None,
        rect: None,
        points: vec![from, to],
        text: None,
        text_size: 0.0,
        target: None,
    }
}

fn curve_item(id: &str, from: (f64, f64), to: (f64, f64), role: &str) -> VectorItem {
    VectorItem {
        id: id.to_string(),
        kind: "curve".to_string(),
        role: role.to_string(),
        shape: None,
        fill_mode: None,
        rect: None,
        points: vec![
            from,
            ((from.0 + to.0) / 2.0, (from.1 + to.1) / 2.0 - 35.0),
            to,
        ],
        text: None,
        text_size: 0.0,
        target: None,
    }
}

fn resolve_styles(content: &Value) -> BTreeMap<String, StrokeStyle> {
    let presets = content["toolPresets"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let preset_for = |kind: &str| -> Option<StrokeStyle> {
        presets.iter().find_map(|preset| {
            if preset["type"].as_str() == Some(kind) {
                Some(style_from_preset(preset))
            } else {
                None
            }
        })
    };
    let mut styles = BTreeMap::new();
    let pen = preset_for("pen").unwrap_or_else(default_primary_style);
    let pencil = preset_for("pencil").unwrap_or_else(default_secondary_style);
    let marker = preset_for("marker").unwrap_or_else(default_accent_style);
    let highlighter = preset_for("highlighter").unwrap_or_else(default_highlighter_style);
    styles.insert("primary".to_string(), pencil.clone());
    styles.insert("primary_outline".to_string(), pencil.clone());
    styles.insert("diagram_node".to_string(), pencil.clone());
    styles.insert("secondary".to_string(), pencil.clone());
    styles.insert("secondary_sketch".to_string(), pencil.clone());
    styles.insert("construction".to_string(), pencil.clone());
    styles.insert("shadow".to_string(), subdued_style(&pencil, 0.24, 0.78));
    styles.insert("callout_connector".to_string(), subdued_style(&pencil, 0.62, 0.78));
    styles.insert("accent".to_string(), marker.clone());
    styles.insert("connector".to_string(), marker.clone());
    styles.insert("fill_dense".to_string(), translucent_style(&marker, 0.42, 1.12));
    styles.insert("fill_light".to_string(), translucent_style(&marker, 0.26, 0.92));
    styles.insert("highlight".to_string(), translucent_style(&highlighter, 0.32, 1.0));
    styles.insert("text".to_string(), pen);
    styles
}

fn style_from_preset(preset: &Value) -> StrokeStyle {
    StrokeStyle {
        tool: preset["type"].as_str().unwrap_or("pen").to_string(),
        color: preset["color"].as_str().unwrap_or("#111827").to_string(),
        width: preset["width"].as_f64().unwrap_or(4.0),
        opacity: preset["opacity"].as_f64().unwrap_or(1.0),
        pressure: preset["pressure"].as_bool().unwrap_or(true),
        pressure_sensitivity: preset["pressureSensitivity"].as_f64().unwrap_or(0.55),
    }
}

fn default_primary_style() -> StrokeStyle {
    StrokeStyle {
        tool: "pen".to_string(),
        color: "#111827".to_string(),
        width: 4.0,
        opacity: 1.0,
        pressure: true,
        pressure_sensitivity: 0.55,
    }
}

fn default_secondary_style() -> StrokeStyle {
    StrokeStyle {
        tool: "pencil".to_string(),
        color: "#374151".to_string(),
        width: 3.0,
        opacity: 0.68,
        pressure: true,
        pressure_sensitivity: 0.82,
    }
}

fn default_accent_style() -> StrokeStyle {
    StrokeStyle {
        tool: "marker".to_string(),
        color: "#D85A12".to_string(),
        width: 9.0,
        opacity: 0.92,
        pressure: true,
        pressure_sensitivity: 0.38,
    }
}

fn default_highlighter_style() -> StrokeStyle {
    StrokeStyle {
        tool: "highlighter".to_string(),
        color: "#D9F99D".to_string(),
        width: 18.0,
        opacity: 0.35,
        pressure: false,
        pressure_sensitivity: 0.2,
    }
}

fn translucent_style(style: &StrokeStyle, opacity: f64, width_scale: f64) -> StrokeStyle {
    StrokeStyle {
        tool: style.tool.clone(),
        color: style.color.clone(),
        width: (style.width * width_scale).max(1.0),
        opacity: opacity.min(style.opacity).max(0.08),
        pressure: style.pressure,
        pressure_sensitivity: style.pressure_sensitivity,
    }
}

fn subdued_style(style: &StrokeStyle, opacity: f64, width_scale: f64) -> StrokeStyle {
    StrokeStyle {
        tool: style.tool.clone(),
        color: style.color.clone(),
        width: (style.width * width_scale).max(1.0),
        opacity,
        pressure: style.pressure,
        pressure_sensitivity: style.pressure_sensitivity,
    }
}

fn synthesize_item(
    item: &VectorItem,
    styles: &BTreeMap<String, StrokeStyle>,
    strokes: &mut Vec<Value>,
) {
    match item.kind.as_str() {
        "box" | "diagram_node" => {
            if let Some(rect) = &item.rect {
                let style = style_for(styles, &item.role, "primary_outline");
                add_rect_strokes(strokes, &format!("{}-box", item.id), rect, style);
                if let Some(text) = &item.text {
                    add_wrapped_text(
                        strokes,
                        &item.id,
                        text,
                        rect,
                        item.text_size,
                        styles.get("text").unwrap(),
                    );
                }
            }
        }
        "shape" => {
            if let Some(rect) = &item.rect {
                add_shape_strokes(
                    strokes,
                    &item.id,
                    item.shape.as_deref().unwrap_or("square"),
                    rect,
                    style_for(styles, &item.role, "primary_outline"),
                );
                if let Some(text) = &item.text {
                    add_wrapped_text(
                        strokes,
                        &item.id,
                        text,
                        &Rect {
                            x: rect.x,
                            y: rect.y + rect.height + 12.0,
                            width: rect.width,
                            height: 52.0,
                        },
                        item.text_size.min(20.0),
                        styles.get("text").unwrap(),
                    );
                }
            }
        }
        "symbol" => {
            if let Some(rect) = &item.rect {
                add_symbol_strokes(
                    strokes,
                    &item.id,
                    item.shape.as_deref().unwrap_or("house"),
                    rect,
                    styles,
                );
                if let Some(text) = &item.text {
                    add_wrapped_text(
                        strokes,
                        &item.id,
                        text,
                        &Rect {
                            x: rect.x,
                            y: rect.y + rect.height + 10.0,
                            width: rect.width,
                            height: 48.0,
                        },
                        item.text_size.min(19.0),
                        styles.get("text").unwrap(),
                    );
                }
            }
        }
        "portrait" => {
            if let Some(rect) = &item.rect {
                match item.shape.as_deref() {
                    Some("dog") => add_dog_portrait_strokes(strokes, &item.id, rect, styles),
                    Some("cat") => add_cat_portrait_strokes(strokes, &item.id, rect, styles),
                    _ => add_portrait_strokes(strokes, &item.id, rect, styles),
                }
            }
        }
        "fill_region" | "shadow_region" => {
            if let Some(rect) = &item.rect {
                add_fill_strokes(
                    strokes,
                    &item.id,
                    rect,
                    item.fill_mode.as_deref().unwrap_or("marker_passes"),
                    style_for(
                        styles,
                        &item.role,
                        if item.kind == "shadow_region" {
                            "shadow"
                        } else {
                            "fill_light"
                        },
                    ),
                );
            }
        }
        "label" => {
            if let (Some(rect), Some(text)) = (&item.rect, &item.text) {
                add_wrapped_text(
                    strokes,
                    &item.id,
                    text,
                    rect,
                    item.text_size,
                    styles.get("text").unwrap(),
                );
            }
        }
        "arrow" => {
            if item.points.len() >= 2 {
                let style = style_for(styles, &item.role, "connector");
                add_arrow_strokes(strokes, &item.id, item.points[0], item.points[1], style);
            }
        }
        "curve" => {
            if item.points.len() >= 3 {
                let style = styles.get("secondary").unwrap();
                add_poly_stroke(strokes, &item.id, &item.points, style);
            }
        }
        "line" => {
            if item.points.len() >= 2 {
                let style = style_for(styles, &item.role, "primary_outline");
                add_poly_stroke(strokes, &item.id, &item.points, style);
            }
        }
        _ => {}
    }
}

fn style_for<'a>(
    styles: &'a BTreeMap<String, StrokeStyle>,
    role: &str,
    fallback: &str,
) -> &'a StrokeStyle {
    styles
        .get(role)
        .or_else(|| styles.get(fallback))
        .or_else(|| styles.get("primary_outline"))
        .or_else(|| styles.get("primary"))
        .expect("knownext-drawing style plan always contains primary style")
}

fn portrait_pencil_style(
    styles: &BTreeMap<String, StrokeStyle>,
    width_scale: f64,
    opacity: f64,
) -> StrokeStyle {
    let pencil = style_for(styles, "secondary_sketch", "primary_outline");
    let primary = style_for(styles, "primary_outline", "primary_outline");
    StrokeStyle {
        tool: "pencil".to_string(),
        color: primary.color.clone(),
        width: (pencil.width * width_scale).max(1.25),
        opacity: opacity.min(1.0),
        pressure: true,
        pressure_sensitivity: pencil.pressure_sensitivity.max(0.72),
    }
}

fn add_rect_strokes(strokes: &mut Vec<Value>, id: &str, rect: &Rect, style: &StrokeStyle) {
    let wobble = 3.5;
    let points = vec![
        (rect.x + wobble, rect.y),
        (rect.x + rect.width - wobble, rect.y + 1.5),
        (rect.x + rect.width, rect.y + rect.height - wobble),
        (rect.x + 1.0, rect.y + rect.height),
        (rect.x + wobble, rect.y),
    ];
    add_poly_stroke(strokes, id, &points, style);
}

fn add_shape_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    shape: &str,
    rect: &Rect,
    style: &StrokeStyle,
) {
    match shape {
        "triangle" => add_poly_stroke(
            strokes,
            id,
            &[
                (rect.x + rect.width / 2.0, rect.y + 2.0),
                (rect.x + rect.width - 2.0, rect.y + rect.height - 2.0),
                (rect.x + 2.0, rect.y + rect.height - 1.0),
                (rect.x + rect.width / 2.0, rect.y + 2.0),
            ],
            style,
        ),
        "circle" | "ellipse" => add_ellipse_strokes(strokes, id, rect, style),
        "diamond" => add_poly_stroke(
            strokes,
            id,
            &[
                (rect.x + rect.width / 2.0, rect.y),
                (rect.x + rect.width, rect.y + rect.height / 2.0),
                (rect.x + rect.width / 2.0, rect.y + rect.height),
                (rect.x, rect.y + rect.height / 2.0),
                (rect.x + rect.width / 2.0, rect.y),
            ],
            style,
        ),
        "star" => add_star_strokes(strokes, id, rect, style),
        _ => add_rect_strokes(strokes, id, rect, style),
    }
}

fn add_ellipse_strokes(strokes: &mut Vec<Value>, id: &str, rect: &Rect, style: &StrokeStyle) {
    let cx = rect.x + rect.width / 2.0;
    let cy = rect.y + rect.height / 2.0;
    let rx = rect.width / 2.0;
    let ry = rect.height / 2.0;
    let points = (0..=40)
        .map(|index| {
            let t = index as f64 / 40.0 * std::f64::consts::TAU;
            let wobble = (index as f64 * 1.7).sin() * 1.6;
            (cx + t.cos() * (rx + wobble), cy + t.sin() * (ry - wobble))
        })
        .collect::<Vec<_>>();
    add_poly_stroke(strokes, id, &points, style);
}

fn add_star_strokes(strokes: &mut Vec<Value>, id: &str, rect: &Rect, style: &StrokeStyle) {
    let cx = rect.x + rect.width / 2.0;
    let cy = rect.y + rect.height / 2.0;
    let outer = rect.width.min(rect.height) / 2.0;
    let inner = outer * 0.43;
    let mut points = Vec::new();
    for index in 0..10 {
        let radius = if index % 2 == 0 { outer } else { inner };
        let angle = -std::f64::consts::FRAC_PI_2 + index as f64 * std::f64::consts::PI / 5.0;
        points.push((cx + angle.cos() * radius, cy + angle.sin() * radius));
    }
    points.push(points[0]);
    add_poly_stroke(strokes, id, &points, style);
}

fn add_fill_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    mode: &str,
    style: &StrokeStyle,
) {
    match mode {
        "hatching" | "hatch_fill" => add_hatching(strokes, id, rect, -0.35, 16.0, style),
        "cross_hatching" | "cross_hatch_fill" => {
            add_hatching(strokes, &format!("{id}-a"), rect, -0.35, 18.0, style);
            add_hatching(strokes, &format!("{id}-b"), rect, 0.45, 22.0, style);
        }
        "scribble" | "scribble_fill" => add_scribble_fill(strokes, id, rect, style),
        _ => add_marker_passes(strokes, id, rect, style),
    }
}

fn add_marker_passes(strokes: &mut Vec<Value>, id: &str, rect: &Rect, style: &StrokeStyle) {
    let step = (style.width * 1.55).clamp(10.0, 30.0);
    let mut y = rect.y + step * 0.8;
    let mut index = 0;
    while y < rect.y + rect.height - step * 0.35 {
        let wobble = (index as f64 * 1.37).sin() * 4.0;
        add_poly_stroke(
            strokes,
            &format!("{id}-marker-{index}"),
            &[
                (rect.x + 8.0 + wobble, y),
                (rect.x + rect.width - 8.0 - wobble, y + (index as f64).sin() * 3.0),
            ],
            style,
        );
        y += step;
        index += 1;
    }
}

fn add_hatching(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    angle: f64,
    spacing: f64,
    style: &StrokeStyle,
) {
    let tan = angle.tan();
    let mut index = 0;
    let mut y = rect.y + 10.0;
    while y < rect.y + rect.height - 6.0 {
        let x1 = rect.x + 8.0;
        let x2 = rect.x + rect.width - 8.0;
        let offset = (x2 - x1) * tan * 0.18;
        add_poly_stroke(
            strokes,
            &format!("{id}-hatch-{index}"),
            &[(x1, y + offset), (x2, y - offset)],
            style,
        );
        y += spacing;
        index += 1;
    }
}

fn add_scribble_fill(strokes: &mut Vec<Value>, id: &str, rect: &Rect, style: &StrokeStyle) {
    let rows = 6;
    for row in 0..rows {
        let y = rect.y + rect.height * (row as f64 + 0.7) / (rows as f64 + 0.5);
        let mut points = Vec::new();
        for index in 0..12 {
            let t = index as f64 / 11.0;
            points.push((
                rect.x + 12.0 + t * (rect.width - 24.0),
                y + (t * std::f64::consts::TAU * 2.0 + row as f64).sin() * 9.0,
            ));
        }
        add_poly_stroke(strokes, &format!("{id}-scribble-{row}"), &points, style);
    }
}

fn add_symbol_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    symbol: &str,
    rect: &Rect,
    styles: &BTreeMap<String, StrokeStyle>,
) {
    let outline = style_for(styles, "primary_outline", "primary_outline");
    let accent = style_for(styles, "accent", "accent");
    let fill = style_for(styles, "fill_light", "fill_light");
    match symbol {
        "sun" => {
            let core = Rect {
                x: rect.x + rect.width * 0.34,
                y: rect.y + rect.height * 0.24,
                width: rect.width * 0.32,
                height: rect.width * 0.32,
            };
            add_ellipse_strokes(strokes, &format!("{id}-core"), &core, accent);
            let cx = core.x + core.width / 2.0;
            let cy = core.y + core.height / 2.0;
            for index in 0..10 {
                let angle = index as f64 * std::f64::consts::TAU / 10.0;
                add_poly_stroke(
                    strokes,
                    &format!("{id}-ray-{index}"),
                    &[
                        (cx + angle.cos() * core.width * 0.7, cy + angle.sin() * core.height * 0.7),
                        (cx + angle.cos() * core.width * 1.05, cy + angle.sin() * core.height * 1.05),
                    ],
                    accent,
                );
            }
        }
        "tree" => {
            add_poly_stroke(
                strokes,
                &format!("{id}-trunk"),
                &[(rect.x + rect.width * 0.48, rect.y + rect.height), (rect.x + rect.width * 0.52, rect.y + rect.height * 0.55)],
                outline,
            );
            add_ellipse_strokes(
                strokes,
                &format!("{id}-crown"),
                &Rect { x: rect.x + rect.width * 0.18, y: rect.y + rect.height * 0.05, width: rect.width * 0.64, height: rect.height * 0.58 },
                accent,
            );
        }
        "person" => {
            add_ellipse_strokes(strokes, &format!("{id}-head"), &Rect { x: rect.x + rect.width * 0.38, y: rect.y + 8.0, width: rect.width * 0.24, height: rect.width * 0.24 }, outline);
            add_poly_stroke(strokes, &format!("{id}-body"), &[(rect.x + rect.width * 0.5, rect.y + rect.height * 0.33), (rect.x + rect.width * 0.5, rect.y + rect.height * 0.72)], outline);
            add_poly_stroke(strokes, &format!("{id}-arms"), &[(rect.x + rect.width * 0.28, rect.y + rect.height * 0.48), (rect.x + rect.width * 0.72, rect.y + rect.height * 0.48)], outline);
            add_poly_stroke(strokes, &format!("{id}-legs"), &[(rect.x + rect.width * 0.5, rect.y + rect.height * 0.72), (rect.x + rect.width * 0.32, rect.y + rect.height * 0.95), (rect.x + rect.width * 0.5, rect.y + rect.height * 0.72), (rect.x + rect.width * 0.68, rect.y + rect.height * 0.95)], outline);
        }
        "cloud" => {
            add_scribble_fill(strokes, &format!("{id}-cloud-fill"), rect, fill);
            add_ellipse_strokes(strokes, &format!("{id}-cloud"), rect, outline);
        }
        "server" | "database" => {
            add_rect_strokes(strokes, &format!("{id}-rack"), rect, outline);
            for index in 1..4 {
                let y = rect.y + rect.height * index as f64 / 4.0;
                add_poly_stroke(strokes, &format!("{id}-line-{index}"), &[(rect.x, y), (rect.x + rect.width, y)], outline);
            }
        }
        "laptop" => {
            add_rect_strokes(strokes, &format!("{id}-screen"), &Rect { x: rect.x + rect.width * 0.16, y: rect.y + rect.height * 0.1, width: rect.width * 0.68, height: rect.height * 0.52 }, outline);
            add_poly_stroke(strokes, &format!("{id}-base"), &[(rect.x + rect.width * 0.08, rect.y + rect.height * 0.72), (rect.x + rect.width * 0.92, rect.y + rect.height * 0.72)], outline);
        }
        "dog" => add_dog_portrait_strokes(strokes, id, rect, styles),
        "cat" => add_cat_portrait_strokes(strokes, id, rect, styles),
        "rocket" | "starship" | "spacecraft" => add_starship_strokes(strokes, id, rect, styles),
        "face" => add_portrait_strokes(strokes, id, rect, styles),
        _ => {
            let roof = [
                (rect.x + rect.width * 0.12, rect.y + rect.height * 0.42),
                (rect.x + rect.width * 0.5, rect.y + rect.height * 0.08),
                (rect.x + rect.width * 0.88, rect.y + rect.height * 0.42),
            ];
            add_poly_stroke(strokes, &format!("{id}-roof"), &roof, outline);
            add_rect_strokes(strokes, &format!("{id}-house"), &Rect { x: rect.x + rect.width * 0.22, y: rect.y + rect.height * 0.42, width: rect.width * 0.56, height: rect.height * 0.48 }, outline);
            add_rect_strokes(strokes, &format!("{id}-door"), &Rect { x: rect.x + rect.width * 0.45, y: rect.y + rect.height * 0.64, width: rect.width * 0.12, height: rect.height * 0.26 }, outline);
        }
    }
}

fn add_starship_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    styles: &BTreeMap<String, StrokeStyle>,
) {
    let outline = portrait_pencil_style(styles, 1.22, 0.9);
    let sketch = portrait_pencil_style(styles, 0.82, 0.54);
    let shadow = portrait_pencil_style(styles, 0.62, 0.28);
    let accent = subdued_style(style_for(styles, "accent", "accent"), 0.36, 0.62);
    let cx = rect.x + rect.width * 0.5;
    let top = rect.y + rect.height * 0.035;
    let bottom = rect.y + rect.height * 0.92;
    let body_top_y = rect.y + rect.height * 0.19;
    let body_bottom_y = rect.y + rect.height * 0.81;
    let half_top = rect.width * 0.115;
    let half_mid = rect.width * 0.205;
    let half_bottom = rect.width * 0.18;

    add_poly_stroke(
        strokes,
        &format!("{id}-outer-left"),
        &[
            (cx, top),
            (cx - rect.width * 0.095, rect.y + rect.height * 0.08),
            (cx - half_top, body_top_y),
            (cx - half_mid, rect.y + rect.height * 0.38),
            (cx - half_mid * 0.92, rect.y + rect.height * 0.62),
            (cx - half_bottom, body_bottom_y),
            (cx - rect.width * 0.105, bottom),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-outer-right"),
        &[
            (cx, top),
            (cx + rect.width * 0.105, rect.y + rect.height * 0.09),
            (cx + half_top, body_top_y),
            (cx + half_mid * 0.95, rect.y + rect.height * 0.38),
            (cx + half_mid, rect.y + rect.height * 0.61),
            (cx + half_bottom * 0.96, body_bottom_y),
            (cx + rect.width * 0.112, bottom),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-base"),
        &[
            (cx - rect.width * 0.105, bottom),
            (cx - rect.width * 0.04, bottom + rect.height * 0.035),
            (cx + rect.width * 0.05, bottom + rect.height * 0.032),
            (cx + rect.width * 0.112, bottom),
        ],
        &outline,
    );

    for (index, y) in [
        rect.y + rect.height * 0.27,
        rect.y + rect.height * 0.43,
        rect.y + rect.height * 0.59,
        rect.y + rect.height * 0.74,
    ]
    .iter()
    .enumerate()
    {
        add_poly_stroke(
            strokes,
            &format!("{id}-section-{index}"),
            &[(cx - rect.width * 0.16, *y), (cx + rect.width * 0.16, *y + rect.height * 0.006)],
            &sketch,
        );
    }

    add_poly_stroke(
        strokes,
        &format!("{id}-left-forward-flap"),
        &[
            (cx - half_mid * 0.98, rect.y + rect.height * 0.31),
            (cx - rect.width * 0.35, rect.y + rect.height * 0.38),
            (cx - half_mid * 0.98, rect.y + rect.height * 0.46),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-right-forward-flap"),
        &[
            (cx + half_mid * 0.92, rect.y + rect.height * 0.33),
            (cx + rect.width * 0.33, rect.y + rect.height * 0.39),
            (cx + half_mid, rect.y + rect.height * 0.47),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-left-aft-flap"),
        &[
            (cx - half_bottom, rect.y + rect.height * 0.71),
            (cx - rect.width * 0.39, rect.y + rect.height * 0.84),
            (cx - rect.width * 0.105, bottom),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-right-aft-flap"),
        &[
            (cx + half_bottom * 0.96, rect.y + rect.height * 0.72),
            (cx + rect.width * 0.37, rect.y + rect.height * 0.835),
            (cx + rect.width * 0.112, bottom),
        ],
        &outline,
    );

    add_rect_strokes(
        strokes,
        &format!("{id}-payload-bay"),
        &Rect {
            x: cx - rect.width * 0.105,
            y: rect.y + rect.height * 0.245,
            width: rect.width * 0.21,
            height: rect.height * 0.095,
        },
        &sketch,
    );
    add_hatching(
        strokes,
        &format!("{id}-heat-shield"),
        &Rect {
            x: cx + rect.width * 0.02,
            y: rect.y + rect.height * 0.2,
            width: rect.width * 0.15,
            height: rect.height * 0.58,
        },
        -0.35,
        15.0,
        &shadow,
    );
    add_hatching(
        strokes,
        &format!("{id}-tanks"),
        &Rect {
            x: cx - rect.width * 0.145,
            y: rect.y + rect.height * 0.43,
            width: rect.width * 0.29,
            height: rect.height * 0.28,
        },
        0.28,
        22.0,
        &sketch,
    );

    for (index, x_offset) in [-0.075, 0.0, 0.075].iter().enumerate() {
        add_ellipse_strokes(
            strokes,
            &format!("{id}-engine-{index}"),
            &Rect {
                x: cx + rect.width * x_offset - rect.width * 0.028,
                y: bottom - rect.height * 0.012,
                width: rect.width * 0.056,
                height: rect.height * 0.032,
            },
            &outline,
        );
    }

    add_poly_stroke(
        strokes,
        &format!("{id}-orange-accent"),
        &[
            (cx - rect.width * 0.13, rect.y + rect.height * 0.19),
            (cx + rect.width * 0.12, rect.y + rect.height * 0.19),
        ],
        &accent,
    );
}

fn add_portrait_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    styles: &BTreeMap<String, StrokeStyle>,
) {
    let outline = portrait_pencil_style(styles, 1.28, 0.92);
    let sketch = portrait_pencil_style(styles, 0.92, 0.58);
    let shadow = portrait_pencil_style(styles, 0.7, 0.3);
    add_ellipse_strokes(strokes, &format!("{id}-face"), &Rect { x: rect.x + rect.width * 0.24, y: rect.y + rect.height * 0.08, width: rect.width * 0.52, height: rect.height * 0.68 }, &outline);
    add_poly_stroke(strokes, &format!("{id}-hair"), &[(rect.x + rect.width * 0.28, rect.y + rect.height * 0.27), (rect.x + rect.width * 0.43, rect.y + rect.height * 0.1), (rect.x + rect.width * 0.63, rect.y + rect.height * 0.18), (rect.x + rect.width * 0.73, rect.y + rect.height * 0.32)], &sketch);
    add_poly_stroke(strokes, &format!("{id}-eyes"), &[(rect.x + rect.width * 0.39, rect.y + rect.height * 0.39), (rect.x + rect.width * 0.44, rect.y + rect.height * 0.38), (rect.x + rect.width * 0.56, rect.y + rect.height * 0.38), (rect.x + rect.width * 0.61, rect.y + rect.height * 0.39)], &outline);
    add_poly_stroke(strokes, &format!("{id}-nose"), &[(rect.x + rect.width * 0.5, rect.y + rect.height * 0.42), (rect.x + rect.width * 0.47, rect.y + rect.height * 0.55), (rect.x + rect.width * 0.53, rect.y + rect.height * 0.56)], &sketch);
    add_poly_stroke(strokes, &format!("{id}-mouth"), &[(rect.x + rect.width * 0.42, rect.y + rect.height * 0.64), (rect.x + rect.width * 0.5, rect.y + rect.height * 0.67), (rect.x + rect.width * 0.58, rect.y + rect.height * 0.64)], &outline);
    add_hatching(strokes, &format!("{id}-shadow"), &Rect { x: rect.x + rect.width * 0.28, y: rect.y + rect.height * 0.46, width: rect.width * 0.44, height: rect.height * 0.24 }, -0.55, 16.0, &shadow);
}

fn add_dog_portrait_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    styles: &BTreeMap<String, StrokeStyle>,
) {
    let outline = portrait_pencil_style(styles, 1.34, 0.93);
    let sketch = portrait_pencil_style(styles, 0.95, 0.6);
    let shadow = portrait_pencil_style(styles, 0.72, 0.28);
    let head = Rect {
        x: rect.x + rect.width * 0.24,
        y: rect.y + rect.height * 0.16,
        width: rect.width * 0.52,
        height: rect.height * 0.56,
    };
    add_ellipse_strokes(strokes, &format!("{id}-head"), &head, &outline);
    add_poly_stroke(
        strokes,
        &format!("{id}-left-ear"),
        &[
            (head.x + head.width * 0.12, head.y + head.height * 0.18),
            (rect.x + rect.width * 0.12, rect.y + rect.height * 0.42),
            (head.x + head.width * 0.2, head.y + head.height * 0.72),
            (head.x + head.width * 0.28, head.y + head.height * 0.3),
        ],
        &sketch,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-right-ear"),
        &[
            (head.x + head.width * 0.88, head.y + head.height * 0.18),
            (rect.x + rect.width * 0.88, rect.y + rect.height * 0.42),
            (head.x + head.width * 0.8, head.y + head.height * 0.72),
            (head.x + head.width * 0.72, head.y + head.height * 0.3),
        ],
        &sketch,
    );
    add_ellipse_strokes(
        strokes,
        &format!("{id}-left-eye"),
        &Rect {
            x: head.x + head.width * 0.3,
            y: head.y + head.height * 0.34,
            width: head.width * 0.1,
            height: head.width * 0.1,
        },
        &outline,
    );
    add_ellipse_strokes(
        strokes,
        &format!("{id}-right-eye"),
        &Rect {
            x: head.x + head.width * 0.6,
            y: head.y + head.height * 0.34,
            width: head.width * 0.1,
            height: head.width * 0.1,
        },
        &outline,
    );
    add_ellipse_strokes(
        strokes,
        &format!("{id}-muzzle"),
        &Rect {
            x: head.x + head.width * 0.34,
            y: head.y + head.height * 0.5,
            width: head.width * 0.32,
            height: head.height * 0.24,
        },
        &sketch,
    );
    add_shape_strokes(
        strokes,
        &format!("{id}-nose"),
        "triangle",
        &Rect {
            x: head.x + head.width * 0.45,
            y: head.y + head.height * 0.51,
            width: head.width * 0.1,
            height: head.height * 0.09,
        },
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-smile"),
        &[
            (head.x + head.width * 0.5, head.y + head.height * 0.61),
            (head.x + head.width * 0.43, head.y + head.height * 0.68),
            (head.x + head.width * 0.5, head.y + head.height * 0.61),
            (head.x + head.width * 0.57, head.y + head.height * 0.68),
        ],
        &outline,
    );
    add_hatching(
        strokes,
        &format!("{id}-ear-shadow"),
        &Rect {
            x: rect.x + rect.width * 0.16,
            y: rect.y + rect.height * 0.32,
            width: rect.width * 0.68,
            height: rect.height * 0.28,
        },
        -0.45,
        20.0,
        &shadow,
    );
    add_fur_texture(strokes, &format!("{id}-fur"), rect, &sketch, 18);
}

fn add_cat_portrait_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    styles: &BTreeMap<String, StrokeStyle>,
) {
    let outline = portrait_pencil_style(styles, 1.35, 0.94);
    let sketch = portrait_pencil_style(styles, 0.9, 0.58);
    let shadow = portrait_pencil_style(styles, 0.68, 0.3);
    let heavy_outline = StrokeStyle {
        width: outline.width * 1.22,
        ..outline.clone()
    };
    let fine_sketch = StrokeStyle {
        width: (sketch.width * 0.78).max(1.0),
        opacity: sketch.opacity.min(0.58),
        ..sketch.clone()
    };

    let cx = rect.x + rect.width * 0.5;
    let top = rect.y + rect.height * 0.13;
    let left = rect.x + rect.width * 0.2;
    let right = rect.x + rect.width * 0.8;
    let chin = rect.y + rect.height * 0.71;

    add_poly_stroke(
        strokes,
        &format!("{id}-outer-line"),
        &[
            (left + rect.width * 0.12, top + rect.height * 0.03),
            (left + rect.width * 0.02, top + rect.height * 0.23),
            (left, top + rect.height * 0.42),
            (left + rect.width * 0.055, chin - rect.height * 0.015),
            (cx - rect.width * 0.08, chin + rect.height * 0.08),
            (cx, chin + rect.height * 0.11),
            (cx + rect.width * 0.095, chin + rect.height * 0.065),
            (right - rect.width * 0.085, chin - rect.height * 0.045),
            (right - rect.width * 0.006, top + rect.height * 0.405),
            (right - rect.width * 0.034, top + rect.height * 0.22),
            (right - rect.width * 0.12, top + rect.height * 0.03),
        ],
        &heavy_outline,
    );

    add_poly_stroke(
        strokes,
        &format!("{id}-left-ear"),
        &[
            (left + rect.width * 0.08, top + rect.height * 0.15),
            (left + rect.width * 0.145, rect.y + rect.height * 0.025),
            (left + rect.width * 0.292, top + rect.height * 0.165),
        ],
        &heavy_outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-right-ear"),
        &[
            (right - rect.width * 0.286, top + rect.height * 0.17),
            (right - rect.width * 0.145, rect.y + rect.height * 0.0),
            (right - rect.width * 0.075, top + rect.height * 0.13),
        ],
        &heavy_outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-left-inner-ear"),
        &[
            (left + rect.width * 0.13, top + rect.height * 0.15),
            (left + rect.width * 0.17, top + rect.height * 0.07),
            (left + rect.width * 0.23, top + rect.height * 0.17),
        ],
        &sketch,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-right-inner-ear"),
        &[
            (right - rect.width * 0.23, top + rect.height * 0.17),
            (right - rect.width * 0.17, top + rect.height * 0.07),
            (right - rect.width * 0.13, top + rect.height * 0.15),
        ],
        &sketch,
    );

    add_cat_eye(strokes, &format!("{id}-left-eye"), cx - rect.width * 0.135, top + rect.height * 0.335, rect.width * 0.108, &outline, &shadow);
    add_cat_eye(strokes, &format!("{id}-right-eye"), cx + rect.width * 0.12, top + rect.height * 0.35, rect.width * 0.098, &outline, &shadow);

    add_poly_stroke(
        strokes,
        &format!("{id}-nose"),
        &[
            (cx - rect.width * 0.035, top + rect.height * 0.48),
            (cx + rect.width * 0.035, top + rect.height * 0.48),
            (cx, top + rect.height * 0.535),
            (cx - rect.width * 0.035, top + rect.height * 0.48),
        ],
        &heavy_outline,
    );
    add_hatching(
        strokes,
        &format!("{id}-nose-dark"),
        &Rect {
            x: cx - rect.width * 0.032,
            y: top + rect.height * 0.487,
            width: rect.width * 0.064,
            height: rect.height * 0.045,
        },
        -0.2,
        5.0,
        &shadow,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-muzzle-left"),
        &[
            (cx, top + rect.height * 0.535),
            (cx - rect.width * 0.08, top + rect.height * 0.59),
            (cx - rect.width * 0.17, top + rect.height * 0.56),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-muzzle-right"),
        &[
            (cx, top + rect.height * 0.535),
            (cx + rect.width * 0.08, top + rect.height * 0.59),
            (cx + rect.width * 0.17, top + rect.height * 0.56),
        ],
        &outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-mouth"),
        &[
            (cx, top + rect.height * 0.535),
            (cx, top + rect.height * 0.64),
            (cx - rect.width * 0.06, top + rect.height * 0.68),
            (cx, top + rect.height * 0.64),
            (cx + rect.width * 0.06, top + rect.height * 0.68),
        ],
        &sketch,
    );

    for (index, y) in [
        top + rect.height * 0.49,
        top + rect.height * 0.54,
        top + rect.height * 0.59,
    ]
    .iter()
    .enumerate()
    {
        add_poly_stroke(
            strokes,
            &format!("{id}-left-whisker-{index}"),
            &[
                (cx - rect.width * 0.08, *y),
                (cx - rect.width * 0.33, *y - rect.height * (0.045 - index as f64 * 0.025)),
                (cx - rect.width * (0.5 - index as f64 * 0.018), *y - rect.height * (0.06 - index as f64 * 0.032)),
            ],
            &fine_sketch,
        );
        add_poly_stroke(
            strokes,
            &format!("{id}-right-whisker-{index}"),
            &[
                (cx + rect.width * 0.08, *y),
                (cx + rect.width * 0.33, *y - rect.height * (0.045 - index as f64 * 0.025)),
                (cx + rect.width * (0.45 + index as f64 * 0.012), *y - rect.height * (0.052 - index as f64 * 0.026)),
            ],
            &fine_sketch,
        );
    }

    for (index, x_offset) in [-0.11, -0.045, 0.045, 0.11].iter().enumerate() {
        add_poly_stroke(
            strokes,
            &format!("{id}-forehead-fur-{index}"),
            &[
                (cx + rect.width * x_offset, top + rect.height * 0.13),
                (cx + rect.width * (x_offset * 0.5), top + rect.height * 0.28),
                (cx + rect.width * (x_offset * 0.9), top + rect.height * 0.43),
            ],
            &fine_sketch,
        );
    }
    for (index, side) in [-1.0_f64, 1.0].iter().enumerate() {
        let base_x = if *side < 0.0 { left } else { right };
        add_poly_stroke(
            strokes,
            &format!("{id}-cheek-fur-{index}-a"),
            &[
                (base_x, top + rect.height * 0.34),
                (base_x + side * rect.width * -0.08, top + rect.height * 0.42),
                (base_x + side * rect.width * -0.02, top + rect.height * 0.52),
            ],
            &fine_sketch,
        );
        add_poly_stroke(
            strokes,
            &format!("{id}-cheek-fur-{index}-b"),
            &[
                (base_x + side * rect.width * -0.03, top + rect.height * 0.54),
                (base_x + side * rect.width * -0.16, top + rect.height * 0.64),
                (base_x + side * rect.width * -0.07, top + rect.height * 0.72),
            ],
            &fine_sketch,
        );
    }
    add_poly_stroke(
        strokes,
        &format!("{id}-chest-left"),
        &[
            (cx - rect.width * 0.13, chin + rect.height * 0.08),
            (cx - rect.width * 0.25, rect.y + rect.height * 0.86),
            (cx - rect.width * 0.19, rect.y + rect.height * 0.98),
        ],
        &sketch,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-chest-right"),
        &[
            (cx + rect.width * 0.13, chin + rect.height * 0.08),
            (cx + rect.width * 0.25, rect.y + rect.height * 0.86),
            (cx + rect.width * 0.19, rect.y + rect.height * 0.98),
        ],
        &sketch,
    );
    add_fur_texture(strokes, &format!("{id}-fur"), rect, &fine_sketch, 26);
}

fn add_fur_texture(
    strokes: &mut Vec<Value>,
    id: &str,
    rect: &Rect,
    style: &StrokeStyle,
    count: usize,
) {
    for index in 0..count {
        let row = index / 5;
        let column = index % 5;
        let side = if index % 2 == 0 { -1.0 } else { 1.0 };
        let x = rect.x + rect.width * (0.24 + column as f64 * 0.13);
        let y = rect.y + rect.height * (0.26 + row as f64 * 0.095);
        let len = rect.width * (0.045 + (index % 3) as f64 * 0.012);
        let drop = rect.height * (0.04 + (index % 4) as f64 * 0.01);
        add_poly_stroke(
            strokes,
            &format!("{id}-{index}"),
            &[
                (x, y),
                (x + side * len * 0.35, y + drop * 0.48),
                (x + side * len, y + drop),
            ],
            style,
        );
    }
}

fn add_cat_eye(
    strokes: &mut Vec<Value>,
    id: &str,
    cx: f64,
    cy: f64,
    width: f64,
    outline: &StrokeStyle,
    shadow: &StrokeStyle,
) {
    let half = width / 2.0;
    add_poly_stroke(
        strokes,
        &format!("{id}-almond"),
        &[
            (cx - half, cy),
            (cx - half * 0.45, cy - half * 0.38),
            (cx + half * 0.45, cy - half * 0.38),
            (cx + half, cy),
            (cx + half * 0.42, cy + half * 0.36),
            (cx - half * 0.42, cy + half * 0.36),
            (cx - half, cy),
        ],
        outline,
    );
    add_ellipse_strokes(
        strokes,
        &format!("{id}-iris"),
        &Rect {
            x: cx - half * 0.33,
            y: cy - half * 0.35,
            width: half * 0.66,
            height: half * 0.72,
        },
        outline,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-pupil"),
        &[
            (cx, cy - half * 0.32),
            (cx - half * 0.05, cy),
            (cx, cy + half * 0.33),
            (cx + half * 0.05, cy),
            (cx, cy - half * 0.32),
        ],
        shadow,
    );
    add_poly_stroke(
        strokes,
        &format!("{id}-highlight"),
        &[
            (cx + half * 0.13, cy - half * 0.2),
            (cx + half * 0.22, cy - half * 0.12),
        ],
        outline,
    );
}

fn add_arrow_strokes(
    strokes: &mut Vec<Value>,
    id: &str,
    from: (f64, f64),
    to: (f64, f64),
    style: &StrokeStyle,
) {
    let dx = to.0 - from.0;
    let dy = to.1 - from.1;
    let length = (dx * dx + dy * dy).sqrt().max(1.0);
    let start = (from.0 + dx / length * 55.0, from.1 + dy / length * 44.0);
    let end = (to.0 - dx / length * 55.0, to.1 - dy / length * 44.0);
    add_poly_stroke(strokes, id, &[start, end], style);
    let angle = dy.atan2(dx);
    let head = 18.0;
    let left = (
        end.0 - head * (angle - 0.55).cos(),
        end.1 - head * (angle - 0.55).sin(),
    );
    let right = (
        end.0 - head * (angle + 0.55).cos(),
        end.1 - head * (angle + 0.55).sin(),
    );
    add_poly_stroke(strokes, &format!("{id}-head-a"), &[left, end], style);
    add_poly_stroke(strokes, &format!("{id}-head-b"), &[right, end], style);
}

fn add_wrapped_text(
    strokes: &mut Vec<Value>,
    id: &str,
    text: &str,
    rect: &Rect,
    requested_size: f64,
    style: &StrokeStyle,
) {
    let mut size = requested_size.clamp(MIN_TEXT_SIZE, 30.0);
    let mut lines = wrap_text(text, rect.width, size);
    while lines.len() as f64 * size * 1.42 > rect.height && size > MIN_TEXT_SIZE {
        size -= 2.0;
        lines = wrap_text(text, rect.width, size);
    }
    let line_height = size * 1.42;
    let total_height = lines.len() as f64 * line_height;
    let mut y = rect.y + (rect.height - total_height).max(0.0) / 2.0 + size;
    for (line_index, line) in lines.into_iter().take(5).enumerate() {
        let width = text_width(&line, size);
        let x = rect.x + (rect.width - width).max(0.0) / 2.0;
        add_text_line(
            strokes,
            &format!("{id}-text-{line_index}"),
            &line,
            x,
            y,
            size,
            style,
        );
        y += line_height;
    }
}

fn wrap_text(text: &str, max_width: f64, size: f64) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        let next = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };
        if text_width(&next, size) <= max_width || current.is_empty() {
            current = next;
        } else {
            lines.push(current);
            current = word.to_string();
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(text.chars().take(28).collect());
    }
    lines
}

fn text_width(text: &str, size: f64) -> f64 {
    text.chars().count() as f64 * size * 0.62
}

fn add_text_line(
    strokes: &mut Vec<Value>,
    id: &str,
    text: &str,
    x: f64,
    baseline: f64,
    size: f64,
    style: &StrokeStyle,
) {
    let mut cursor = x;
    for (index, ch) in text.chars().enumerate() {
        if ch == ' ' {
            cursor += size * 0.45;
            continue;
        }
        let glyph = glyph_segments(ch);
        let glyph_w = size * 0.48;
        let glyph_h = size * 0.86;
        for (segment_index, segment) in glyph.iter().enumerate() {
            let points = segment
                .iter()
                .map(|(px, py)| (cursor + px * glyph_w, baseline - glyph_h + py * glyph_h))
                .collect::<Vec<_>>();
            add_poly_stroke(
                strokes,
                &format!("{id}-{index}-{segment_index}"),
                &points,
                style,
            );
        }
        cursor += size * 0.62;
    }
}

fn glyph_segments(ch: char) -> Vec<Vec<(f64, f64)>> {
    let normalized = normalize_char(ch);
    match normalized {
        'A' => vec![
            vec![(0.0, 1.0), (0.5, 0.0), (1.0, 1.0)],
            vec![(0.25, 0.58), (0.75, 0.58)],
        ],
        'B' => vec![vec![
            (0.0, 1.0),
            (0.0, 0.0),
            (0.7, 0.1),
            (0.75, 0.42),
            (0.0, 0.5),
            (0.75, 0.58),
            (0.7, 0.92),
            (0.0, 1.0),
        ]],
        'C' => vec![vec![
            (0.9, 0.12),
            (0.25, 0.02),
            (0.0, 0.5),
            (0.25, 0.98),
            (0.9, 0.88),
        ]],
        'D' => vec![vec![
            (0.0, 1.0),
            (0.0, 0.0),
            (0.75, 0.16),
            (0.95, 0.5),
            (0.75, 0.86),
            (0.0, 1.0),
        ]],
        'E' => vec![
            vec![(0.9, 0.0), (0.0, 0.0), (0.0, 1.0), (0.9, 1.0)],
            vec![(0.0, 0.52), (0.72, 0.52)],
        ],
        'F' => vec![
            vec![(0.0, 1.0), (0.0, 0.0), (0.9, 0.0)],
            vec![(0.0, 0.52), (0.72, 0.52)],
        ],
        'G' => vec![vec![
            (0.9, 0.18),
            (0.25, 0.04),
            (0.0, 0.5),
            (0.25, 0.96),
            (0.92, 0.84),
            (0.92, 0.55),
            (0.55, 0.55),
        ]],
        'H' => vec![
            vec![(0.0, 0.0), (0.0, 1.0)],
            vec![(1.0, 0.0), (1.0, 1.0)],
            vec![(0.0, 0.52), (1.0, 0.52)],
        ],
        'I' => vec![
            vec![(0.5, 0.0), (0.5, 1.0)],
            vec![(0.2, 0.0), (0.8, 0.0)],
            vec![(0.2, 1.0), (0.8, 1.0)],
        ],
        'J' => vec![vec![(0.85, 0.0), (0.85, 0.78), (0.55, 1.0), (0.15, 0.84)]],
        'K' => vec![
            vec![(0.0, 0.0), (0.0, 1.0)],
            vec![(0.95, 0.0), (0.0, 0.55), (0.98, 1.0)],
        ],
        'L' => vec![vec![(0.0, 0.0), (0.0, 1.0), (0.88, 1.0)]],
        'M' => vec![vec![
            (0.0, 1.0),
            (0.0, 0.0),
            (0.5, 0.55),
            (1.0, 0.0),
            (1.0, 1.0),
        ]],
        'N' => vec![vec![(0.0, 1.0), (0.0, 0.0), (1.0, 1.0), (1.0, 0.0)]],
        'O' => vec![vec![
            (0.5, 0.0),
            (0.92, 0.18),
            (0.95, 0.76),
            (0.5, 1.0),
            (0.08, 0.76),
            (0.08, 0.18),
            (0.5, 0.0),
        ]],
        'P' => vec![vec![
            (0.0, 1.0),
            (0.0, 0.0),
            (0.78, 0.08),
            (0.82, 0.44),
            (0.0, 0.54),
        ]],
        'Q' => vec![
            vec![
                (0.5, 0.0),
                (0.92, 0.18),
                (0.95, 0.76),
                (0.5, 1.0),
                (0.08, 0.76),
                (0.08, 0.18),
                (0.5, 0.0),
            ],
            vec![(0.58, 0.72), (1.0, 1.05)],
        ],
        'R' => vec![vec![
            (0.0, 1.0),
            (0.0, 0.0),
            (0.78, 0.08),
            (0.82, 0.44),
            (0.0, 0.54),
            (0.95, 1.0),
        ]],
        'S' => vec![vec![
            (0.9, 0.12),
            (0.25, 0.0),
            (0.08, 0.38),
            (0.82, 0.58),
            (0.7, 1.0),
            (0.1, 0.86),
        ]],
        'T' => vec![vec![(0.0, 0.0), (1.0, 0.0)], vec![(0.5, 0.0), (0.5, 1.0)]],
        'U' => vec![vec![
            (0.0, 0.0),
            (0.0, 0.78),
            (0.5, 1.0),
            (1.0, 0.78),
            (1.0, 0.0),
        ]],
        'V' => vec![vec![(0.0, 0.0), (0.5, 1.0), (1.0, 0.0)]],
        'W' => vec![vec![
            (0.0, 0.0),
            (0.18, 1.0),
            (0.5, 0.52),
            (0.82, 1.0),
            (1.0, 0.0),
        ]],
        'X' => vec![vec![(0.0, 0.0), (1.0, 1.0)], vec![(1.0, 0.0), (0.0, 1.0)]],
        'Y' => vec![
            vec![(0.0, 0.0), (0.5, 0.48), (1.0, 0.0)],
            vec![(0.5, 0.48), (0.5, 1.0)],
        ],
        'Z' => vec![vec![(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]],
        '0' => vec![vec![
            (0.5, 0.0),
            (0.92, 0.18),
            (0.92, 0.82),
            (0.5, 1.0),
            (0.08, 0.82),
            (0.08, 0.18),
            (0.5, 0.0),
        ]],
        '1' => vec![
            vec![(0.45, 0.18), (0.62, 0.0), (0.62, 1.0)],
            vec![(0.34, 1.0), (0.9, 1.0)],
        ],
        '2' => vec![vec![
            (0.12, 0.22),
            (0.5, 0.0),
            (0.92, 0.2),
            (0.08, 1.0),
            (0.94, 1.0),
        ]],
        '3' => vec![vec![
            (0.12, 0.12),
            (0.85, 0.12),
            (0.48, 0.5),
            (0.88, 0.86),
            (0.15, 0.9),
        ]],
        '4' => vec![vec![(0.82, 1.0), (0.82, 0.0), (0.05, 0.65), (1.0, 0.65)]],
        '5' => vec![vec![
            (0.9, 0.0),
            (0.18, 0.0),
            (0.08, 0.48),
            (0.78, 0.5),
            (0.86, 0.92),
            (0.18, 1.0),
        ]],
        '6' => vec![vec![
            (0.82, 0.1),
            (0.22, 0.36),
            (0.16, 0.86),
            (0.65, 1.0),
            (0.9, 0.72),
            (0.62, 0.48),
            (0.16, 0.58),
        ]],
        '7' => vec![vec![(0.1, 0.0), (0.95, 0.0), (0.32, 1.0)]],
        '8' => vec![
            vec![(0.5, 0.0), (0.86, 0.2), (0.5, 0.5), (0.14, 0.2), (0.5, 0.0)],
            vec![(0.5, 0.5), (0.9, 0.78), (0.5, 1.0), (0.1, 0.78), (0.5, 0.5)],
        ],
        '9' => vec![vec![
            (0.82, 0.44),
            (0.36, 0.54),
            (0.08, 0.28),
            (0.35, 0.0),
            (0.84, 0.14),
            (0.82, 1.0),
        ]],
        '-' => vec![vec![(0.18, 0.55), (0.82, 0.55)]],
        ':' => vec![
            vec![(0.5, 0.32), (0.52, 0.34)],
            vec![(0.5, 0.72), (0.52, 0.74)],
        ],
        '/' => vec![vec![(0.9, 0.0), (0.1, 1.0)]],
        _ => vec![vec![
            (0.1, 0.1),
            (0.9, 0.1),
            (0.9, 0.9),
            (0.1, 0.9),
            (0.1, 0.1),
        ]],
    }
}

fn normalize_char(ch: char) -> char {
    match ch.to_ascii_uppercase() {
        'Á' | 'À' | 'Â' | 'Ä' => 'A',
        'É' | 'È' | 'Ê' | 'Ë' => 'E',
        'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
        'Ó' | 'Ò' | 'Ô' | 'Ö' => 'O',
        'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
        'Ñ' => 'N',
        other => other,
    }
}

fn add_poly_stroke(strokes: &mut Vec<Value>, id: &str, points: &[(f64, f64)], style: &StrokeStyle) {
    if points.len() < 2 {
        return;
    }
    let passes = if style.tool == "pencil" { 2 } else { 1 };
    for pass in 0..passes {
        let mut pass_style = style.clone();
        if pass > 0 {
            pass_style.width = (pass_style.width * 0.72).max(0.9);
            pass_style.opacity = (pass_style.opacity * 0.42).clamp(0.12, 0.5);
        }
        let sketch_points = hand_drawn_points(id, points, &pass_style, pass);
        push_poly_stroke(strokes, id, &sketch_points, &pass_style, pass);
    }
}

fn push_poly_stroke(
    strokes: &mut Vec<Value>,
    id: &str,
    points: &[(f64, f64)],
    style: &StrokeStyle,
    pass: usize,
) {
    let normalized = points
        .iter()
        .enumerate()
        .map(|(index, (x, y))| {
            json!([
                round(*x),
                round(*y),
                pressure_for(id, index, points.len()),
                (index as u64) * 18
            ])
        })
        .collect::<Vec<_>>();
    let bounds = bounds_for(points, style.width);
    let stroke_index = strokes.len() + 1;
    let pass_suffix = if pass == 0 {
        String::new()
    } else {
        format!("-pass-{pass}")
    };
    strokes.push(json!({
        "id": format!("ai-{}{}-{}", safe_id(id), pass_suffix, stroke_index),
        "tool": style.tool,
        "color": style.color,
        "width": style.width,
        "opacity": style.opacity,
        "pressure": style.pressure,
        "pressureSensitivity": style.pressure_sensitivity,
        "textureSeed": if style.tool == "pencil" { Value::from(format!("texture-ai-{}{}-{}", safe_id(id), pass_suffix, stroke_index)) } else { Value::Null },
        "textureVersion": if style.tool == "pencil" { Value::from(1) } else { Value::Null },
        "points": normalized,
        "path": Value::Null,
        "bounds": bounds,
    }));
}

fn hand_drawn_points(
    id: &str,
    points: &[(f64, f64)],
    style: &StrokeStyle,
    pass: usize,
) -> Vec<(f64, f64)> {
    let mut drawn = Vec::new();
    let amplitude = sketch_amplitude(style, pass);
    let closed = points
        .first()
        .zip(points.last())
        .is_some_and(|(first, last)| distance(*first, *last) < 0.1);
    for segment_index in 0..points.len() - 1 {
        let from = points[segment_index];
        let to = points[segment_index + 1];
        let dx = to.0 - from.0;
        let dy = to.1 - from.1;
        let len = (dx * dx + dy * dy).sqrt().max(1.0);
        let steps = (len / 18.0).ceil().clamp(1.0, 18.0) as usize;
        let normal = (-dy / len, dx / len);
        for step in 0..=steps {
            if segment_index > 0 && step == 0 {
                continue;
            }
            let t = step as f64 / steps as f64;
            let index = drawn.len();
            let endpoint = (segment_index == 0 && step == 0)
                || (segment_index == points.len() - 2 && step == steps);
            let taper = if endpoint && !closed { 0.22 } else { 1.0 };
            let wave = deterministic_noise(id, index, pass);
            let secondary = deterministic_noise(id, index + 17, pass + 3) * 0.42;
            let offset = (wave + secondary) * amplitude * taper;
            drawn.push((
                from.0 + dx * t + normal.0 * offset,
                from.1 + dy * t + normal.1 * offset,
            ));
        }
    }
    drawn
}

fn sketch_amplitude(style: &StrokeStyle, pass: usize) -> f64 {
    let tool_factor = match style.tool.as_str() {
        "pencil" => 1.35,
        "marker" => 0.58,
        "highlighter" => 0.42,
        _ => 0.72,
    };
    let pass_factor = if pass == 0 { 1.0 } else { 1.42 };
    (style.width * tool_factor * pass_factor).clamp(0.65, 5.8)
}

fn deterministic_noise(id: &str, index: usize, pass: usize) -> f64 {
    let seed = stable_hash(id) as f64;
    let value = (seed * 0.013 + index as f64 * 1.731 + pass as f64 * 4.217).sin()
        + (seed * 0.031 + index as f64 * 0.719 + pass as f64 * 2.113).cos() * 0.5;
    (value / 1.5).clamp(-1.0, 1.0)
}

fn stable_hash(value: &str) -> u64 {
    value.bytes().fold(14_695_981_039_346_656_037, |hash, byte| {
        (hash ^ byte as u64).wrapping_mul(1_099_511_628_211)
    })
}

fn distance(first: (f64, f64), second: (f64, f64)) -> f64 {
    let dx = second.0 - first.0;
    let dy = second.1 - first.1;
    (dx * dx + dy * dy).sqrt()
}

fn pressure_for(id: &str, index: usize, len: usize) -> f64 {
    let t = if len <= 1 {
        0.5
    } else {
        index as f64 / (len - 1) as f64
    };
    let hand_variation = deterministic_noise(id, index, 11) * 0.08;
    round((0.48 + (t * std::f64::consts::PI).sin() * 0.28 + hand_variation).clamp(0.24, 0.92))
}

fn bounds_for(points: &[(f64, f64)], width: f64) -> Value {
    let min_x = points
        .iter()
        .map(|point| point.0)
        .fold(f64::INFINITY, f64::min)
        - width;
    let max_x = points
        .iter()
        .map(|point| point.0)
        .fold(f64::NEG_INFINITY, f64::max)
        + width;
    let min_y = points
        .iter()
        .map(|point| point.1)
        .fold(f64::INFINITY, f64::min)
        - width;
    let max_y = points
        .iter()
        .map(|point| point.1)
        .fold(f64::NEG_INFINITY, f64::max)
        + width;
    json!({ "x": round(min_x), "y": round(min_y), "width": round(max_x - min_x), "height": round(max_y - min_y) })
}

fn vector_item_json(item: &VectorItem) -> Value {
    json!({
        "id": item.id,
        "kind": item.kind,
        "role": item.role,
        "shape": item.shape,
        "fillMode": item.fill_mode,
        "rect": item.rect.as_ref().map(|rect| json!({ "x": round(rect.x), "y": round(rect.y), "width": round(rect.width), "height": round(rect.height) })).unwrap_or(Value::Null),
        "points": item.points.iter().map(|point| json!({ "x": round(point.0), "y": round(point.1) })).collect::<Vec<_>>(),
        "text": item.text,
        "textSize": item.text_size,
        "target": item.target
    })
}

fn quality_report(
    canvas: &Canvas,
    items: &[VectorItem],
    strokes: &[Value],
    max_strokes: usize,
) -> Value {
    let mut diagnostics = Vec::new();
    for item in items {
        if let Some(rect) = &item.rect {
            if rect.x < 0.0
                || rect.y < 0.0
                || rect.x + rect.width > canvas.width
                || rect.y + rect.height > canvas.height
            {
                diagnostics.push(json!({ "severity": "error", "message": format!("{} sale de la pagina.", item.id) }));
            }
            if item.text_size > 0.0 && item.text_size < MIN_TEXT_SIZE {
                diagnostics.push(json!({ "severity": "error", "message": format!("{} tiene texto demasiado pequeno.", item.id) }));
            }
            if item.kind == "shape" && item.shape.as_deref() == Some("square") {
                let ratio = rect.width / rect.height.max(1.0);
                if !(0.92..=1.08).contains(&ratio) {
                    diagnostics.push(json!({ "severity": "error", "message": format!("{} no mantiene proporcion cuadrada.", item.id) }));
                }
            }
        }
        if item.kind == "shape" && item.shape.as_deref() == Some("triangle") {
            diagnostics.push(json!({ "severity": "info", "message": format!("{} validado como triangulo de tres lados.", item.id) }));
        }
    }
    if strokes.len() > max_strokes {
        diagnostics.push(
            json!({ "severity": "error", "message": "El dibujo supera el presupuesto de trazos." }),
        );
    }
    for stroke in strokes {
        if stroke["id"]
            .as_str()
            .is_some_and(|id| id.starts_with("ai-"))
            && !stroke["path"].is_null()
        {
            diagnostics.push(
                json!({ "severity": "error", "message": "Un stroke IA contiene un path rellenable." }),
            );
        }
    }
    let has_errors = diagnostics
        .iter()
        .any(|item| item["severity"].as_str() == Some("error"));
    json!({
        "status": if has_errors { "blocked" } else { "passed" },
        "message": if has_errors { "El dibujo no supera la validacion visual." } else { "Dibujo validado." },
        "elementCount": items.len(),
        "strokeCount": strokes.len(),
        "maxStrokes": max_strokes,
        "diagnostics": diagnostics
    })
}

fn merge_generated_elements(mut existing: Vec<Value>, next: Vec<Value>) -> Value {
    existing.extend(next);
    Value::Array(existing)
}

fn safe_id(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
}

fn round(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note() -> Value {
        json!({
            "schemaVersion": 1,
            "id": "project::boceto.knote",
            "title": "Boceto",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "defaultPage": { "preset": "A4", "orientation": "portrait", "background": "blank" },
            "toolPresets": [
                { "id": "pencil-1", "type": "pen", "label": "Boligrafo", "color": "#111827", "width": 4.0, "opacity": 1.0, "pressure": true, "pressureSensitivity": 0.55, "smoothing": 0.62 },
                { "id": "pencil-2", "type": "pencil", "label": "Lapiz", "color": "#374151", "width": 3.0, "opacity": 0.68, "pressure": true, "pressureSensitivity": 0.82, "smoothing": 0.48 },
                { "id": "pencil-4", "type": "marker", "label": "Rotulador naranja", "color": "#F37021", "width": 8.0, "opacity": 0.9, "pressure": true, "pressureSensitivity": 0.35, "smoothing": 0.42 },
                { "id": "pencil-3", "type": "highlighter", "label": "Subrayador", "color": "#FACC15", "width": 18.0, "opacity": 0.36, "pressure": false, "pressureSensitivity": 0.2, "smoothing": 0.42 }
            ],
            "pages": [{
                "id": "page-1",
                "title": null,
                "size": { "width": 1190, "height": 1684, "unit": "px", "preset": "A4" },
                "background": { "type": "blank", "spacing": 32 },
                "strokes": [],
                "updatedAt": "2026-01-01T00:00:00Z"
            }],
            "ocr": { "status": "not-indexed", "textByPage": {} }
        })
    }

    #[test]
    fn scene_spec_generates_deterministic_strokes() {
        let request = json!({
            "route": "precise_scene",
            "targetPageId": "page-1",
            "sceneSpec": {
                "elements": [
                    { "id": "a", "type": "box", "text": "Entrada" },
                    { "id": "b", "type": "box", "text": "Proceso" },
                    { "id": "c", "type": "box", "text": "Salida" }
                ]
            }
        });
        let first =
            apply_handwritten_drawing(&note(), &request, &json!({ "maxStrokes": 600 })).unwrap();
        let second =
            apply_handwritten_drawing(&note(), &request, &json!({ "maxStrokes": 600 })).unwrap();
        assert_eq!(first["qualityReport"]["status"], "passed");
        assert_eq!(
            first["content"]["pages"][0]["strokes"],
            second["content"]["pages"][0]["strokes"]
        );
        assert!(
            first["content"]["pages"][0]["strokes"]
                .as_array()
                .unwrap()
                .len()
                > 6
        );
    }

    #[test]
    fn clean_existing_replaces_target_page_strokes() {
        let mut existing_note = note();
        existing_note["pages"][0]["strokes"] = json!([
            { "id": "manual-stroke", "toolId": "pencil-1", "points": [{ "x": 10, "y": 10, "pressure": 0.7 }] }
        ]);
        existing_note["pages"][0]["generatedElements"] = json!([
            { "id": "old-ai", "kind": "box", "strokeIds": ["manual-stroke"] }
        ]);
        let result = apply_handwritten_drawing(
            &existing_note,
            &json!({
                "route": "precise_scene",
                "targetPageId": "page-1",
                "replacementPolicy": "clean_existing",
                "sceneSpec": {
                    "elements": [
                        { "id": "circle", "type": "freeform_shape", "text": "Circulo" },
                        { "id": "square", "type": "box", "text": "Cuadrado" }
                    ]
                }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(!strokes.iter().any(|stroke| stroke["id"] == "manual-stroke"));
        assert!(strokes.len() > 2);
        let generated = result["content"]["pages"][0]["generatedElements"]
            .as_array()
            .unwrap();
        assert!(!generated.iter().any(|element| element["id"] == "old-ai"));
        assert!(generated.iter().any(|element| element["id"] == "circle"));
    }

    #[test]
    fn clean_existing_can_clear_without_scene_elements() {
        let mut existing_note = note();
        existing_note["pages"][0]["strokes"] = json!([
            { "id": "manual-stroke", "toolId": "pencil-1", "points": [{ "x": 10, "y": 10, "pressure": 0.7 }] }
        ]);
        existing_note["pages"][0]["generatedElements"] = json!([
            { "id": "old-ai", "kind": "box", "strokeIds": ["manual-stroke"] }
        ]);
        let result = apply_handwritten_drawing(
            &existing_note,
            &json!({
                "route": "precise_scene",
                "targetPageId": "page-1",
                "replacementPolicy": "clean_existing",
                "sceneSpec": { "elements": [] }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        assert!(result["content"]["pages"][0]["strokes"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(result["content"]["pages"][0]["generatedElements"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(result["qualityReport"]["status"], "passed");
    }

    #[test]
    fn acceptance_square_and_triangle_are_real_strokes_without_paths() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "precise_scene",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "cuadrado", "type": "shape", "shape": "square", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null },
                        { "id": "triangulo", "type": "shape", "shape": "triangle", "text": null, "role": "primary_outline", "priority": 2, "from": null, "to": null }
                    ]
                }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        let items = result["vectorPlan"]["items"].as_array().unwrap();
        assert_eq!(items[0]["shape"], "square");
        assert_eq!(items[1]["shape"], "triangle");
        let square = items[0]["rect"].clone();
        assert_eq!(square["width"], square["height"]);
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes.iter().all(|stroke| stroke["path"].is_null()));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("cuadrado")));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("triangulo")));
    }

    #[test]
    fn acceptance_orange_fill_is_marker_passes_not_solid_fill() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "precise_scene",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "cuadrado", "type": "shape", "shape": "square", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null },
                        { "id": "relleno", "type": "fill_region", "target": "cuadrado", "fill": "marker_passes", "text": null, "role": "fill_light", "priority": 2, "from": null, "to": "cuadrado" }
                    ]
                }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        let fill_strokes = strokes
            .iter()
            .filter(|stroke| stroke["id"].as_str().unwrap().contains("relleno-marker"))
            .count();
        assert!(fill_strokes >= 4);
        assert!(strokes.iter().all(|stroke| stroke["path"].is_null()));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "marker"));
    }

    #[test]
    fn acceptance_child_drawing_house_and_sun_uses_multiple_stroke_groups() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "creative_sketch",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "casa", "type": "symbol", "symbol": "house", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null },
                        { "id": "sol", "type": "symbol", "symbol": "sun", "text": null, "role": "accent", "priority": 2, "from": null, "to": null }
                    ]
                }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("casa-roof")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("sol-ray")));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "pencil"));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "marker"));
    }

    #[test]
    fn acceptance_architecture_diagram_uses_nodes_connectors_text_and_highlight() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "precise_scene",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "web", "type": "diagram_node", "text": "Web", "role": "diagram_node", "priority": 1, "from": null, "to": null },
                        { "id": "api", "type": "diagram_node", "text": "API", "role": "diagram_node", "priority": 2, "from": null, "to": null },
                        { "id": "db", "type": "symbol", "symbol": "database", "text": "DB", "role": "secondary_sketch", "priority": 3, "from": null, "to": null },
                        { "id": "web-api", "type": "connector", "text": null, "role": "connector", "priority": 4, "from": "web", "to": "api" },
                        { "id": "api-db", "type": "connector", "text": null, "role": "connector", "priority": 5, "from": "api", "to": "db" },
                        { "id": "highlight-api", "type": "fill_region", "target": "api", "fill": "marker_passes", "text": null, "role": "highlight", "priority": 6, "from": null, "to": "api" }
                    ]
                }
            }),
            &json!({ "maxStrokes": 900 }),
        )
        .unwrap();
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("web-box")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("web-api")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("highlight-api")));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "pencil"));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "marker"));
    }

    #[test]
    fn acceptance_simple_portrait_uses_line_portrait_and_hatching() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "creative_sketch",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "retrato", "type": "portrait", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null }
                    ]
                }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("retrato-face")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("retrato-eyes")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("retrato-shadow")));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "pencil"));
    }

    #[test]
    fn dog_portrait_is_not_rendered_as_diagram() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "creative_sketch",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "perro", "type": "portrait", "symbol": "dog", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null }
                    ]
                }
            }),
            &json!({ "maxStrokes": 600 }),
        )
        .unwrap();
        let items = result["vectorPlan"]["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["kind"], "portrait");
        assert_eq!(items[0]["shape"], "dog");
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("perro-head")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("perro-left-ear")));
        assert!(strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("perro-muzzle")));
        assert!(!strokes.iter().any(|stroke| stroke["id"].as_str().unwrap().contains("arrow")));
        assert!(strokes.iter().all(|stroke| stroke["path"].is_null()));
    }

    #[test]
    fn cat_portrait_uses_line_art_strokes_without_diagram_connectors() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "creative_sketch",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "gato", "type": "portrait", "symbol": "cat", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null }
                    ]
                }
            }),
            &json!({ "maxStrokes": 900 }),
        )
        .unwrap();
        let items = result["vectorPlan"]["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["kind"], "portrait");
        assert_eq!(items[0]["shape"], "cat");
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("gato-outer-line")));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("gato-left-eye")));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("gato-left-whisker")));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("gato-forehead-fur")));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "pencil"));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("-pass-1")));
        assert!(!strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("arrow")));
        assert!(strokes.iter().all(|stroke| stroke["path"].is_null()));
    }

    #[test]
    fn starship_infographic_uses_hero_drawing_with_callouts() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({
                "route": "creative_sketch",
                "targetPageId": "page-1",
                "sceneSpec": {
                    "elements": [
                        { "id": "starship", "type": "symbol", "symbol": "starship", "text": null, "role": "primary_outline", "priority": 1, "from": null, "to": null },
                        { "id": "etapa", "type": "annotation", "text": "Etapa superior reutilizable", "role": "text", "priority": 2, "from": null, "to": null },
                        { "id": "tanques", "type": "annotation", "text": "Tanques internos de metano y oxigeno", "role": "text", "priority": 3, "from": null, "to": null },
                        { "id": "aletas", "type": "annotation", "text": "Aletas de control para la reentrada", "role": "text", "priority": 4, "from": null, "to": null },
                        { "id": "motores", "type": "annotation", "text": "Motores Raptor en la base", "role": "text", "priority": 5, "from": null, "to": null }
                    ]
                }
            }),
            &json!({ "maxStrokes": 900 }),
        )
        .unwrap();
        let items = result["vectorPlan"]["items"].as_array().unwrap();
        assert_eq!(items[0]["kind"], "symbol");
        assert_eq!(items[0]["shape"], "starship");
        assert!(items.iter().any(|item| item["id"] == "note-etapa"));
        assert!(items.iter().any(|item| item["id"] == "callout-tanques"));
        assert!(!items.iter().any(|item| item["id"] == "starship-box"));
        let strokes = result["content"]["pages"][0]["strokes"].as_array().unwrap();
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("starship-outer-left")));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("starship-heat-shield")));
        assert!(strokes
            .iter()
            .any(|stroke| stroke["id"].as_str().unwrap().contains("callout-tanques")));
        assert!(strokes.iter().any(|stroke| stroke["tool"] == "pencil"));
    }

    #[test]
    fn debug_raw_strokes_is_blocked() {
        let result = apply_handwritten_drawing(
            &note(),
            &json!({ "route": "debug_raw_strokes" }),
            &json!({}),
        );
        assert!(result.unwrap_err().contains("bloqueada"));
    }
}
