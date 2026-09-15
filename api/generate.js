// api/generate.js
import sharp from 'sharp';
import https from 'https';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// 1. Konfigurasi Environment Variables
const HF_TOKEN = process.env.HF_TOKEN;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN; // Opsional jika pakai Replicate

// Variabel Supabase S3
const SUPABASE_BUCKET = process.env.SUPABASE_S3_BUCKET || 'master-assets';
const SUPABASE_PUBLIC_URL = process.env.SUPABASE_S3_PUBLIC_URL;

// 2. Inisialisasi S3 Client untuk SUPABASE
const s3 = new S3Client({
  region: process.env.SUPABASE_S3_REGION || 'ap-southeast-1',
  endpoint: process.env.SUPABASE_S3_ENDPOINT, 
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },
  forcePathStyle: true, 
});

// Helper function untuk fetch JSON (Native Node.js)
const fetchJson = (url, options) => new Promise((resolve, reject) => {
  const req = https.request(url, options, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { resolve(JSON.parse(d)); } 
      catch(e) { reject(e); }
    });
  });
  req.on('error', reject);
  if (options.body) req.write(options.body);
  req.end();
});

// Fungsi Generate Prompt & Trend
function getTrendAndPrompt(niche, style, idea) {
  const score = Math.floor(Math.random() * 40) + 60;
  const saturated = score > 75;
  const imperfections = ["Subtle vintage paper grain overlay", "Screen-print misregistration", "Hand-drawn lines"];
  const hooks = { "Vintage Retro": "1970s psychedelic typography with warm fade", "Minimalist": "Japanese Ma aesthetic" };
  
  return {
    prompt: `[ARTISTIC]: ${hooks[style] || 'authentic human illustration'}\n[IMPERFECTION]: ${imperfections.join(', ')}`,
    trend: { score, saturated, price: score > 85 ? "$24.99-$34.99" : "$19.99-$27.99", pivot: saturated ? 'high' : 'mid' },
    listing: { title: `${niche} ${style} Art | Vintage Aesthetic POD`, tags: [`${niche} aesthetic`, 'vintage'] }
  };
}

// MAIN HANDLER - WAJIB EXPORT DEFAULT ASYNC FUNCTION
export default async function handler(req, res) {
  // Set CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { product, niche, style, idea } = req.body;
    
    if (!product || !niche || !style) {
      return res.status(400).json({ error: 'Missing required fields: product, niche, style' });
    }

    const intel = getTrendAndPrompt(niche, style, idea);

    // Jika trend saturated, kembalikan data saja tanpa generate gambar (opsional logic lama)
    if (intel.trend.saturated) {
      return res.json({ status: 'SATURATED', ...intel });
    }

    // 1. Generate SDXL via HuggingFace
    const sdRes = await fetchJson('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${HF_TOKEN}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ inputs: intel.prompt })
    });

    // Cek jika HF mengembalikan error (biasanya object {error: "..."})
    if (sdRes.error) {
      throw new Error(`HuggingFace Error: ${sdRes.error}`);
    }

    // 2. Process Image dengan Sharp (Resize ke 6000px width)
    // sdRes adalah Buffer binary dari HF
    const processedImageBuffer = await sharp(sdRes)
      .resize(6000, null, { withoutEnlargement: true }) 
      .jpeg({ quality: 90 })
      .toBuffer();

    // 3. Upload ke Supabase Storage
    const fileName = `masters/${Date.now()}-${niche.replace(/\s+/g, '-')}.jpg`;
    const uploadParams = {
      Bucket: SUPABASE_BUCKET,
      Key: fileName,
      Body: processedImageBuffer,
      ContentType: 'image/jpeg',
    };

    await s3.send(new PutObjectCommand(uploadParams));

    const imageUrl = `${SUPABASE_PUBLIC_URL}/${fileName}`;

    // 4. Return Success Response
    return res.status(200).json({
      status: 'SUCCESS',
      imageUrl: imageUrl,
      ...intel
    });

  } catch (error) {
    console.error('Generate Error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message 
    });
  }
}
