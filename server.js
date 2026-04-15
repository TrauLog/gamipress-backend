const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

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
    const party = event.body?.parties?.[0];

    let points = 0;
    const reasons = [];

    if (party) {
      const direction = party.direction || '';
      const statusCode = party.status?.code || '';
      const duration = Number(party.duration || 0);
      const missedCall = party.missedCall === true;

      console.log('Direction:', direction);
      console.log('Status:', statusCode);
      console.log('Duration:', duration);
      console.log('MissedCall:', missedCall);

      // Regla temporal de prueba
      if (direction === 'Inbound' && !missedCall && duration > 0) {
        points += 5;
        reasons.push('Inbound answered call');
      }

      if (!missedCall && duration > 0) {
        points += 5;
        reasons.push('Completed call');
      }

      if (duration > 120) {
        points += 10;
        reasons.push('Call > 2 min');
      }

      if (duration > 300) {
        points += 15;
        reasons.push('Call > 5 min');
      }

      if (missedCall) {
        points -= 10;
        reasons.push('Missed call');
      }
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
          session_id: party?.id || event.body?.sessionId || 'no-session'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`Puntos enviados: ${points}`);
      console.log('Respuesta WP:', response.data);
    } else {
      console.log('No se asignaron puntos todavía');
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