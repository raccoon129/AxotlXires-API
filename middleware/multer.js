// middleware/multer.js
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Crear directorios necesarios
const createUploadDirs = async () => {
  const dirs = ['uploads/portadas', 'uploads/perfil'];
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true }).catch(console.error);
  }
};

createUploadDirs();

const storage = multer.memoryStorage(); // Cambiar a memoria para procesar con Sharp

const fileFilter = (req, file, cb) => {
  const tiposPermitidos = /jpeg|jpg|png|gif/;
  const extname = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
  const mimetype = tiposPermitidos.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error('Solo se permiten imágenes'));
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB límite
  fileFilter: fileFilter
});

module.exports = upload;