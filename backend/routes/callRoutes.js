const express = require('express');
const { authenticate, adminOnly, superadminOnly } = require('../middleware/auth');
const { 
  getAllCalls, 
  getCallById, 
  createCall, 
  getDashboardStats, 
  uploadCallData, 
  uploadAudio,
  deleteCalls,
  updateCallStatus,
  updateCall,
  getCallsByDateRange,
  getAuditorNames,
  getAuditorStats,
  parseExcel,
  uploadChunk,
  proxyAudio
} = require('../controllers/callController');
const { audioUpload, dataUpload } = require('../utils/upload');

const router = express.Router();

router.get('/stats', authenticate, getDashboardStats);
router.get('/by-date', authenticate, getCallsByDateRange);
router.get('/auditors', authenticate, getAuditorNames);
router.get('/auditors-stats', authenticate, getAuditorStats);
router.get('/proxy-audio', proxyAudio);
router.get('/', authenticate, getAllCalls);
router.get('/:id', authenticate, getCallById);
router.post('/', authenticate, adminOnly, createCall);
router.post('/delete', authenticate, superadminOnly, deleteCalls);
router.patch('/:id/status', authenticate, updateCallStatus);
router.patch('/:id', authenticate, updateCall);

// Upload routes
router.post('/parse-excel', authenticate, adminOnly, dataUpload.single('file'), parseExcel);
router.post('/upload-chunk', authenticate, adminOnly, uploadChunk);
router.post('/upload-data', authenticate, adminOnly, dataUpload.single('file'), uploadCallData);
router.post('/upload-audio', authenticate, adminOnly, audioUpload.array('files', 50), uploadAudio);

module.exports = router;
