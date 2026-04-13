const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const API_KEY = process.env.API_KEY;

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
    let reason = '';

    if (party) {
      if (party.direction === 'Inbound') {
        points += 5;
        reason = 'Inbound call';
      }

      if (party.status && party.status.code === 'Disconnected') {
        points += 5;
        reason = reason ? reason + ' + Completed call' : 'Completed call';
      }
    }

    if (points > 0 && WORDPRESS_URL && API_KEY) {
      await axios.post(
        `${WORDPRESS_URL}/wp-json/gamipress/v1/award-points`,
        {
          user: '1',
          points,
          reason
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`Puntos enviados: ${points}`);
    } else {
      console.log('No se asignaron puntos todavía');
    }
  } catch (error) {
    console.error('Error procesando webhook:', error.message);
  }

  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});