'use strict';

/**
 * services/slackWebhook.service.js
 *
 * Handles template interpolation and HTTP POST dispatching to Slack Incoming Webhooks.
 * Supports Slack Block Kit formatting, attachments, color coding (Red/Yellow/Green),
 * and dynamic placeholder variables ({{projectName}}, {{targetName}}, {{time}}, etc.)
 */

const axios = require('axios');

/**
 * Format a Date object into local Indonesian time (WIB), e.g. "02 Nov 2026, 11:45:10 WIB"
 * @param {Date|string|number} [dateInput]
 * @returns {string}
 */
function formatLocalTime(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()] || 'Nov';
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${mins}:${secs} WIB`;
}

/**
 * Format duration in seconds into human-readable string (e.g. "8 Menit 25 Detik")
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0 Detik';
  const sec = Math.round(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} Detik`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h === 0) return `${m} Menit ${s} Detik`;
  return `${h} Jam ${remM} Menit ${s} Detik`;
}

/**
 * Replace placeholders in template with actual incident context
 * @param {string} template
 * @param {object} ctx
 * @returns {string}
 */
function interpolateTemplate(template, ctx) {
  if (!template || typeof template !== 'string') return '';

  const replacements = {
    '{{projectName}}': ctx.projectName || 'Default Project',
    '{{environment}}': ctx.environment || 'PRODUCTION',
    '{{targetType}}': ctx.targetType || 'SERVER',
    '{{targetName}}': ctx.targetName || ctx.targetId || 'Target Node',
    '{{targetHost}}': ctx.targetHost || 'localhost',
    '{{severity}}': ctx.severity || 'CRITICAL',
    '{{errorMessage}}': ctx.errorMessage || 'Unknown Connection Failure',
    '{{time}}': ctx.time || formatLocalTime(ctx.timestamp),
    '{{duration}}': ctx.durationText || (ctx.durationSec ? formatDuration(ctx.durationSec) : 'N/A'),
    '{{mentions}}': ctx.mentions || '',
  };

  let result = template;
  for (const [key, val] of Object.entries(replacements)) {
    result = result.split(key).join(val);
  }
  return result;
}

/**
 * Get color border code for Slack attachment
 * @param {'CRITICAL'|'WARNING'|'RESOLVED'|'INFO'} severity
 * @returns {string} Hex color
 */
function getSeverityColor(severity) {
  switch (String(severity).toUpperCase()) {
    case 'CRITICAL':
      return '#E01E5A'; // Red
    case 'WARNING':
      return '#ECB22E'; // Yellow
    case 'RESOLVED':
    case 'OK':
      return '#2EB67D'; // Green
    case 'INFO':
    default:
      return '#4A154B'; // Slack Plum / Blue
  }
}

/**
 * Build default Slack Block Kit payload if custom template is not provided
 * @param {object} ctx
 * @param {object} [alertRule]
 * @returns {object} Slack payload
 */
