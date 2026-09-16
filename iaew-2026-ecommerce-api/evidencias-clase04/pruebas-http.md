A6) Si MongoDB guarda el pedido pero RabbitMQ falla antes de publicar, el sistema queda inconsistente: el pedido figura confirmado pero el evento se pierde y la notificación nunca se procesa. No conviene reconfirmar a ciegas porque, al no ser una operación que devuelve el mismo resultado cada vez que se ejecuta, se duplicaría el descuento de stock. Una posible evolución arquitectónica para solucionar esto es implementar el patrón Outbox.

A7) Integración elegida (Webhook para sistema logístico): Nuestra API (iniciador) realiza una petición HTTP POST al sistema de envíos externo (receptor) al despachar un paquete. Requiere una respuesta inmediata (200 OK) para confirmar la recepción del aviso. Si el receptor está detenido, la petición falla y nuestro sistema debe implementar un mecanismo de reintentos (retries) programados.

Agente de IA: Para confirmar un pedido, el agente necesitaría el scope confirm:pedidos. Si recibe un error 500 (falla de RabbitMQ tras persistir en Mongo), el agente debe consultar primero el estado actual mediante GET /pedidos para verificar si el estado ya es 'confirmado' antes de decidir si reintenta la confirmación.

ID pedido (200 OK): 6aa31401a44631bb77fd1298

Payload del evento:

"evento": {
        "eventId": "c627657f-359d-4e5d-af06-1210bb69dcf3",
        "type": "pedido.confirmado",
        "version": 1,
        "occurredAt": "2026-09-10T20:33:20.952Z",
        "data": {
            "pedidoId": "6aa31401a44631bb77fd1298"
        }
    }