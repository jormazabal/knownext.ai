//! Shared private-archive metadata schema. It never grants execution authority.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Inventory {
    pub format: String,
    pub schema_version: u8,
    pub data_only: bool,
    pub items: Vec<Value>,
    #[serde(default)]
    pub metadata_snapshots: Vec<Metadata>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Metadata {
    pub name: String,
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
}
pub(super) fn parse(raw: &[u8]) -> Result<Inventory, String> {
    if raw.len() as u64 > MAX_MANIFEST {
        return Err("El inventario privado supera8MiB".into());
    }
    let inventory: Inventory = serde_json::from_slice(raw)
        .map_err(|_| "El archivo tiene un inventario futuro o incompatible; se conserva")?;
    if inventory.format != "knownext.project-archive"
        || !matches!(inventory.schema_version, 1 | 2)
        || !inventory.data_only
        || inventory.items.len() > MAX_ENTRIES
        || inventory.metadata_snapshots.len() > MAX_ENTRIES
        || inventory.schema_version == 1 && !inventory.metadata_snapshots.is_empty()
        || inventory.schema_version == 2 && inventory.metadata_snapshots.is_empty()
    {
        return Err("Versión o alcance del archivo privado no compatible".into());
    }
    Ok(inventory)
}
