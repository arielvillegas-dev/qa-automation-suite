# Plan de Pruebas — OrderFlow QA Sandbox

## 1. Objetivo y Alcance
Validar de manera automatizada y reproducible la calidad funcional, de contrato y de seguridad del sistema **OrderFlow QA Sandbox**, cubriendo:
- Autenticación y control de acceso basado en roles (`admin` vs. `operator`).
- Ciclo de vida de órdenes (`POST`, `GET`, `PATCH`, `DELETE`) con persistencia SQLite.
- Idempotencia en creación (`Idempotency-Key`) y manejo de concurrencia.
- Protección frente a entradas malformadas, SQL Injection y SSRF en registro de webhooks.
- Usabilidad y layout responsivo (Desktop `1280x720` y Mobile `390x844`).

## 2. Estrategia (Pirámide de Pruebas)
1. **Pruebas Unitarias (`tests/unit/`):** Validadores puros, reglas de formato y guardas SSRF sin I/O de red.
2. **Pruebas de API y Contrato (`tests/api/`):** Ejecutadas contra servidor HTTP efímero con SQLite `:memory:`, validando códigos HTTP, contratos JSON, RBAC, concurrencia con `Promise.all` e inyección.
3. **Pruebas End-to-End (`tests/e2e/`):** Ejecutadas en Chromium real con Playwright, validando flujos completos de usuario, alertas en UI y generación de trazas/capturas ante fallos.

## 3. Criterios de Aceptación
- 100 % de pruebas unitarias, API y E2E en verde (`npm test`).
- Cero errores de consola no controlados ni fallos de aislamiento entre escenarios.
