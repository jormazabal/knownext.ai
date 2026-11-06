# Entrega140 · Consolidación y candidata instalada

Autoridad: petición del usuario de completar la consolidación y después preparar y validar una candidata instalada, con subagentes, sin repetir suites completas, sin gasto IA y sin publicación. Incluye integración y commit locales; excluye push, tags, CI de release y GitHub Releases. Se conserva la aplicación2.6 en ejecución y su perfil.

## Consolidación

- [x] Alcance y exclusiones conciliados;50propuestas/70capacidades sin cambios de identidad.
- [x] T11 y estados/progreso históricos desactualizados corregidos, sin inventar aceptación instalada.
- [x] Auditoría del árbol, exclusión de secretos/artefactos y evidencia139 conservada con huellas canónicas.
- [ ] Integración local revisada y commit de consolidación; sin push ni tag.

## Candidata

- [ ] Versionado coherente3.0.0 y etiqueta de candidata local C1 y notas de candidata sin anunciar publicación.
- [ ] Paquete Windows QA con identidad, nombre y UpgradeCode separados; no sustituir2.6 ni migrar su perfil.
- [ ] APK QA instalado en emulador, revisión del identificador antes de instalar y datos conservados.
- [ ] Recorridos críticos con runtime real, persistencia/reapertura y capturas; repetir sólo comprobaciones afectadas.
- [ ] Consolidar resultados reales, hashes de artefactos, limitaciones y pendientes de aceptación.

## Condiciones conocidas

Regresión139 reutilizada:1.158frontend/740Rust y dos benchmarks explícitos. Los cambios de versión requieren consistencia/build/empaquetado, no repetir ambas suites. Las firmas Tauri y Android de distribución no están disponibles localmente; no regenerarlas ni usar la identidad QA como prueba de actualización productiva. El usuario no autoriza publicar. Windows instalada2.6 y su proceso permanecen intactos. Android disponible es emulador API36/x86_64, no dispositivo ARM físico.

Tres subagentes reales con archivos exclusivos: consolidation_docs(documentación de alcance y matrices); consolidation_git(auditoría y evidencia canónica); candidate_environment(entorno y arranque del emulador). El coordinador integra Git/versionado, construye, instala y contrasta la candidata.
