const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
const ALLOWED_ORIGIN = 'https://ethan1416.github.io'

const PROMPT = `You are a nutrition expert. Analyze this food photo and respond with ONLY a JSON object — no markdown, no extra text.
Return exactly these fields:
{
  "name": "concise food description (e.g. Grilled chicken breast with rice)",
  "weight_g": <estimated total weight in grams, integer>,
  "kcal": <estimated calories, integer>,
  "protein": <protein in grams, integer>,
  "carbs": <carbs in grams, integer>,
  "fat": <fat in grams, integer>
}
Be realistic. If multiple items, describe the whole meal and sum the totals.`

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Only accept requests from the app
    if (!origin.startsWith(ALLOWED_ORIGIN) && origin !== '') {
      return new Response('Forbidden', { status: 403 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const { imageBase64, mimeType = 'image/jpeg' } = body
    if (!imageBase64) return json({ error: 'imageBase64 required' }, 400)

    const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType, data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
      })
    })

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}))
      return json({ error: err?.error?.message || `Gemini ${geminiRes.status}` }, 502)
    }

    const data = await geminiRes.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\n?|\n?```/g, '').trim()

    try {
      const result = JSON.parse(clean)
      return json(result, 200, ALLOWED_ORIGIN)
    } catch {
      return json({ error: 'Could not parse Gemini response', raw: clean }, 502)
    }
  }
}

function json(data, status = 200, allowOrigin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
    }
  })
}
