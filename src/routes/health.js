const router = require('express').Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SP Bulk Upload Generator — Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
