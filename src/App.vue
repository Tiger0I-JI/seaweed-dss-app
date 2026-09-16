<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from './supabase'

const form = ref({
  budget: 1500000,
  labor: 15,
  space: 100,
  target_capacity: 5000,
  weight_profit: 4,
  weight_cost: 4,
  weight_space: 3,
  weight_capacity: 5
})

const evaluations = ref([])
const editingId = ref(null)
const isProcessing = ref(false)

// Toast Notification State
const toast = ref({ show: false, message: '', type: 'success' })
const triggerToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3500)
}

// Modal states
const showResultModal = ref(false)
const latestResult = ref({
  config: '',
  score: '',
  reason: '',
  rankings: [],
  inputs: {
    budget: 1500000,
    labor: 15,
    space: 100,
    target_capacity: 5000
  },
  steps: {
    normalized: [],
    weighted: [],
    vPlus: [],
    vMinus: [],
    distances: [],
    weights: [0.25, 0.25, 0.25, 0.25],
    divisors: [0, 0, 0, 0],
    feasibleCount: 4
  }
})

const showDetailModal = ref(false)
const selectedRecord = ref(null)
const showMatrixModal = ref(false)

// Baseline Alternatives Data with Explicit Units and Descriptions
const alternatives = [
  { name: 'Labor-Oriented Configuration',         labor: 6,  cost: 90000,   space: 30,  capacity: 5000,  criteria: [10000, 90000,   30,  600] },
  { name: 'Machine-Oriented Configuration',       labor: 4,  cost: 450000,  space: 80,  capacity: 30000, criteria: [45000, 450000,  80,  3500] },
  { name: 'Space-Efficient Layout Configuration', labor: 5,  cost: 250000,  space: 40,  capacity: 15000, criteria: [28000, 250000,  40,  2000] },
  { name: 'Flexible Manufacturing Configuration', labor: 8,  cost: 1200000, space: 150, capacity: 45000, criteria: [90000, 1200000, 150, 10000] }
]

// Preset Scenarios Applicator (Row 1)
const applyPreset = (type) => {
  if (type === 'balanced') {
    form.value = { budget: 1500000, labor: 15, space: 100, target_capacity: 5000, weight_profit: 4, weight_cost: 4, weight_space: 3, weight_capacity: 5 }
  } else if (type === 'startup') {
    form.value = { budget: 300000, labor: 10, space: 50, target_capacity: 5000, weight_profit: 3, weight_cost: 5, weight_space: 4, weight_capacity: 3 }
  } else if (type === 'mass') {
    form.value = { budget: 5000000, labor: 30, space: 200, target_capacity: 30000, weight_profit: 5, weight_cost: 2, weight_space: 2, weight_capacity: 5 }
  }
  triggerToast('Preset scenario applied successfully!', 'info')
}

// Alternative Focus Preset Applicator (Row 2)
const applyAlternativePreset = (alt) => {
  let weights = { weight_profit: 4, weight_cost: 4, weight_space: 3, weight_capacity: 5 }
  if (alt.name.includes('Labor')) weights = { weight_profit: 3, weight_cost: 5, weight_space: 3, weight_capacity: 3 }
  else if (alt.name.includes('Machine')) weights = { weight_profit: 5, weight_cost: 2, weight_space: 2, weight_capacity: 5 }
  else if (alt.name.includes('Space-Efficient')) weights = { weight_profit: 3, weight_cost: 4, weight_space: 5, weight_capacity: 3 }
  else if (alt.name.includes('Flexible')) weights = { weight_profit: 5, weight_cost: 1, weight_space: 1, weight_capacity: 5 }

  form.value = {
    budget: alt.cost + 100000,
    labor: Math.max(alt.labor + 2, 8),
    space: alt.space + 20,
    target_capacity: alt.capacity,
    ...weights
  }
  triggerToast(`Loaded profile & aligned weights for: ${alt.name.replace(' Configuration', '')}`, 'info')
}

// Smart Badge Helper
const getAlternativeBadge = (name) => {
  if (name.includes('Labor')) return { text: 'Lowest Investment', bg: '#dcfce7', color: '#166534' }
  if (name.includes('Space-Efficient')) return { text: 'Space Saver', bg: '#e0f2fe', color: '#0369a1' }
  if (name.includes('Machine-Oriented')) return { text: 'High Capacity', bg: '#fef3c7', color: '#92400e' }
  if (name.includes('Flexible')) return { text: 'Multi-Product & Agility', bg: '#ede9fe', color: '#5b21b6' }
  return { text: 'Standard', bg: '#f1f5f9', color: '#475569' }
}