function buildDefaultPayload(ctx, alertRule = null) {
  const isResolved = ctx.severity === 'RESOLVED';
  const color = getSeverityColor(ctx.severity);
  const style = alertRule?.messageStyle || ctx.messageStyle || 'STANDARD';
  const teamNote = alertRule?.teamNote || ctx.teamNote || '';
  const mentions = alertRule?.mentions || ctx.mentions || '';

  // 1. COMPACT style: minimal single-block text
  if (style === 'COMPACT') {
    const icon = isResolved ? '🟢' : (ctx.severity === 'WARNING' ? '⚠️' : '🚨');
    const statusText = isResolved ? 'PULIH (UP)' : 'GANGGUAN (DOWN)';
    let compactMsg = `${icon} *[${ctx.projectName || 'System'}]* ${ctx.targetType} \`${ctx.targetName}\` status *${statusText}* | ${ctx.time || formatLocalTime(ctx.timestamp)}`;
    if (mentions) compactMsg += ` | ${mentions}`;
    if (!isResolved && ctx.errorMessage) compactMsg += `\n> Error: \`${ctx.errorMessage}\``;
    if (isResolved && (ctx.durationText || ctx.durationSec)) compactMsg += `\n> Downtime: ${ctx.durationText || formatDuration(ctx.durationSec)}`;
    if (teamNote) compactMsg += `\n> 📝 *Catatan Tim:* ${teamNote}`;

    return {
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: compactMsg,
              },
            },
          ],
        },
      ],
    };
  }

  // 2. EMERGENCY (S1) vs STANDARD style
  let headerText = '';
  if (style === 'EMERGENCY') {
    headerText = isResolved
      ? `🟢 [RESOLVED] Insiden Kritis ${ctx.targetType} Selesai`
      : `🚨 [DARURAT S1] OUTAGE PADA ${ctx.targetType.toUpperCase()}!`;
  } else {
    if (isResolved) {
      headerText = `🟢 [RESOLVED] ${ctx.targetType} Kembali Online`;
    } else if (ctx.severity === 'WARNING') {
      headerText = `⚠️ [WARNING] ${ctx.targetType} Mengalami Masalah`;
    } else {
      headerText = `🚨 [CRITICAL] ${ctx.targetType} Terkendala / Offline`;
    }
  }

  const fields = [
    `*Projek:* ${ctx.projectName} (${ctx.environment || 'PRODUCTION'})`,
    `*Target:* ${ctx.targetName} (${ctx.targetHost || 'N/A'})`,
    `*Waktu:* ${ctx.time || formatLocalTime(ctx.timestamp)}`,
  ];

  if (isResolved && (ctx.durationText || ctx.durationSec)) {
    fields.push(`*Total Downtime:* ${ctx.durationText || formatDuration(ctx.durationSec)}`);
  } else if (ctx.errorMessage) {
    fields.push(`*Error Detail:* \`${ctx.errorMessage}\``);
  }

  if (teamNote) {
    fields.push(`*Instruksi / Catatan Tim:* ${teamNote}`);
  }

  if (mentions) {
    fields.push(`*Perhatian:* ${mentions}`);
  }

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: headerText,
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: fields.join('\n'),
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `📍 Dashboard Service Monitoring • ${ctx.projectName || 'System'}`,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Send an alert to Slack Incoming Webhook URL
 * @param {string} webhookUrl
 * @param {object} ctx - Incident context
 * @param {object} [alertRule] - Optional alert rule config with custom template
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
async function sendSlackAlert(webhookUrl, ctx, alertRule = null) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return { success: false, error: 'URL Webhook Slack tidak valid.' };
  }

  try {
    let payload = null;

    if (alertRule && alertRule.useCustomTemplate && alertRule.customTemplate) {
      const interpolatedText = interpolateTemplate(alertRule.customTemplate, {
        ...ctx,
        mentions: alertRule.mentions || ctx.mentions || '',
      });

      payload = {
        attachments: [
          {
            color: getSeverityColor(ctx.severity),
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: interpolatedText,
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `📍 Dashboard Service Monitoring • ${ctx.projectName || 'System'}`,
                  },
                ],
              },
            ],
          },
        ],
      };
    } else {
      payload = buildDefaultPayload(ctx, alertRule);
    }

    const response = await axios.post(webhookUrl.trim(), payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 7000,
    });

    return { success: response.status >= 200 && response.status < 300 };
  } catch (err) {
    const errorMsg = err.response?.data || err.message;
    console.error(`[SlackWebhook] Gagal mengirim pesan ke ${webhookUrl}:`, errorMsg);
    return { success: false, error: String(errorMsg) };
  }
}

/**
 * Send a test ping to Slack Incoming Webhook
 * @param {string} webhookUrl
 * @param {string} [channelLabel]
 * @returns {Promise<{ success: boolean; message: string }>}
 */
async function testSlackWebhook(webhookUrl, channelLabel = '#monitoring-alerts') {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    throw new Error('URL Webhook Slack wajib diisi dan harus diawali http/https.');
  }

  const payload = {
    attachments: [
      {
        color: '#2EB67D', // Green
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔔 Test Koneksi Webhook Slack Berhasil!',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Channel *${channelLabel}* telah berhasil terhubung dengan *Dashboard Service Monitoring*.\nNotifikasi insiden server dan service akan dikirimkan ke channel ini sesuai aturan yang Anda tetapkan.`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Waktu Uji Coba: ${formatLocalTime()} • Status: Active`,
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await axios.post(webhookUrl.trim(), payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 7000,
  });

  if (response.status >= 200 && response.status < 300) {
    return {
      success: true,
      message: `Test ping berhasil terkirim ke Slack (${channelLabel}).`,
    };
  } else {
    throw new Error(`Slack merespons dengan status code ${response.status}`);
  }
}

module.exports = {
  sendSlackAlert,
  testSlackWebhook,
  interpolateTemplate,
  formatLocalTime,
  formatDuration,
};

