const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { verificarConexion } = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const publicacionesRoutes = require('./routes/publicaciones.routes');

const app = express();

// Middlewares de seguridad y utilidad
app.use(helmet()); // Seguridad HTTP
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev')); // Logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Carpeta para archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/publicaciones', publicacionesRoutes);
const pingRoutes = require('./routes/ping.routes');
app.use('/api/ping', pingRoutes);


// Iniciar servidor solo si la base de datos está conectada
const iniciarServidor = async () => {
  if (await verificarConexion()) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  } else {
    console.error('No se pudo iniciar el servidor debido a errores en la conexión con la base de datos');
    process.exit(1);
  }
};

iniciarServidor();