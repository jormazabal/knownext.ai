//! Credentials and immutable requests only. No filesystem mutation or provider retry.
use super::*;

pub(super) struct PreparedImages {
    key: Option<String>,
    config: Value,
    jobs: Vec<(usize, String)>,
    rejected: BTreeMap<usize, Value>,
}
impl PreparedImages {
    pub(super) fn prepare(work: &CompletedAiInteraction, api: &LocalApi) -> Self {
        let config = work.scope.policy["imageGeneration"].clone();
        let mut prepared = Self {
            key: None,
            config,
            jobs: Vec::new(),
            rejected: BTreeMap::new(),
        };
        if work.response["status"] != "completed" || work.validate_response(api).is_err() {
            return prepared;
        }
        let policy = &work.scope.policy;
        let limit = prepared.config["maxImagesPerPrompt"]
            .as_u64()
            .unwrap_or(1)
            .clamp(1, 4) as usize;
        for (index, operation) in work.response["operations"]
            .as_array()
            .into_iter()
            .flatten()
            .enumerate()
        {
            if operation["type"] != "image_generated" || operation["status"] != "ready" {
                continue;
            }
            let check = (|| -> Result<String, String> {
                if prepared.config["enabled"] != true
                    || policy["permissions"]["generateImages"] != true
                    || policy["permissions"]["createImageAssets"] != true
                {
                    return Err(
                        "La generación de imágenes o creación de assets está desactivada".into(),
                    );
                }
                if prepared.jobs.len() >= limit {
                    return Err("Se ha alcanzado el límite de imágenes de esta petición".into());
                }
                let prompt = operation["prompt"]
                    .as_str()
                    .filter(|text| !text.trim().is_empty() && text.len() <= 64 * 1024)
                    .ok_or("La imagen necesita un prompt de hasta 64 KiB")?;
                // Validate before consuming a provider. This helper never creates folders.
                api.image_generation_parent(
                    &work.scope.project_id,
                    work.scope.runtime_body["documentId"].as_str(),
                    &prepared.config,
                )?;
                Ok(prompt.to_string())
            })();
            match check {
                Ok(prompt) => prepared.jobs.push((index, prompt)),
                Err(message) => {
                    prepared
                        .rejected
                        .insert(index, json!({"status":"error","message":message}));
                }
            }
        }
        if !prepared.jobs.is_empty() {
            prepared.key = api.openai_key();
        }
        prepared
    }
    pub(super) fn execute_with(
        self,
        mut generate: impl FnMut(Option<&str>, &Value, &str) -> Value,
        mut validate: impl FnMut() -> Result<(), String>,
    ) -> BTreeMap<usize, Value> {
        let mut results = self.rejected;
        for (index, prompt) in self.jobs {
            let generated=match validate() {
                Ok(())=>std::panic::catch_unwind(std::panic::AssertUnwindSafe(||generate(self.key.as_deref(),&self.config,&prompt)))
                    .unwrap_or_else(|_|json!({"status":"error","message":"La fase de imagen se interrumpió. Se conservan los resultados anteriores; no se ha reintentado el proveedor."})),
                Err(message)=>json!({"status":"error","message":message}),
            };
            results.insert(index, generated);
        }
        results
    }
}