// Universal Comprehensive Engine with Strict Descending Sort for Rankings
const calculateDetailedEngine = (budget, labor, space, weights = { p: 4, c: 4, s: 3, cap: 5 }) => {
  const feasible = alternatives.filter(alt => alt.cost <= budget && alt.space <= space && alt.labor <= labor)
  
  if (feasible.length === 0) {
    return {
      text: 'Infeasible: Exceeds Constraints',
      score: 'N/A',
      reason: 'Your available budget, workforce, or space is below the minimum engineering requirements of all 4 alternative configurations.',
      rankings: alternatives.map(alt => ({ name: alt.name, score: 0 })),
      steps: { normalized: [], weighted: [], vPlus: [], vMinus: [], distances: [], weights: [0.25,0.25,0.25,0.25], divisors: [0,0,0,0], feasibleCount: 0 }
    }
  }

  if (feasible.length === 1) {
    return {
      text: `${feasible[0].name} (Only 1 feasible option)`,
      score: '1.0000',
      reason: 'Only this configuration satisfies your strict resource constraints; therefore, no further multi-criteria ranking was required.',
      rankings: [{ name: feasible[0].name, score: 1.0 }],
      steps: { normalized: [], weighted: [], vPlus: [], vMinus: [], distances: [], weights: [0.25,0.25,0.25,0.25], divisors: [0,0,0,0], feasibleCount: 1 }
    }
  }

  const sumWeights = weights.p + weights.c + weights.s + weights.cap
  const W = [weights.p / sumWeights, weights.c / sumWeights, weights.s / sumWeights, weights.cap / sumWeights]

  const numCriteria = W.length
  const divisors = Array(numCriteria).fill(0)
  feasible.forEach(alt => {
    for (let j = 0; j < numCriteria; j++) divisors[j] += Math.pow(alt.criteria[j], 2)
  })
  for (let j = 0; j < numCriteria; j++) divisors[j] = Math.sqrt(divisors[j])

  const normalizedMatrix = feasible.map(alt => ({
    name: alt.name,
    values: alt.criteria.map((val, j) => divisors[j] === 0 ? 0 : val / divisors[j])
  }))

  const weightedMatrix = normalizedMatrix.map(row => ({
    name: row.name,
    values: row.values.map((val, j) => val * W[j])
  }))

  const isMaxBenefit = [true, false, false, true]
  const V_plus = Array(numCriteria).fill(0)
  const V_minus = Array(numCriteria).fill(0)

  for (let j = 0; j < numCriteria; j++) {
    const columnValues = weightedMatrix.map(row => row.values[j])
    if (isMaxBenefit[j]) {
      V_plus[j] = Math.max(...columnValues)
      V_minus[j] = Math.min(...columnValues)
    } else {
      V_plus[j] = Math.min(...columnValues)
      V_minus[j] = Math.max(...columnValues)
    }
  }

  let resultsList = []
  let distanceDetails = []

  weightedMatrix.forEach((row) => {
    let sPlusSq = 0, sMinusSq = 0
    for (let j = 0; j < numCriteria; j++) {
      sPlusSq += Math.pow(row.values[j] - V_plus[j], 2)
      sMinusSq += Math.pow(row.values[j] - V_minus[j], 2)
    }
    const S_plus = Math.sqrt(sPlusSq)
    const S_minus = Math.sqrt(sMinusSq)
    const C_i = S_minus / (S_plus + S_minus)
    resultsList.push({ name: row.name, score: C_i })
    distanceDetails.push({ name: row.name, sPlus: S_plus, sMinus: S_minus, score: C_i })
  })

  // Strictly sort descending by Ci score so highest score is always Rank #1
  resultsList.sort((a, b) => b.score - a.score)
  distanceDetails.sort((a, b) => b.score - a.score)

  const best = resultsList[0]

  return {
    text: `${best.name} (TOPSIS Score: ${best.score.toFixed(4)})`,
    score: best.score.toFixed(4),
    reason: `Passed constraint screening among ${feasible.length} feasible alternatives. Achieved highest closeness coefficient.`,
    rankings: resultsList,
    steps: {
      normalized: normalizedMatrix,
      weighted: weightedMatrix,
      vPlus: V_plus,
      vMinus: V_minus,
      distances: distanceDetails,
      weights: W,
      divisors: divisors,
      feasibleCount: feasible.length
    }
  }
}

// Helper to get engine results for historical records using current form or record weights if available
const getRecordEngine = (record) => {
  if (!record) return { rankings: [], steps: { divisors: [], weighted: [], distances: [] } }
  return calculateDetailedEngine(
    record.budget,
    record.labor,
    record.space,
    {
      p: record.weight_profit ?? form.value.weight_profit,
      c: record.weight_cost ?? form.value.weight_cost,
      s: record.weight_space ?? form.value.weight_space,
      cap: record.weight_capacity ?? form.value.weight_capacity
    }
  )
}

// Database Operations supporting weights if present in record
const saveEvaluation = async () => {
  isProcessing.value = true
  try {
    const currentInputSnapshot = { ...form.value }
    const weightsObj = { p: currentInputSnapshot.weight_profit, c: currentInputSnapshot.weight_cost, s: currentInputSnapshot.weight_space, cap: currentInputSnapshot.weight_capacity }
    const resultObj = calculateDetailedEngine(currentInputSnapshot.budget, currentInputSnapshot.labor, currentInputSnapshot.space, weightsObj)
    const recommendationResult = resultObj.text

    const payload = {
      budget: currentInputSnapshot.budget, 
      labor: currentInputSnapshot.labor, 
      space: currentInputSnapshot.space,
      target_capacity: currentInputSnapshot.target_capacity,
      weight_profit: currentInputSnapshot.weight_profit,
      weight_cost: currentInputSnapshot.weight_cost,
      weight_space: currentInputSnapshot.weight_space,
      weight_capacity: currentInputSnapshot.weight_capacity,
      recommended_config: recommendationResult
    }

    let error = null
    // Try saving with weights first
    let res = await supabase.from('evaluations').insert([payload])
    error = res.error

    if (error && error.message && error.message.includes('column')) {
      // Fallback if weight columns are not yet in Supabase table
      const fallbackPayload = {
        budget: currentInputSnapshot.budget,
        labor: currentInputSnapshot.labor,
        space: currentInputSnapshot.space,
        target_capacity: currentInputSnapshot.target_capacity,
        recommended_config: recommendationResult
      }
      const resFallback = await supabase.from('evaluations').insert([fallbackPayload])
      error = resFallback.error
    }

    if (error) throw error

    if (editingId.value) {
      editingId.value = null
      triggerToast('Record successfully updated!', 'success')
    } else {
      triggerToast('New evaluation recorded successfully!', 'success')
    }

    latestResult.value = {
      config: recommendationResult,
      score: resultObj.score,
      reason: resultObj.reason,
      rankings: resultObj.rankings,
      inputs: {
        budget: currentInputSnapshot.budget,
        labor: currentInputSnapshot.labor,
        space: currentInputSnapshot.space,
        target_capacity: currentInputSnapshot.target_capacity
      },
      steps: resultObj.steps
    }
    showResultModal.value = true

    resetForm()
    fetchEvaluations()
  } catch (err) { 
    triggerToast('Error: ' + (err.message || JSON.stringify(err)), 'error') 
  } finally {
    isProcessing.value = false
  }
}

