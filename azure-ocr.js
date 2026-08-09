// دالة Vercel الخلفية — نفس منطق نسخة Netlify، بس بصيغة (req, res) الخاصة بـVercel.
// تتصل بـAzure من طرف السيرفر (بدون مشكلة CORS)، والمفتاح مخفي بمتغيرات بيئة Vercel.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();
  const SAFE_DEADLINE_MS = 8000;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { imageBase64 } = body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'لم تُستلم أي صورة (imageBase64 مفقودة)' });
    }

    const endpoint = (process.env.AZURE_VISION_ENDPOINT || '').replace(/\/$/, '');
    const key = process.env.AZURE_VISION_KEY;
    if (!endpoint || !key) {
      return res.status(500).json({ error: 'متغيرات البيئة AZURE_VISION_ENDPOINT أو AZURE_VISION_KEY غير مضبوطة بإعدادات Vercel' });
    }

    const base64Data = imageBase64.split(',').pop();
    const buffer = Buffer.from(base64Data, 'base64');

    const submitRes = await fetch(endpoint + '/vision/v3.2/read/analyze', {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/octet-stream'
      },
      body: buffer
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return res.status(submitRes.status).json({ error: 'رفض Azure الطلب: ' + errText });
    }

    const operationLocation = submitRes.headers.get('operation-location');
    if (!operationLocation) {
      return res.status(500).json({ error: 'لم يصل رابط النتيجة (operation-location) من Azure' });
    }

    let resultData = null;
    for (let i = 0; i < 20; i++) {
      if (Date.now() - startTime > SAFE_DEADLINE_MS) {
        return res.status(202).json({ error: 'استغرقت المعالجة وقتاً أطول من المتوقع — جرب تحويل جزء أصغر من الكتابة، أو حاول مرة ثانية' });
      }
      await new Promise((r) => setTimeout(r, 350));
      const pollRes = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': key }
      });
      const pollData = await pollRes.json();
      if (pollData.status === 'succeeded') { resultData = pollData; break; }
      if (pollData.status === 'failed') {
        return res.status(500).json({ error: 'فشلت معالجة Azure', details: pollData });
      }
    }

    if (!resultData) {
      return res.status(504).json({ error: 'انتهى الوقت بدون نتيجة من Azure' });
    }

    const lines = [];
    (resultData.analyzeResult?.readResults || []).forEach((page) => {
      (page.lines || []).forEach((line) => lines.push(line.text));
    });

    return res.status(200).json({ lines, raw: resultData });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
