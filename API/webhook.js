// api/webhook.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  try {
    const { id, status, output } = req.body;
    
    if (status === 'succeeded' && output?.[0]) {
      // Update status di KV agar frontend bisa mengambil via polling ringan
      const existing = await kv.get(`video:${id}`);
      if (existing) {
        await kv.set(`video:${id}`, JSON.stringify({ status: 'completed', videoUrl: output[0], jobId: existing.jobId }));
      }
    } else if (status === 'failed') {
      await kv.set(`video:${id}`, JSON.stringify({ status: 'failed', error: req.body.error }));
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
}