const fetchEvaluations = async () => {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw error
    evaluations.value = data
  } catch (err) {}
}

onMounted(() => {
  fetchEvaluations()
  const initialInput = { ...form.value }
  const initialRes = calculateDetailedEngine(initialInput.budget, initialInput.labor, initialInput.space, { p: initialInput.weight_profit, c: initialInput.weight_cost, s: initialInput.weight_space, cap: initialInput.weight_capacity })
  latestResult.value = {
    config: initialRes.text,
    score: initialRes.score,
    reason: initialRes.reason,
    rankings: initialRes.rankings,
    inputs: {
      budget: initialInput.budget,
      labor: initialInput.labor,
      space: initialInput.space,
      target_capacity: initialInput.target_capacity
    },
    steps: initialRes.steps
  }
})

const editEvaluation = (item) => {
  form.value = { 
    ...item, 
    weight_profit: item.weight_profit ?? 4, 
    weight_cost: item.weight_cost ?? 4, 
    weight_space: item.weight_space ?? 3, 
    weight_capacity: item.weight_capacity ?? 5 
  }
  editingId.value = item.id
  triggerToast('Loaded record into editor form', 'info')
}

const deleteEvaluation = async (id) => {
  if (!confirm('Are you sure you want to delete this record?')) return
  try {
    const { error } = await supabase.from('evaluations').delete().eq('id', id)
    if (error) throw error
    fetchEvaluations()
    triggerToast('Record deleted successfully', 'success')
  } catch (err) {
    triggerToast('Failed to delete record', 'error')
  }
}

const viewDetails = (item) => {
  selectedRecord.value = item
  showDetailModal.value = true
}

const loadRecordToDashboard = (item) => {
  form.value = {
    budget: item.budget,
    labor: item.labor,
    space: item.space,
    target_capacity: item.target_capacity,
    weight_profit: item.weight_profit ?? 4,
    weight_cost: item.weight_cost ?? 4,
    weight_space: item.weight_space ?? 3,
    weight_capacity: item.weight_capacity ?? 5
  }
  showDetailModal.value = false
  triggerToast('Historical parameters loaded into main dashboard!', 'info')
}

const printSingleRecord = (item) => {
  selectedRecord.value = item
  showDetailModal.value = true
  setTimeout(() => {
    window.print()
  }, 150)
}

const closeResultModal = () => {
  showResultModal.value = false
}

const closeDetailModal = () => {
  showDetailModal.value = false
  selectedRecord.value = null
}

const resetForm = () => {
  form.value = { budget: 1500000, labor: 15, space: 100, target_capacity: 5000, weight_profit: 4, weight_cost: 4, weight_space: 3, weight_capacity: 5 }
  editingId.value = null
}
</script>

