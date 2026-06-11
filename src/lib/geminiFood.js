const LS_KEY = 'hh_gemini_key'
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='

export function getGeminiKey() { return localStorage.getItem(LS_KEY) || '' }
export function setGeminiKey(k) { localStorage.setItem(LS_KEY, k.trim()) }

async function toBase64(file, maxPx = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
    }
    img.onerror = reject
    img.src = url
  })
}

export async function analyzeFood(file) {
  const key = getGeminiKey()
  if (!key) throw new Error('NO_KEY')
  const base64 = await toBase64(file)
  const res = await fetch(ENDPOINT_BASE + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: `You are a nutrition expert. Analyze this food photo and respond with ONLY a JSON object — no markdown, no extra text.
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
          },
          { inlineData: { mimeType: 'image/jpeg', data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini error ${res.status}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(clean)
}
