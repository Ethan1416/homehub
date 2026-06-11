import { useRef, useState } from 'react'
import { searchFoods, foodKcal, foodLabel, UNITS } from '../lib/foods.js'
import { analyzeFood } from '../lib/geminiFood.js'

// Type to find a food → pick it → log it.
// Also supports camera: take a photo → AI estimates name/kcal/macros → confirm.
// onLog receives a food object: { name, kcal, protein, carbs, fat }
export default function FoodSearch({ onLog }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('g')
  const [added, setAdded] = useState('')

  // Camera / AI state
  const camRef = useRef(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiDraft, setAiDraft] = useState(null) // editable estimate

  const results = sel ? [] : searchFoods(q)

  function choose(f) { setSel(f); setQty(String(f.def ?? 1)); setUnit('g') }
  function reset() { setSel(null); setQ(''); setQty(''); setAiDraft(null); setAiError(null) }

  function add(tracked) {
    const kcal = tracked ? foodKcal(sel, qty, unit) : 0
    const label = foodLabel(sel, qty, unit)
    onLog({ name: label, kcal, protein: 0, carbs: 0, fat: 0 })
    setAdded(`${label}${tracked ? ` · ${kcal} kcal` : ' · not tracked'}`)
    reset()
  }

  async function handleCamera(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAiLoading(true)
    setAiError(null)
    setAiDraft(null)
    setSel(null)
    setQ('')
    try {
      const result = await analyzeFood(file)
      setAiDraft({
        name: result.name || '',
        weight_g: result.weight_g ?? '',
        kcal: result.kcal ?? '',
        protein: result.protein ?? 0,
        carbs: result.carbs ?? 0,
        fat: result.fat ?? 0,
      })
    } catch (err) {
      setAiError(err.message || 'Could not analyse photo — try again')
    } finally {
      setAiLoading(false)
    }
  }

  function logAi() {
    const food = {
      name: aiDraft.name,
      kcal: Number(aiDraft.kcal) || 0,
      protein: Number(aiDraft.protein) || 0,
      carbs: Number(aiDraft.carbs) || 0,
      fat: Number(aiDraft.fat) || 0,
    }
    onLog(food)
    setAdded(`${food.name} · ${food.kcal} kcal`)
    setAiDraft(null)
  }

  return (
    <div className="fs">
      <div className="fs-h">🍽️ Log what you ate</div>

      {/* Camera input — hidden, triggered by button */}
      <input ref={camRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={handleCamera} />

      {/* AI loading */}
      {aiLoading && (
        <div className="fs-ai-loading">
          <span className="fs-ai-spinner" />
          Analysing your meal…
        </div>
      )}

      {/* AI error */}
      {aiError && !aiLoading && (
        <div className="fs-ai-error">
          {aiError}
          <button className="fs-cancel" onClick={() => setAiError(null)}>Dismiss</button>
        </div>
      )}

      {/* AI result card — editable before logging */}
      {aiDraft && !aiLoading && (
        <div className="fs-ai-card">
          <div className="fs-ai-title">AI estimate — tap to edit</div>
          <input className="fs-ai-name-input" value={aiDraft.name}
            onChange={e => setAiDraft(d => ({ ...d, name: e.target.value }))} />
          <div className="fs-ai-row">
            <label className="fs-ai-fld">
              <span>kcal</span>
              <input inputMode="numeric" value={aiDraft.kcal}
                onChange={e => setAiDraft(d => ({ ...d, kcal: e.target.value }))} />
            </label>
            <label className="fs-ai-fld">
              <span>protein g</span>
              <input inputMode="numeric" value={aiDraft.protein}
                onChange={e => setAiDraft(d => ({ ...d, protein: e.target.value }))} />
            </label>
            <label className="fs-ai-fld">
              <span>carbs g</span>
              <input inputMode="numeric" value={aiDraft.carbs}
                onChange={e => setAiDraft(d => ({ ...d, carbs: e.target.value }))} />
            </label>
            <label className="fs-ai-fld">
              <span>fat g</span>
              <input inputMode="numeric" value={aiDraft.fat}
                onChange={e => setAiDraft(d => ({ ...d, fat: e.target.value }))} />
            </label>
          </div>
          <div className="fs-ai-weight">~{aiDraft.weight_g}g estimated</div>
          <div className="fs-actions">
            <button className="fs-cancel" onClick={() => { setAiDraft(null); camRef.current.click() }}>
              Retake
            </button>
            <button className="fs-add" onClick={logAi}>Log it</button>
          </div>
        </div>
      )}

      {/* Normal search — hidden while AI card is showing */}
      {!aiDraft && !aiLoading && (
        <>
          {!sel && (
            <>
              <div className="fs-search-row">
                <input className="fs-input" value={q} autoFocus={false}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search — chicken, beef, eggs, rice…" />
                <button className="fs-cam-btn" onClick={() => camRef.current.click()}
                  title="Take a photo — AI will estimate calories">
                  📷
                </button>
              </div>
              {results.map((f, i) => (
                <button className="fs-result" key={i} onClick={() => choose(f)}>
                  <span className="fs-result-n">{f.name}</span>
                  <span className="fs-result-k">
                    {f.kind === 'fixed' ? `${f.kcal} kcal` : f.kind === 'item' ? 'per item' : 'by weight'}
                  </span>
                </button>
              ))}
              {q && results.length === 0 && (
                <div className="fs-none">No match — try "chicken", "beef", "rice", "avocado"…</div>
              )}
            </>
          )}

          {sel && (
            <div className="fs-pick">
              <div className="fs-pick-name">{sel.name}</div>
              {sel.kind !== 'fixed' && (
                <div className="fs-qtyrow">
                  <input className="fs-qty" inputMode="decimal" value={qty}
                    onChange={(e) => setQty(e.target.value)} />
                  {sel.kind === 'weighed' ? (
                    <div className="fs-units">
                      {UNITS.map((u) => (
                        <button key={u} className={`fs-unit ${unit === u ? 'on' : ''}`}
                          onClick={() => setUnit(u)}>{u}</button>
                      ))}
                    </div>
                  ) : <span className="fs-eachlbl">each</span>}
                  <button className="fs-nottracked" onClick={() => add(false)}>
                    {sel.kind === 'weighed' ? 'Weight not tracked' : 'Not tracked'}
                  </button>
                </div>
              )}
              <div className="fs-kcal">
                {foodKcal(sel, qty, unit)} kcal
                {sel.kind === 'weighed' ? ` · recommended ${sel.def} g` : ''}
              </div>
              <div className="fs-actions">
                <button className="fs-cancel" onClick={reset}>‹ Back</button>
                <button className="fs-add" onClick={() => add(true)}>Add</button>
              </div>
            </div>
          )}
        </>
      )}

      {added && <div className="fs-added">✓ Logged {added}</div>}
    </div>
  )
}
