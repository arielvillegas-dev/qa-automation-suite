# Matriz de Casos de Prueba (Traceability Matrix)

| ID | Capa | Escenario | Resultado Esperado | Prueba Automatizada |
| :--- | :--- | :--- | :--- | :--- |
| TC-001 | Unit | Validación de orden válida USD/EUR | Normaliza email y convierte monto a centavos | `validators.test.mjs` |
| TC-002 | Unit | Rechazo de monto negativo, email inválido y moneda no soportada | Retorna `valid: false` con errores por campo | `validators.test.mjs` |
| TC-003 | Unit | Bloqueo SSRF (`127.0.0.1`, `localhost`, `169.254.169.254`, `10.x`, `file://`) | Bloquea todas las URLs privadas o no HTTP(S) | `validators.test.mjs` |
| TC-004 | API | Acceso sin token Bearer | HTTP `401 Unauthorized` | `orders.api.test.mjs` |
| TC-005 | API | Operador intenta eliminar orden o registrar webhook | HTTP `403 Forbidden` (RBAC) | `orders.api.test.mjs` |
| TC-006 | API | Reenvío con mismo `Idempotency-Key` e idéntico payload | HTTP `200` con `idempotentReplay: true` y mismo ID | `orders.api.test.mjs` |
| TC-007 | API | Reuso de `Idempotency-Key` con payload alterado | HTTP `409 Conflict` | `orders.api.test.mjs` |
| TC-008 | API | 5 solicitudes concurrentes con misma referencia | Solo 1 devuelve `201`, las otras 4 devuelven `409` | `orders.api.test.mjs` |
| TC-009 | API | Payload SQL Injection en filtro `?q=` | Consulta parametrizada, retorna `200` y lista vacía | `orders.api.test.mjs` |
| TC-010 | API | Registro de webhook hacia IP metadata cloud | HTTP `422 Unprocessable Entity` | `orders.api.test.mjs` |
| TC-011 | E2E | Login fallido muestra mensaje de error en UI | Alerta visible con texto `Invalid credentials` | `orders.spec.mjs` |
| TC-012 | E2E | Flujo completo Admin: crear, actualizar estado, filtrar, webhook y eliminar | Persistencia reflejada en tabla y feedback en pantalla | `orders.spec.mjs` |
| TC-013 | E2E | Sesión `operator` en viewport móvil (`390x844`) | Panel de webhooks y botón `Delete` ocultos en UI | `orders.spec.mjs` |
