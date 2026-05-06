const multer = require('multer');

const ALLOWED_MIMES = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Some browsers send CSV as application/octet-stream
  'application/octet-stream',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = file.originalname?.split('.').pop()?.toLowerCase();
    if (ALLOWED_MIMES.includes(file.mimetype) || ['csv', 'xlsx', 'xls', 'txt'].includes(ext)) {
      return cb(null, true);
    }
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

module.exports = { upload };
