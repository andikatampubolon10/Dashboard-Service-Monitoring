'use strict';

const express = require('express');
const router = express.Router();
const incidentAiService = require('../services/incidentAi.service');

/**
 * POST /api/ai/incident-tips
 * Generates AI-powered troubleshooting tips and step-by-step CLI commands for incidents
 */
router.post('/incident-tips', async (req, res) => {
  try {
    const {
      issueType = 'service_down',
      severity = 'CRITICAL',
      title = 'Insiden Terdeteksi',
      targetName = 'Target Komponen',
      targetId = '',
      metricBadge = '',
      description = '',
      staticRecommendation = '',
    } = req.body || {};

    const incident = {
      issueType,
      severity,
      title,
      targetName,
      targetId,
      metricBadge,
      description,
      staticRecommendation,
    };

    const tips = await incidentAiService.generateIncidentTips(incident);

    res.json({
      success: true,
      data: tips,
    });
  } catch (err) {
    console.error('[AI Route] Error generating incident tips:', err);
    res.status(500).json({
      success: false,
      error: `Gagal menghasilkan tips AI: ${err.message}`,
    });
  }
});

module.exports = router;
