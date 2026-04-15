const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

// Memoria temporal de sesiones
const sessions = new Map();

// Limpieza simple cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions.entries()) {
    if (now - value.updatedAt > 1000 * 60 * 60) {
      sessions.delete(key);
    }
  }
}, 1000 * 60 * 10);

app.get('/', (req, res) => {
  res.send('Servidor activo');
});

app.post('/webhook', async (req, res) => {
  console.log('POST /webhook recibido');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const validationToken =
    req.headers['validation-token'] ||
    req.headers['Validation-Token'];

  if (validationToken) {
    console.log('Validation token recibido:', validationToken);
    res.setHeader('Validation-Token', validationToken);
    return res.status(200).send('');
  }

  console.log('Evento recibido en /webhook');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    const event = req.body || {};
    const body = event.body || {};
    const parties = Array.isArray(body.parties) ? body.parties : [];

    if (!body.telephonySessionId || parties.length === 0) {
      console.log('No hay telephonySessionId o parties; no se procesa.');
      return res.sendStatus(200);
    }

    const telephonySessionId = body.telephonySessionId;

    // Tomamos la primera party, pero también la logueamos completa
    const party = parties[0];
    const direction = party.direction || '';
    const statusCode = party.status?.code || '';
    const missedCall = party.missedCall === true;
    const partyId = party.id || 'no-party-id';

    console.log('telephonySessionId:', telephonySessionId);
    console.log('partyId:', partyId);
    console.log('Direction:', direction);
    console.log('Status:', statusCode);
    console.log('MissedCall:', missedCall);

    // Recuperar o crear sesión
    const current = sessions.get(telephonySessionId) || {
      telephonySessionId,
      direction: '',
      answered: false,
      missedCall: false,
      completed: false,
      pointsSent: false,
      updatedAt: Date.now()
    };

    // Guardar datos acumulados
    if (direction) current.direction = direction;
    if (missedCall) current.missedCall = true;
    current.updatedAt = Date.now();

    // Estados que interpretamos como "contestada/conectada"
    const answeredStates = ['Answered', 'Connected'];
    if (answeredStates.includes(statusCode)) {
      current.answered = true;
    }

    // Estado final
    if (statusCode === 'Disconnected') {
      current.completed = true;
    }

    sessions.set(telephonySessionId, current);

    console.log('Session state acumulado:', JSON.stringify(current, null, 2));

    let points = 0;
    const reasons = [];

    // Solo procesar una vez cuando la llamada termina
    if (current.completed && !current.pointsSent) {
      // Penalización por llamada perdida entrante
      if (current.direction === 'Inbound' && current.missedCall) {
        points = -10;
        reasons.push('Missed inbound call');
      }

      // Premio por llamada entrante realmente atendida
      if (current.direction === 'Inbound' && !current.missedCall && current.answered) {
        points += 5;
        reasons.push('Inbound answered call');

        points += 5;
        reasons.push('Completed call');
      }

      const reason = reasons.join(' + ');

      console.log('Points calculados:', points);
      console.log('Reason:', reason);
      console.log('WORDPRESS_URL existe:', !!WORDPRESS_URL);
      console.log('BRIDGE_SECRET existe:', !!BRIDGE_SECRET);

      if (points !== 0 && WORDPRESS_URL && BRIDGE_SECRET) {
        const response = await axios.post(
          `${WORDPRESS_URL}/index.php?rest_route=/traulog/v1/award-call-points`,
          {
            secret: BRIDGE_SECRET,
            user_id: 1,
            points,
            reason,
            session_id: telephonySessionId
          },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        current.pointsSent = true;
        sessions.set(telephonySessionId, current);

        console.log(`Puntos enviados: ${points}`);
        console.log('Respuesta WP:', response.data);
      } else {
        console.log('No se asignaron puntos todavía');
      }
    } else {
      console.log('Evento intermedio recibido; esperando estado final o evitando duplicado.');
    }
  } catch (error) {
    console.error('Error procesando webhook:', error.message);

    if (error.response) {
      console.error('Respuesta WP error:', error.response.data);
    }
  }

  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});