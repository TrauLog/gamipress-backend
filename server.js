const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WORDPRESS_URL = 'https://tuweb.com';
const API_KEY = 'TU_API_KEY';

app.get('/', (req, res) => {
  res.send('Servidor activo');
});

app.post('/webhook', async (req, res) => {
  const validationToken =
    req.headers['validation-token'] ||
    req.headers['Validation-Token'];

  if (validationToken) {
    res.setHeader('Validation-Token', validationToken);
    return res.status(200).send('');
  }

  console.log('Evento recibido:');
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const call = req.body || {};
    let points = 0;
    let reason = '';

    if (call.duration && call.duration > 300) {
      points += 10;
      reason = 'Call > 5 min';
    }

    if (call.direction === 'Inbound') {
      points += 5;
      reason = reason ? reason + ' + Inbound call' : 'Inbound call';
    }

    if (points > 0) {
      await axios.post(
        `${WORDPRESS_URL}/wp-json/gamipress/v1/award-points`,
        {
          user: '1',
          points: points,
          reason: reason
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
      console.log('No se asignaron puntos');
    }
  } catch (error) {
    console.error('Error procesando webhook:', error.message);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});