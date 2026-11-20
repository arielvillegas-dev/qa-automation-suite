# QA Automation Suite (`OrderFlow QA Sandbox`)

Proyecto de portafolio enfocado en **QA Tester / QA Automation**, que implementa una aplicación web + API REST autocontenida y una pirámide completa de pruebas automatizadas (unitarias, contrato API, concurrencia, seguridad básica y End-to-End con Playwright).

## 1. Problema que resuelve
Demuestra cómo diseñar e implementar una estrategia de aseguramiento de calidad reproducible sin depender de servicios externos ni exponer datos reales, cubriendo flujos críticos de negocio: control de acceso (RBAC), idempotencia ante reintentos, prevención de condiciones de carrera y validación SSRF.

## 2. Tecnologías utilizadas
- **SUT (System Under Test):** Node.js 24 (`node:http`, `node:sqlite`, `node:crypto`), HTML5, CSS3, JavaScript vanilla.
- **Pruebas:** `@playwright/test` (E2E en Chromium + reporte HTML/Trace) y `node:test` (Unit + API).
- **CI/CD:** GitHub Actions (`.github/workflows/qa.yml`).

## 3. Arquitectura general
- `app/db.mjs`: Esquema SQLite relacional con datos sintéticos de demostración.
- `app/validators.mjs`: Reglas puras de validación, hashing canónico para idempotencia y guardia SSRF.
- `app/server.mjs`: API REST + servidor de archivos estáticos.
- `app/public/`: Interfaz web interactiva.
- `tests/unit/`, `tests/api/`, `tests/e2e/`: Suites automatizadas organizadas por capa.
- `docs/`: Plan de pruebas (`TEST_PLAN.md`), matriz de trazabilidad (`TEST_CASES.md`) y plantilla de bugs.

## 4. Funcionalidades implementadas
- Autenticación con tokens HMAC-SHA256 y roles `admin` / `operator`.
- Gestión de órdenes con búsqueda, filtro por estado e idempotencia (`Idempotency-Key`).
- Registro de webhooks con validación anti-SSRF.
- Generación de reporte HTML de Playwright y trazas ante fallos.

## 5. Instrucciones para ejecutarlo

```bash
npm install
npx playwright install chromium

# Ejecutar el servidor local en modo demostración
npm start
# Abrir http://127.0.0.1:4100
```

Credenciales sintéticas de demostración:
- Admin: `admin@qa-sandbox.test` / `AdminDemo!2026`
- Operador: `operator@qa-sandbox.test` / `OperatorDemo!2026`

## 6. Pruebas disponibles
```bash
npm run test:unit   # Pruebas unitarias
npm run test:api    # Pruebas de API, RBAC, idempotencia, concurrencia y SQLi/SSRF
npm run test:e2e    # Pruebas E2E en navegador Chromium con Playwright
npm test            # Ejecuta las 3 capas completas
```

## 7. Contribución real al desarrollo
Proyecto creado para portafolio profesional por Carlos Ariel Villegas Flores, diseñando la arquitectura de pruebas, casos límite (RBAC, idempotencia, concurrencia, SSRF) y documentación QA, con apoyo de herramientas de IA para acelerar la codificación del sandbox y verificación completa de ejecución local.
