const amqp = require('amqplib');

const EXCHANGE = 'pedidos.exchange';
const ROUTING_KEY = 'pedido.confirmado';
const QUEUE = 'notificaciones.pedido-confirmado';

async function crearCanal() {
  const connection = await amqp.connect(process.env.RABBIT_URL);
  const channel = await connection.createConfirmChannel();

  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

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

module.exports = {
  EXCHANGE,
  QUEUE,
  ROUTING_KEY,
  crearCanal,
  publicarPedidoConfirmado
};