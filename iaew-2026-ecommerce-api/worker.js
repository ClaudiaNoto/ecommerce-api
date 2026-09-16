require('dotenv').config();

const mongoose = require('mongoose');
const { connectDb } = require('./db');
const Pedido = require('./models/Pedido');
const { crearCanal, QUEUE } = require('./lib/rabbit');

function validarEvento(evento) {
  if (evento.type !== 'pedido.confirmado') return false;
  if (evento.version !== 1) return false;
  if (!evento.eventId || !evento.occurredAt) return false;
  if (!evento.data || !mongoose.Types.ObjectId.isValid(evento.data.pedidoId)) return false;
  return !Number.isNaN(Date.parse(evento.occurredAt));
}

async function procesarMensaje(message, channel) {
  try {
    const evento = JSON.parse(message.content.toString());

    if (!validarEvento(evento)) {
      throw new Error('Evento inválido');
    }

    const pedido = await Pedido.findOneAndUpdate(
      {
        _id: evento.data.pedidoId,
        estado: 'confirmado',
        notificacionEstado: 'pendiente'
      },
      {
        notificacionEstado: 'procesada',
        notificadoEn: new Date()
      },
      { new: true }
    );

    if (!pedido) {
      const existente = await Pedido.findById(evento.data.pedidoId);

      if (existente && existente.notificacionEstado === 'procesada') {
        console.log('Notificación ya procesada', evento.eventId);
        channel.ack(message);
        return;
      }

      throw new Error('Pedido confirmado pendiente no encontrado');
    }

    console.log('Notificación procesada', {
      eventId: evento.eventId,
      pedidoId: pedido.id
    });
    channel.ack(message);
  } catch (error) {
    console.error('No se pudo procesar el mensaje', error.message);
    channel.nack(message, false, false);
  }
}

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