require('dotenv').config();

const mongoose = require('mongoose');
const { connectDb } = require('./db');
const Pedido = require('./models/Pedido');
const { crearCanal, QUEUE } = require('./lib/rabbit');
const EventoProcesado = require('./models/EventoProcesado');
const { retryConfig } = require('./lib/config');
const { publishRetry, publishDlq } = require('./lib/rabbit');

class PermanentMessageError extends Error {}
class TransientMessageError extends Error {}

function retryCountOf(message) {
  const value = Number(message.properties.headers?.['x-retry-count'] ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function validarEvento(evento) {
  if (evento.type !== 'pedido.confirmado') return false;
  if (evento.version !== 1) return false;
  if (!evento.eventId || !evento.occurredAt) return false;
  if (!evento.data || !mongoose.Types.ObjectId.isValid(evento.data.pedidoId)) return false;
  return !Number.isNaN(Date.parse(evento.occurredAt));
}
function parsePedidoConfirmado(content) {
  // 1. Convertimos los bytes que llegan de RabbitMQ a un objeto de JavaScript
  const evento = JSON.parse(content.toString());
  
  // 2. Usamos tu función para asegurar que tiene la estructura correcta
  if (!validarEvento(evento)) {
    throw new PermanentMessageError('El evento tiene un formato inválido');
  }
  
  return evento;
}

async function procesarMensaje(message, activeChannel) {
  // count y config se declaran FUERA del try para que el catch también los vea.
  // Si los declarás dentro del try, el catch lanza ReferenceError: count is not defined.
  const count = retryCountOf(message);
  const config = retryConfig();

  try {
    // Falla transitoria simulada para pruebas (controlada por SIMULATE_TRANSIENT_FAILURES)
    if (count < config.simulatedFailures) {
      throw new TransientMessageError(
        `Falla transitoria simulada ${count + 1}/${config.simulatedFailures}`
      );
    }

    const event = parsePedidoConfirmado(message.content);
     // 1. Verificar si el evento ya fue procesado
    if (await EventoProcesado.exists({ eventId: event.eventId })) {
      console.log(`Duplicado reconocido: evento ${event.eventId}`);
      activeChannel.ack(message);
      return;
    }

    // 2. Buscar el pedido
    const pedido = await Pedido.findById(event.data.pedidoId);
    if (!pedido) throw new PermanentMessageError('Pedido inexistente');

    // 3. Reservar el eventId antes de aplicar el efecto
    try {
      await EventoProcesado.create({
        eventId: event.eventId,
        type: event.type,
        pedidoId: pedido._id
      });
    } catch (error) {
      if (error?.code === 11000) {
        console.log(`Duplicado reconocido (race): evento ${event.eventId}`);
        activeChannel.ack(message);
        return;
      }
      throw error;
    }

    // 4. Aplicar el efecto; si falla, revertir la reserva
    try {
      pedido.notificacionEstado = 'procesada';
      pedido.notificadoEn = new Date();
      await pedido.save();
    } catch (error) {
      await EventoProcesado.deleteOne({ eventId: event.eventId });
      throw new TransientMessageError(`MongoDB no pudo persistir el efecto: ${error.message}`);
    }

    console.log(`Notificación procesada para pedido ${pedido.id}; evento ${event.eventId}`);

    activeChannel.ack(message);
  } catch (error) {
    if (!(error instanceof PermanentMessageError) && count < config.maxRetries) {
      console.warn(`Reintento ${count + 1}/${config.maxRetries}: ${error.message}`);
      await publishRetry(activeChannel, message, count + 1, error.message);
      activeChannel.ack(message);
      return;
    }

    const reason = error instanceof PermanentMessageError
      ? `permanente: ${error.message}`
      : `reintentos agotados (${count}/${config.maxRetries}): ${error.message}`;
    console.error(`Enviando a DLQ — ${reason}`);
    await publishDlq(activeChannel, message, reason, count);
    activeChannel.ack(message);
  }
};

async function main() {
  await connectDb();
  const { channel } = await crearCanal();

  await channel.consume(
    QUEUE,
    (message) => {
      if (message) procesarMensaje(message, channel);
    },
    { noAck: false }
  );

  console.log('Worker escuchando cola ' + QUEUE);
}

main().catch((error) => {
  console.error('No se pudo iniciar el worker');
  console.error(error.message);
  process.exit(1);
});