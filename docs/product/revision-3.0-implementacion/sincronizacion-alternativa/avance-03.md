# SC01 · Proton directo · avance03

Fecha2026-11-06. Implementación reanudada con cuatro agentes reales.
[Plan vigente](plan.md) · [Definición](tarea.md).

## Corrección integrada

- Capacidades Proton dejan de ofrecer carpeta Windows; conexión directa pendiente en Windows/Android, sin autenticar ni sincronizar ficticiamente.
- CloudSyncDialog no monta el panel antiguo y bloquea incluso una capacidad/revisión Proton heredada que anuncie disponibilidad.
- Rutas públicas review/connect/publish/receive/apply por carpeta responden409 sin escribir contenido ni crear asociación.
- Consulta/estado/revisión y desconexión con sus guardas siguen disponibles para estados anteriores. No se borran outbox/recovery, archivos ni recibos.
- No se ha implementado aún recuperación/migración integral del legado; P1 sigue parcial.
- Los siete contratos históricos que requieren nuevas asociaciones por carpeta se marcan ignorados con motivo explícito. No se contabilizan como PASS; las reglas puras no afectadas conservan evidencia previa.

## P0: viabilidad experimental nativa contrastada; integración pendiente

Android: AAR oficial0.33.0-rust localizado y verificado por SHA256 público. Compiladas siete fuentes JNI oficiales ARM64/API29 y enlazadas contra SO real con --no-undefined, EXIT0. No demuestra login, transferencia ni aceptación física. Carga real SDK/crypto/JNI correcta en APK mínima propia sobre emulador API36/x86_64. APK instalada/lanzada y marcador NATIVE_SDK_LOAD_PASS observado; AVD propio cerrado. No ARM físico, login ni transferencia.

Windows: SDK NativeAOT compilado/cargado y llamada ABI con callback real correctos. Crypto Rust MSVC compilado y wrapper C# ejecuta exportación de clave pública SRP correctamente. Fuentes oficiales fijadas con wrapper experimental local0.40.1-p0, no paquete oficial equivalente. Bundle experimental de tres DLL ~36MiB; sin .NET instalado en dispositivo ni sidecar.

Auth: cinco comprobaciones offline correctas contra authWeb oficial (URL/payload sintético/errores). Adaptador Resume+SetAccountKeyPassphraseAsync compilado con83fuentes cuenta oficiales, cero errores/advertencias. El SDK exige callbacks de cuenta/claves y transporte autenticado. Login, desbloqueo PGP con claves reales y renovación/reinicio de cuenta permanecen pendientes.

Una revisión independiente no detectó bypass ni riesgo nuevo de pérdida en P1 parcial. Backend conserva algunos mensajes heredados que remiten al panel antiguo; UI ya los sustituye por aviso de recuperación. Se corregirán en el siguiente cambio de runtime pertinente, sin otra compilación sólo por texto.

El SDK Android declara minSdk29 frente al24 de KnowNext; mantener compatibilidad general y evaluar capacidad aislada, sin elevar mínimo global. Condiciones/licencias del artefacto y dependencias necesitan aclaración antes de distribución.

## Comprobaciones

- CloudSyncDialog:8casos PASS, una ejecución dirigida, incluidos tres contratos nuevos.
- TypeScript: npx tsc --noEmit, EXIT0.
- Rust: cargo test -p knownext-storage --test cloud_runtime_contract --offline,4/4PASS. Incluye alcance/admisión, nuevas rutas retiradas sin efectos y fixtures directos de estado legado (consulta, recepción/publicación pendiente, revisión obsoleta y desconexión limpia conservando originales/outbox/recovery). Una compilación final13m45s; hubo un intento inicial que falló por nombre de tipo de respuesta y se corrigió antes de este resultado. Sin suites completas.
- Capturas reales de componente a1280/390px con datos controlados; inspección móvil sin overflow. No cuenta ni aceptación nativa.
- No suites completas, gasto IA, publicación ni cuentas/documentos personales.

## Pendiente

Integración del adaptador de cuenta y cifrado/cache funcional, empaquetado/compatibilidad Android, P1 recuperación/migración, P2 sesión persistente, P3 intercambio Windows–Android, P4 continuidad/conflictos, P5 almacén/migración y P6 candidata. Microsoft/Google aplazados.

## Evidencia técnica local

[Windows: informe](../../../../output/sc01-proton-p0/windows/report.md) · [hashes y resultados](../../../../output/sc01-proton-p0/windows/evidence.json).
[Android: informe](../../../../output/sc01-proton-p0/android/report.md) · [resultado](../../../../output/sc01-proton-p0/android/result.json).
[Auth: informe](../../../../output/sc01-proton-p0/auth/report.md) · [comprobación offline](../../../../output/sc01-proton-p0/auth/contract-result.json) · [adaptador compilado](../../../../output/sc01-proton-p0/auth/account-probe-result.json).

Carga Android: hubo un ensayo inicial de precarga explícita SQLite que falló por símbolo trunc; se conserva como sqlite-preload-* en el ámbito Android. Sólo se corrigió/recompiló la prueba Java afectada para cargar SDK/crypto/JNI y se repitió esa carga. El PASS posterior no acredita inicialización de caché SQLite ni elimina ese riesgo; deberá verificarse al crear una sesión de SDK. No repetir la compilación JNI/ARM64 ni las suites por esta corrección.

Resultado del hito: la vía nativa experimental existe y carga en Windows y Android, sin instalar Proton Drive. El siguiente paso es integrar la extensión de cuenta/callbacks y persistencia segura; después probar conexión/renovación y transferencia con corpus sintético. P0 conserva pendientes de cifrado/cache/end-to-end, licencias de artefactos y soporte Android29+; no se declara terminado el conector ni P1 integral.
