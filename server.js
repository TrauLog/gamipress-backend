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

    // Buscar la party del agente/extensión
    const agentParty = parties.find((p) => p.extensionId) || parties[0];

    const direction = agentParty.direction || '';
    const statusCode = agentParty.status?.code || '';
    const missedCall = agentParty.missedCall === true;
    const extensionId = String(agentParty.extensionId || '');
    const extensionNumber = String(agentParty.extensionNumber || '');
    const partyId = agentParty.id || 'no-party-id';

    // Datos del agente
    const name =
      agentParty.extension?.name ||
      agentParty.from?.name ||
      agentParty.to?.name ||
      '';

    const email =
      agentParty.extension?.contact?.email ||
      agentParty.contact?.email ||
      '';

    const phone =
      agentParty.from?.phoneNumber ||
      agentParty.to?.phoneNumber ||
      agentParty.phoneNumber ||
      '';

    console.log('telephonySessionId:', telephonySessionId);
    console.log('partyId:', partyId);
    console.log('extensionId:', extensionId);
    console.log('extensionNumber:', extensionNumber);
    console.log('name:', name);
    console.log('email:', email);
    console.log('phone:', phone);
    console.log('Direction:', direction);
    console.log('Status:', statusCode);
    console.log('MissedCall:', missedCall);

    // Recuperar o crear sesión acumulada
    const current = sessions.get(telephonySessionId) || {
      telephonySessionId,
      extensionId: '',
      extensionNumber: '',
      name: '',
      email: '',
      phone: '',
      direction: '',
      answered: false,
      missedCall: false,
      completed: false,
      pointsSent: false,
      updatedAt: Date.now()
    };

    // Acumular datos
    if (extensionId) current.extensionId = extensionId;
    if (extensionNumber) current.extensionNumber = extensionNumber;
    if (name) current.name = name;
    if (email) current.email = email;
    if (phone) current.phone = phone;
    if (direction) current.direction = direction;
    if (missedCall) current.missedCall = true;
    current.updatedAt = Date.now();

    // Estados que interpretamos como llamada contestada
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

    // Solo procesar una vez al finalizar la llamada
    if (current.completed && !current.pointsSent) {
      // Ignorar TODO outbound
      if (current.direction === 'Outbound') {
        points = 0;
      }

      // Penalizar solo missed inbound
      if (current.direction === 'Inbound' && current.missedCall) {
        points -= 10;
        reasons.push('Missed inbound call');
      }

      // Premiar solo inbound contestada
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

      if (
        points !== 0 &&
        WORDPRESS_URL &&
        BRIDGE_SECRET &&
        current.extensionId
      ) {
        const response = await axios.post(
          `${WORDPRESS_URL}/index.php?rest_route=/traulog/v1/award-call-points`,
          {
            secret: BRIDGE_SECRET,
            extension_id: current.extensionId,
            extension_number: current.extensionNumber,
            name: current.name,
            email: current.email,
            phone: current.phone,
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