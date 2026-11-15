// Small Hours - Swish Handel callback for pot rooms.
// Swish POSTs here when a payment request is paid, declined or cancelled. The
// body is only a hint: confirmPotPayment asks Swish again over mutual TLS.

import express from 'express';
import { getSwishClient } from '../pot/swish.js';
import { lookupPayment, confirmPotPayment } from '../pot/pot-room.js';

export function setupSwishRoutes(app, manager) {
  app.post('/api/swish/callback', express.json({ limit: '16kb' }), (req, res) => {
    // Answer at once: Swish retries callbacks that are slow or fail.
    res.status(200).end();

    const client = getSwishClient();
    const id = String(req.body?.id || '').toUpperCase();
    const info = lookupPayment(id);
    if (!client || !info) return;
    if (info.callbackIdentifier && req.get('callbackIdentifier') !== info.callbackIdentifier) {
      console.warn('[pot] Swish callback with the wrong callbackIdentifier ignored');
      return;
    }
    confirmPotPayment(id, { client, getRoom: code => manager.getRoom(code) })
      .then(result => {
        if (result.changed) manager.wsControls?.broadcastLobby?.(result.room.code);
      })
      .catch(err => console.error('[pot] could not confirm a Swish payment:', err.message));
  });
}
