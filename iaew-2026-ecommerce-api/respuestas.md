# Respuestas Clase 02

## 1. ¿Qué endpoint fue CRUD?

Respuesta: El endpoint /productos (específicamente al hacer POST y GET). Estas rutas se limitan a operaciones transaccionales básicas: insertar un nuevo registro (Create) o consultar la lista existente (Read) directamente en la colección de MongoDB, sin cálculos complejos ni reglas adicionales.

## 2. ¿Qué endpoint fue una operación de negocio?

Respuesta: El endpoint POST /pedidos/:id/confirmar. Esta ruta no es una simple actualización de base de datos (como lo sería un PUT o PATCH tradicional para cambiar una palabra). Representa un proceso de dominio específico del e-commerce: verifica el estado actual del pedido, evalúa si es válido proceder y ejecuta la acción de confirmar una compra de manera lógica.

## 3. ¿Qué regla de negocio protegimos?

Respuesta: Protegimos la regla que dicta que un pedido ya confirmado no puede volver a confirmarse. Al validar el estado previo del documento antes de actuar, la API evita el procesamiento duplicado de una venta o la corrupción del ciclo de vida de la compra.

## 4. ¿Por qué 409 Conflict es más claro que 500?

Respuesta: El código 409 Conflict le informa al cliente con precisión que su solicitud fue entendida, pero no puede procesarse porque choca con el estado actual del recurso en el servidor (el pedido ya estaba confirmado). Es un error contemplado y manejado por tu código. Por el contrario, un 500 Internal Server Error es genérico e indica que el servidor "se rompió" por un fallo técnico inesperado (como una desconexión de la base de datos o un error de sintaxis), sin darle al cliente ninguna pista lógica de lo que ocurrió con su compra.