// api/video.js
import https from 'https';
import { kv } from '@vercel/kv';

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

const fetchJson = (url, opts) => new Promise((res, rej) => {
  const req = https.request(url, opts, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}); });
  req.on('error', rej); if(opts.body) req.write(opts.body); req.end();
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { imageUrl, jobId } = req.body;
    const pred = await fetchJson('https://api.replicate.com/v1/predictions', {
      method: 'POST', headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: "a3a8c9f2b1d4e5c6...", // Ganti dengan ID Luma Dream Machine terbaru
        input: { prompt_image: imageUrl, prompt: "Cinematic vertical 9:16 product showcase, smooth pan, studio lighting, 5s", aspect_ratio: "9:16", duration: 5 },
        webhook: `${process.env.VERCEL_URL}/api/webhook`,
        webhook_events_filter: ["completed"]
      })
    });

    // Simpan state pending ke KV
    await kv.set(`video:${pred.id}`, JSON.stringify({ status: 'processing', jobId }));

    res.json({ predictionId: pred.id, status: 'queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

