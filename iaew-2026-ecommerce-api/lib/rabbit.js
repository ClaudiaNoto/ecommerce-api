const amqp = require('amqplib');
const { retryConfig } = require('./config');
const { retryDelayMs } = retryConfig();

const RETRY_EXCHANGE = 'pedidos.retry.exchange';
const RETRY_QUEUE = 'notificaciones.pedido-confirmado.retry';
const DLX = 'pedidos.dlx';
const DLQ_ROUTING_KEY = 'pedido.confirmado.dlq';
const DLQ = 'notificaciones.pedido-confirmado.dlq';

const EXCHANGE = 'pedidos.exchange';
const ROUTING_KEY = 'pedido.confirmado';
const QUEUE = 'notificaciones.pedido-confirmado';

async function crearCanal() {
  const connection = await amqp.connect(process.env.RABBIT_URL);
  const channel = await connection.createConfirmChannel();

  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
  await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DLX, 'direct', { durable: true });

  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-message-ttl': retryDelayMs,
      'x-dead-letter-exchange': EXCHANGE,       // al vencer el TTL, vuelve al exchange principal
      'x-dead-letter-routing-key': ROUTING_KEY
    }
  });
  await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, ROUTING_KEY);

  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX, DLQ_ROUTING_KEY);

  return { connection, channel };
}

async function publicarPedidoConfirmado(evento) {
  const { connection, channel } = await crearCanal();

  try {
    channel.publish(
      EXCHANGE,
      ROUTING_KEY,
      Buffer.from(JSON.stringify(evento)),
      { contentType: 'application/json', persistent: true }
    );
    await channel.waitForConfirms();
  } finally {
    await channel.close();
    await connection.close();
  }
}

async function confirmedPublish(ch, exchange, routingKey, content, options) {
  const accepted = ch.publish(exchange, routingKey, content, options);
  if (!accepted) throw new Error('RabbitMQ aplicó back-pressure al publicar');
  await ch.waitForConfirms();
}

async function publishRetry(ch, message, retryCount, reason) {
  await confirmedPublish(ch, RETRY_EXCHANGE, ROUTING_KEY, message.content, {
    ...message.properties,
    persistent: true,
    headers: {
      ...(message.properties.headers || {}),
      'x-retry-count': retryCount,
      'x-last-error': reason
    }
  });
}

async function publishDlq(ch, message, reason, retryCount) {
  await confirmedPublish(ch, DLX, DLQ_ROUTING_KEY, message.content, {
    ...message.properties,
    persistent: true,
    headers: {
      ...(message.properties.headers || {}),
      'x-retry-count': retryCount,
      'x-dlq-reason': reason
    }
  });
}

module.exports = {
  EXCHANGE, ROUTING_KEY, QUEUE,
  //closeRabbit,
  confirmedPublish, publishRetry, publishDlq,
  crearCanal,
  publicarPedidoConfirmado
};