<template>
  <div class="app-container">
    <!-- Toast Notification Popup -->
    <div v-if="toast.show" :class="['toast-notification', toast.type]">
      <span>{{ toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️' }}</span>
      <span>{{ toast.message }}</span>
    </div>

    <!-- Centered Header -->
    <header class="header" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; margin-bottom: 24px;">
      <h1 style="font-size: 1.8rem; font-weight: 700; color: #1e293b; margin: 0;">Seaweed Snack Production: DSS Configuration</h1>
      <p style="font-size: 1rem; color: #64748b; margin: 0;">Constraint Screening & True Euclidean TOPSIS Ranking</p>
    </header>

    <!-- Factory Alternatives Baseline Specifications Card -->
    <div class="card no-print" style="margin-bottom: 24px;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <h2 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
          <span>🏭</span> Factory Alternatives Baseline Specifications
        </h2>
        <span style="background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #fde68a;">
          ⚠️ Demo Data (Awaiting Simulation Updates)
        </span>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 8px; margin-bottom: 16px;">
        Baseline operational parameters for the four alternative production configurations.
      </p>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
              <th style="padding: 12px; font-weight: 600; border-top-left-radius: 8px;">Configuration Name</th>
              <th style="padding: 12px; text-align: center; font-weight: 600;">Workforce (Workers)</th>
              <th style="padding: 12px; text-align: center; font-weight: 600;">Investment Cost (THB)</th>
              <th style="padding: 12px; text-align: center; font-weight: 600;">Space (m²)</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; border-top-right-radius: 8px;">Capacity (~Units/Month)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="alt in alternatives" :key="alt.name" style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px; font-weight: 500; color: #1e293b;">
                {{ alt.name }}
                <span :style="{ background: getAlternativeBadge(alt.name).bg, color: getAlternativeBadge(alt.name).color }" style="font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 600;">
                  {{ getAlternativeBadge(alt.name).text }}
                </span>
              </td>
              <td style="padding: 12px; text-align: center; color: #475569;">{{ alt.labor }}</td>
              <td style="padding: 12px; text-align: center; color: #475569;">{{ alt.cost.toLocaleString() }}</td>
              <td style="padding: 12px; text-align: center; color: #475569;">{{ alt.space }}</td>
              <td style="padding: 12px; text-align: center; font-weight: bold; color: #4f46e5;">~{{ alt.capacity.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Input Constraints & Preferences Card -->
    <div class="card form-card no-print">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <h2>{{ editingId ? 'Edit System Configuration' : 'Input Constraints & Preferences' }}</h2>
        
        <!-- Two Rows of Presets -->
        <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end;">
          <!-- Row 1: General Scenarios -->
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Quick Presets:</span>
            <button @click="applyPreset('balanced')" style="background: #e0e7ff; color: #3730a3; border: none; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">⚖️ Balanced</button>
            <button @click="applyPreset('startup')" style="background: #dcfce7; color: #166534; border: none; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">🌱 Startup</button>
            <button @click="applyPreset('mass')" style="background: #fef3c7; color: #92400e; border: none; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">🚀 Mass Prod</button>
          </div>
          <!-- Row 2: Alternative Focus Presets -->
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Focus Alternative:</span>
            <button @click="applyAlternativePreset(alternatives[0])" style="background: #f1f5f9; color: #166534; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">👷 Labor</button>
            <button @click="applyAlternativePreset(alternatives[1])" style="background: #f1f5f9; color: #92400e; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">⚙️ Machine</button>
            <button @click="applyAlternativePreset(alternatives[2])" style="background: #f1f5f9; color: #0369a1; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">📐 Space</button>
            <button @click="applyAlternativePreset(alternatives[3])" style="background: #f1f5f9; color: #5b21b6; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer;">🌟 Flexible</button>
          </div>
        </div>
      </div>
      
      <div class="grid-2-col">
        <!-- Stage 1: Resource Constraints -->
        <div class="form-section">
          <h3>1. Available Resources (Constraints)</h3>
          
          <div class="form-group">
            <div class="label-row">
              <label>Investment Budget</label>
              <span class="value-badge">{{ form.budget.toLocaleString() }} THB</span>
            </div>
            <input type="range" min="50000" max="10000000" step="50000" v-model.number="form.budget" />
            <div class="range-labels"><span>50k</span><span>10M</span></div>
          </div>
          
          <div class="form-group">
            <div class="label-row">
              <label>Available Workforce</label>
              <span class="value-badge">{{ form.labor }} Workers</span>
            </div>
            <input type="range" min="1" max="50" step="1" v-model.number="form.labor" />
            <div class="range-labels"><span>1</span><span>50</span></div>
          </div>
          
          <div class="form-group">
            <div class="label-row">
              <label>Available Space</label>
              <span class="value-badge">{{ form.space }} m²</span>
            </div>
            <input type="range" min="10" max="500" step="10" v-model.number="form.space" />
            <div class="range-labels"><span>10 m²</span><span>500 m²</span></div>
          </div>
          
          <div class="form-group">
            <div class="label-row">
              <label>Target Capacity</label>
              <span class="value-badge">{{ form.target_capacity.toLocaleString() }} Units</span>
            </div>
            <input type="range" min="500" max="50000" step="500" v-model.number="form.target_capacity" />
            <div class="range-labels"><span>500</span><span>50,000</span></div>
          </div>
        </div>

        <!-- Stage 2: TOPSIS Preferences with Tooltips -->
        <div class="form-section">
          <h3>
            2. Business Preferences (1-5 Scale)
            <span class="tooltip-icon">ℹ️
              <span class="tooltip-box">Weights are normalized and applied during the multicriteria aggregation stage.</span>
            </span>
          </h3>
          
          <div class="form-group">
            <div class="label-row">
              <label>Maximize Profit Importance</label>
              <span class="value-badge weight-badge">{{ form.weight_profit }} / 5</span>
            </div>
            <input type="range" min="1" max="5" step="1" v-model.number="form.weight_profit" />
            <div class="range-labels"><span>Low (1)</span><span>High (5)</span></div>
          </div>
          
          <div class="form-group">
            <div class="label-row">
              <label>Minimize Initial Cost Importance</label>
              <span class="value-badge weight-badge">{{ form.weight_cost }} / 5</span>
            </div>
            <input type="range" min="1" max="5" step="1" v-model.number="form.weight_cost" />
            <div class="range-labels"><span>Low (1)</span><span>High (5)</span></div>
          </div>
          
          <div class="form-group">
            <div class="label-row">
              <label>Minimize Space Importance</label>
              <span class="value-badge weight-badge">{{ form.weight_space }} / 5</span>
            </div>
            <input type="range" min="1" max="5" step="1" v-model.number="form.weight_space" />
            <div class="range-labels"><span>Low (1)</span><span>High (5)</span></div>
          </div>
          
          <div class="form-group">
            <div class="label-row">
              <label>Capacity & Flexibility Importance</label>
              <span class="value-badge weight-badge">{{ form.weight_capacity }} / 5</span>
            </div>
            <input type="range" min="1" max="5" step="1" v-model.number="form.weight_capacity" />
            <div class="range-labels"><span>Low (1)</span><span>5 (High)</span></div>
          </div>
        </div>
      </div>

      <div class="form-actions" style="display: flex; gap: 10px; align-items: center;">
        <button class="btn btn-primary" @click="saveEvaluation" :disabled="isProcessing" style="flex: 2; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span v-if="isProcessing" class="spinner"></span>
          <span>{{ isProcessing ? 'Processing Engine...' : (editingId ? 'Update & Re-run Engine' : 'Run Decision Engine & Save') }}</span>
        </button>
        <button class="btn btn-secondary" @click="resetForm" style="flex: 1; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">
          Reset Defaults
        </button>
        <button v-if="editingId" class="btn btn-secondary" @click="resetForm" style="flex: 1;">
          Cancel
        </button>
      </div>
    </div>

    <!-- Dynamic Comparative Evaluation & TOPSIS Ranking Results Card -->
    <div class="card no-print" style="margin-bottom: 24px;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <h2 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
          <span>📊</span> Comparative Evaluation & TOPSIS Ranking Results
        </h2>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button @click="showMatrixModal = true" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px; background: #4f46e5; color: white; border: none; border-radius: 20px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(79,70,229,0.3);">
            📐 View Full Step-by-Step Mathematical Derivation
          </button>
          <span class="tooltip-target" style="background-color: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #a7f3d0; cursor: help;">
            ✨ Real-time Multi-Criteria Ranking (Ci)
            <span class="tooltip-box">Closeness Coefficient (Ci): Measures relative closeness to the ideal best solution. Range [0, 1]. Higher is better.</span>
          </span>
        </div>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 8px; margin-bottom: 20px;">
        Visual comparison of alternative configurations based on Closeness Coefficients (Ci) from the latest run.
      </p>

      <!-- Dynamic Ranking Bars -->
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div v-for="(item, index) in (latestResult.rankings && latestResult.rankings.length > 0 ? latestResult.rankings : [
          { name: 'Flexible Manufacturing Configuration', score: 0.845 },
          { name: 'Machine-Oriented Configuration', score: 0.720 },
          { name: 'Space-Efficient Layout Configuration', score: 0.580 },
          { name: 'Labor-Oriented Configuration', score: 0.410 }
        ])" :key="item.name" style="background: #f8fafc; padding: 14px 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; align-items: center; flex-wrap: wrap;">
            <span style="font-weight: 600; color: #1e293b;">
              {{ index + 1 }}. {{ item.name }}
              <span :style="{ background: getAlternativeBadge(item.name).bg, color: getAlternativeBadge(item.name).color }" style="font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 6px; font-weight: 600;">
                {{ getAlternativeBadge(item.name).text }}
              </span>
            </span>
            <span style="font-weight: 700; color: #4f46e5;">Ci = {{ (item.score || 0).toFixed(3) }} (Rank #{{ index + 1 }})</span>
          </div>
          <div style="width: 100%; background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
            <div :style="{ width: ((item.score || 0) * 100) + '%', background: index === 0 ? '#4f46e5' : '#0ea5e9', height: '100%', borderRadius: '5px', transition: 'width 0.5s ease' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Evaluation Records Section (Limited to 5 latest records) -->
    <div class="card no-print">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin: 0;">Evaluation Records (Latest 5)</h2>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Resources (Budget / Space / Workers)</th>
              <th>Target Capacity</th>
              <th>Recommended Production Configuration</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in evaluations" :key="item.id">
              <td>
                <div class="resource-info">
                  <strong>{{ item.budget.toLocaleString() }} THB</strong>
                  <span class="sub-text">{{ item.space }} m² | {{ item.labor }} workers</span>
                </div>
              </td>
              <td>{{ item.target_capacity.toLocaleString() }}</td>
              <td>
                <span :class="['result-text', item.recommended_config.includes('Infeasible') ? 'text-danger' : 'text-primary']">
                  {{ item.recommended_config }}
                </span>
              </td>
              <td class="action-cell">
                <button class="btn-icon btn-print" @click="printSingleRecord(item)" style="background: #e0e7ff; color: #3730a3; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 4px; font-weight: 600;">Print Report</button>
                <button class="btn-icon btn-view" @click="viewDetails(item)">View</button>
                <button class="btn-icon btn-edit" @click="editEvaluation(item)">Edit</button>
                <button class="btn-icon btn-delete" @click="deleteEvaluation(item.id)">Del</button>
              </td>
            </tr>
            <tr v-if="evaluations.length === 0">
              <td colspan="4" class="empty-state">No records found in database. Run the decision engine above.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 1. Result Popup Modal (Triggered on Run) -->
    <div v-if="showResultModal" class="modal-overlay no-print" @click.self="closeResultModal">
      <div class="modal-content animate-pop">
        <div class="modal-icon-header">
          <span class="success-dot"></span>
          <h3>Decision Engine Results</h3>
        </div>
        <div class="modal-body">
          <div class="result-highlight-box">
            <label>Recommended Configuration:</label>
            <p class="highlight-config">{{ latestResult.config }}</p>
          </div>
          <div class="rationale-box">
            <h4>💡 Rationale & Decision Logic:</h4>
            <p>{{ latestResult.reason }}</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="closeResultModal" style="width: 100%;">Got it, View Record</button>
        </div>
      </div>
    </div>

    <!-- 2. Detail Popup Modal & Professional Printable Report -->
    <div v-if="showDetailModal" class="modal-overlay printable-modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content printable-modal-content" style="max-width: 820px; width: 95%; max-height: 85vh; overflow-y: auto; padding: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;" class="no-print">
          <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #1e293b;">Official Evaluation & TOPSIS Report</h3>
          <button @click="closeDetailModal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
        </div>

        <!-- Professional Print Header -->
        <div class="print-only-title" style="display: none; border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0; font-size: 16px; color: #1e293b; font-weight: 700; text-transform: uppercase;">Chiang Mai University — Industrial Engineering</h2>
          <p style="margin: 2px 0 0 0; font-size: 14px; color: #334155; font-weight: 600;">Seaweed Snack Production Technology Licensing DSS</p>
          <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">Official Comprehensive Evaluation & TOPSIS Mathematical Report</p>
        </div>

        <div v-if="selectedRecord" class="modal-body" style="font-size: 13px; display: flex; flex-direction: column; gap: 16px; color: #334155;">
          
          <!-- Section 1: Inputs -->
          <div class="print-card-box" style="background: #f8fafc; padding: 12px 14px; border-radius: 6px; border: 1px solid #cbd5e1;">
            <h4 style="font-size: 13px; color: #1e293b; margin-top: 0; margin-bottom: 6px; font-weight: 700;">1. Input Resource Constraints Snapshot</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
              <p style="margin: 0;"><strong>Investment Budget:</strong> {{ selectedRecord.budget.toLocaleString() }} THB</p>
              <p style="margin: 0;"><strong>Available Workforce:</strong> {{ selectedRecord.labor }} Workers</p>
              <p style="margin: 0;"><strong>Available Space:</strong> {{ selectedRecord.space }} m²</p>
              <p style="margin: 0;"><strong>Target Capacity:</strong> {{ selectedRecord.target_capacity.toLocaleString() }} Units</p>
            </div>
            <p style="font-size: 10px; color: #64748b; margin-top: 6px; margin-bottom: 0;"><strong>Timestamp:</strong> {{ new Date(selectedRecord.created_at).toLocaleString() }}</p>
          </div>

          <!-- Section 2: Recommendation -->
          <div class="print-card-box" style="background: #ffffff; padding: 10px 14px; border-radius: 6px; border: 1px solid #cbd5e1;">
            <h4 style="font-size: 13px; color: #1e293b; margin-top: 0; margin-bottom: 2px; font-weight: 700;">2. Final Recommended Configuration</h4>
            <p style="font-size: 13px; margin: 0; color: #2563eb; font-weight: bold;">
              {{ selectedRecord.recommended_config }}
            </p>
          </div>

          <!-- Section 3: Rankings Table -->
          <div class="print-card-box" style="background: #ffffff; padding: 10px 14px; border-radius: 6px; border: 1px solid #cbd5e1;">
            <h4 style="font-size: 13px; color: #1e293b; margin-top: 0; margin-bottom: 6px; font-weight: 700;">3. Complete TOPSIS Closeness Coefficient (Ci) Rankings</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; color: #475569;">
                  <th style="padding: 5px;">Rank</th>
                  <th style="padding: 5px;">Alternative Configuration</th>
                  <th style="padding: 5px; text-align: right;">Ci Score</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, idx) in getRecordEngine(selectedRecord).rankings" :key="r.name" style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px; font-weight: bold;">#{{ idx + 1 }}</td>
                  <td style="padding: 5px; font-weight: 500;">{{ r.name }}</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold; color: #4f46e5;">{{ r.score.toFixed(4) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Section 4: Full Step-by-Step Mathematical Derivation -->
          <div class="print-card-box" style="background: #ffffff; padding: 10px 14px; border-radius: 6px; border: 1px solid #cbd5e1;">
            <h4 style="font-size: 13px; color: #1e293b; margin-top: 0; margin-bottom: 8px; font-weight: 700;">4. TOPSIS Mathematical Derivation Breakdown</h4>
            
            <div style="margin-bottom: 8px; font-size: 11px;">
              <p style="margin: 0 0 2px 0; font-weight: 600; color: #475569;">Step 2: Vector Normalization Divisors (RMS Denominators)</p>
              <div style="background: #f8fafc; padding: 4px 8px; border-radius: 4px; font-family: monospace; border: 1px solid #e2e8f0;">
                [ {{ getRecordEngine(selectedRecord).steps.divisors.map(d => d.toFixed(2)).join(', ') }} ]
              </div>
            </div>

            <div style="margin-bottom: 8px;" v-if="getRecordEngine(selectedRecord).steps.weighted.length > 0">
              <p style="margin: 0 0 2px 0; font-weight: 600; color: #475569; font-size: 11px;">Step 3: Weighted Normalized Matrix (v_ij)</p>
              <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; color: #475569;">
                    <th style="padding: 4px;">Configuration</th>
                    <th style="padding: 4px; text-align: center;">v_i1 (Profit)</th>
                    <th style="padding: 4px; text-align: center;">v_i2 (Cost)</th>
                    <th style="padding: 4px; text-align: center;">v_i3 (Space)</th>
                    <th style="padding: 4px; text-align: center;">v_i4 (Capacity)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in getRecordEngine(selectedRecord).steps.weighted" :key="row.name" style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 4px; font-weight: 500;">{{ row.name }}</td>
                    <td style="padding: 4px; text-align: center;">{{ row.values[0].toFixed(4) }}</td>
                    <td style="padding: 4px; text-align: center;">{{ row.values[1].toFixed(4) }}</td>
                    <td style="padding: 4px; text-align: center;">{{ row.values[2].toFixed(4) }}</td>
                    <td style="padding: 4px; text-align: center;">{{ row.values[3].toFixed(4) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <p style="margin: 0 0 2px 0; font-weight: 600; color: #475569; font-size: 11px;">Steps 4-6: Euclidean Distances (S⁺, S⁻) & Final Ci Scores</p>
              <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; color: #475569;">
                    <th style="padding: 4px;">Configuration</th>
                    <th style="padding: 4px; text-align: center;">S⁺ (Dist. Best)</th>
                    <th style="padding: 4px; text-align: center;">S⁻ (Dist. Worst)</th>
                    <th style="padding: 4px; text-align: center;">Ci Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in getRecordEngine(selectedRecord).steps.distances" :key="d.name" style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 4px; font-weight: 500;">{{ d.name }}</td>
                    <td style="padding: 4px; text-align: center;">{{ d.sPlus.toFixed(4) }}</td>
                    <td style="padding: 4px; text-align: center;">{{ d.sMinus.toFixed(4) }}</td>
                    <td style="padding: 4px; text-align: center; font-weight: bold; color: #4f46e5;">{{ d.score.toFixed(4) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>

        </div>

        <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-primary no-print" @click="loadRecordToDashboard(selectedRecord)" style="flex: 2; background: #4f46e5; color: white; padding: 10px; font-weight: 600;">📥 Load to Dashboard</button>
          <button class="btn btn-secondary no-print" @click="printSingleRecord(selectedRecord)" style="flex: 1; background: #e0e7ff; color: #3730a3; border: none; padding: 10px; font-weight: 600;">🖨️ Print Complete Report</button>
          <button class="btn btn-secondary no-print" @click="closeDetailModal" style="flex: 1; padding: 10px;">Close</button>
        </div>
      </div>
    </div>

    <!-- 3. Full Step-by-Step Mathematical Derivation Modal (Live Run Breakdown) -->
    <div v-if="showMatrixModal" class="modal-overlay no-print" @click.self="showMatrixModal = false">
      <div class="modal-content" style="max-width: 900px; width: 95%; max-height: 85vh; overflow-y: auto; padding: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">
          <div>
            <h3 style="margin: 0; font-size: 1.35rem; color: #1e293b;">📐 TOPSIS & Constraint Screening: Live Mathematical Breakdown</h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Step-by-step calculations based on your <strong>Latest Run Snapshot</strong>.</p>
          </div>
          <button @click="showMatrixModal = false" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #64748b;">✕</button>
        </div>
        
        <div class="modal-body" style="font-size: 13px; color: #334155; display: flex; flex-direction: column; gap: 24px;">
          
          <!-- Criteria Definitions -->
          <div style="background: #f8fafc; padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0;">
            <h4 style="margin-top: 0; color: #1e293b; font-size: 14px; font-weight: 700;">📌 Evaluation Criteria & Optimization Goals</h4>
            <ul style="margin: 8px 0 0 20px; padding: 0; line-height: 1.6;">
              <li><strong>Criterion 1 (C₁ - Monthly Profit):</strong> Benefit criteria (Maximize ↑), Unit: <code>THB/Month</code></li>
              <li><strong>Criterion 2 (C₂ - Initial Cost):</strong> Cost criteria (Minimize ↓), Unit: <code>THB</code></li>
              <li><strong>Criterion 3 (C₃ - Factory Space):</strong> Cost criteria (Minimize ↓), Unit: <code>m²</code></li>
              <li><strong>Criterion 4 (C₄ - Monthly Capacity):</strong> Benefit criteria (Maximize ↑), Unit: <code>Units/Month</code></li>
            </ul>
          </div>

          <!-- Step 1 -->
          <div style="background: #ffffff; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e293b; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 6px;">Step 1: Constraint-Based Feasibility Screening</h4>
            <p style="color: #64748b; margin-bottom: 8px;">Checking latest run resources: Budget ≤ <strong>{{ latestResult.inputs.budget.toLocaleString() }} THB</strong>, Workforce ≤ <strong>{{ latestResult.inputs.labor }} Workers</strong>, Space ≤ <strong>{{ latestResult.inputs.space }} m²</strong>.</p>
            <div style="background: #e0e7ff; color: #3730a3; padding: 10px; border-radius: 6px; font-weight: 600;">
              ✨ Result: {{ latestResult.steps.feasibleCount || 4 }} out of 4 Alternative Configurations passed the constraint screening.
            </div>
          </div>

          <!-- Step 2 -->
          <div style="background: #ffffff; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e293b; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 6px;">Step 2: Vector Normalization (r<sub>ij</sub>)</h4>
            <p style="color: #64748b; margin-bottom: 8px;">Formula: r<sub>ij</sub> = x<sub>ij</sub> / √(Σ x<sub>ij</sub>²). Square root divisors (denominator):</p>
            <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-family: monospace; font-size: 12px;">
              Divisors (RMS denominators): [ 
                {{ latestResult.steps.divisors ? latestResult.steps.divisors.map(d => d.toFixed(2)).join(', ') : '0, 0, 0, 0' }} 
              ]
            </div>
            
            <div v-if="latestResult.steps && latestResult.steps.normalized && latestResult.steps.normalized.length > 0">
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                  <thead>
                    <tr style="background: #f1f5f9; color: #475569;">
                      <th style="padding: 8px;">Alternative Configuration</th>
                      <th style="padding: 8px; text-align: center;">r<sub>i1</sub> (Profit)</th>
                      <th style="padding: 8px; text-align: center;">r<sub>i2</sub> (Cost)</th>
                      <th style="padding: 8px; text-align: center;">r<sub>i3</sub> (Space)</th>
                      <th style="padding: 8px; text-align: center;">r<sub>i4</sub> (Capacity)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in latestResult.steps.normalized" :key="row.name" style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 8px; font-weight: 500;">{{ row.name }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[0].toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[1].toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[2].toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[3].toFixed(4) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div style="background: #ffffff; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e293b; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 6px;">Step 3: Weighted Normalized Matrix (v<sub>ij</sub> = r<sub>ij</sub> × W<sub>j</sub>)</h4>
            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 12px; font-size: 12px;">
              Profit W₁ = <strong>{{ (latestResult.steps.weights ? latestResult.steps.weights[0] : 0.25).toFixed(4) }}</strong> | 
              Cost W₂ = <strong>{{ (latestResult.steps.weights ? latestResult.steps.weights[1] : 0.25).toFixed(4) }}</strong> | 
              Space W₃ = <strong>{{ (latestResult.steps.weights ? latestResult.steps.weights[2] : 0.25).toFixed(4) }}</strong> | 
              Capacity W₄ = <strong>{{ (latestResult.steps.weights ? latestResult.steps.weights[3] : 0.25).toFixed(4) }}</strong>
            </div>
            
            <div v-if="latestResult.steps && latestResult.steps.weighted && latestResult.steps.weighted.length > 0">
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                  <thead>
                    <tr style="background: #f1f5f9; color: #475569;">
                      <th style="padding: 8px;">Alternative Configuration</th>
                      <th style="padding: 8px; text-align: center;">v<sub>i1</sub></th>
                      <th style="padding: 8px; text-align: center;">v<sub>i2</sub></th>
                      <th style="padding: 8px; text-align: center;">v<sub>i3</sub></th>
                      <th style="padding: 8px; text-align: center;">v<sub>i4</sub></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in latestResult.steps.weighted" :key="row.name" style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 8px; font-weight: 500;">{{ row.name }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[0].toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[1].toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[2].toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ row.values[3].toFixed(4) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Step 4 -->
          <div style="background: #ffffff; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e293b; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 6px;">Step 4: Ideal Best (A⁺) and Ideal Worst (A⁻) Solutions</h4>
            <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px;">
              <p style="margin: 0;"><strong>A⁺ (Ideal Best):</strong> [ {{ latestResult.steps.vPlus.map(v => v.toFixed(4)).join(', ') }} ]</p>
              <p style="margin: 6px 0 0 0;"><strong>A⁻ (Ideal Worst):</strong> [ {{ latestResult.steps.vMinus.map(v => v.toFixed(4)).join(', ') }} ]</p>
            </div>
          </div>

          <!-- Step 5 & 6 -->
          <div style="background: #ffffff; padding: 14px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h4 style="color: #1e293b; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 6px;">Steps 5 & 6: Euclidean Separation (S⁺, S⁻) & Closeness Coefficient (Cᵢ)</h4>
            <div v-if="latestResult.steps && latestResult.steps.distances && latestResult.steps.distances.length > 0">
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                  <thead>
                    <tr style="background: #f1f5f9; color: #475569;">
                      <th style="padding: 8px;">Alternative Configuration</th>
                      <th style="padding: 8px; text-align: center;">Sᵢ⁺ (Dist. to Best)</th>
                      <th style="padding: 8px; text-align: center;">Sᵢ⁻ (Dist. to Worst)</th>
                      <th style="padding: 8px; text-align: center;">Cᵢ Score (Rank)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(d, idx) in latestResult.steps.distances" :key="d.name" style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 8px; font-weight: 500;">{{ d.name }}</td>
                      <td style="padding: 8px; text-align: center;">{{ d.sPlus.toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center;">{{ d.sMinus.toFixed(4) }}</td>
                      <td style="padding: 8px; text-align: center; font-weight: bold; color: #4f46e5;">{{ d.score.toFixed(4) }} (Rank #{{ idx + 1 }})</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        <div class="modal-actions" style="margin-top: 24px;">
          <button class="btn btn-secondary" @click="showMatrixModal = false" style="width: 100%; padding: 10px; font-weight: 600;">Close Mathematical Breakdown</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Toast Notification Styles */
.toast-notification {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  background: #1e293b;
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  animation: slideInUp 0.3s ease;
}
.toast-notification.success { background: #065f46; border-left: 4px solid #34d399; }
.toast-notification.error { background: #991b1b; border-left: 4px solid #f87171; }
.toast-notification.info { background: #1e40af; border-left: 4px solid #60a5fa; }

@keyframes slideInUp {
  from { transform: translateY(100px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Spinner for Loading State */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ffffff;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Tooltip Styles */
.tooltip-target {
  position: relative;
  display: inline-block;
}
.tooltip-target .tooltip-box, .tooltip-icon .tooltip-box {
  visibility: hidden;
  width: 240px;
  background-color: #1e293b;
  color: #fff;
  text-align: left;
  border-radius: 6px;
  padding: 8px 12px;
  position: absolute;
  z-index: 50;
  bottom: 125%;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.2s ease;
  font-size: 11px;
  font-weight: normal;
  line-height: 1.4;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}
.tooltip-target:hover .tooltip-box, .tooltip-icon:hover .tooltip-box {
  visibility: visible;
  opacity: 1;
}
.tooltip-icon {
  position: relative;
  display: inline-block;
  cursor: help;
  margin-left: 4px;
}

/* Professional Print Media Formatting: Clean A4 Output without Blank Pages */
@media print {
  @page {
    size: A4;
    margin: 8mm 10mm;
  }
  
  body, html {
    background: white !important;
    color: #000 !important;
    height: auto !important;
    overflow: visible !important;
  }

  body * {
    visibility: hidden !important;
  }
  
  .printable-modal-overlay, 
  .printable-modal-overlay * {
    visibility: visible !important;
  }

  .printable-modal-overlay {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    background: white !important;
    display: block !important;
    z-index: 99999 !important;
  }

  .printable-modal-content {
    box-shadow: none !important;
    border: none !important;
    width: 100% !important;
    max-width: 100% !important;
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }

  .print-only-title {
    display: block !important;
  }

  .no-print {
    display: none !important;
  }

  .print-card-box {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 8px !important;
    border: 1px solid #cbd5e1 !important;
    box-shadow: none !important;
  }

  table {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
</style>
