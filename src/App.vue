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

// Modal states
const showResultModal = ref(false)
const latestResult = ref({
  config: '',
  score: '',
  reason: '',
  rankings: [],
  steps: {
    normalized: [],
    weighted: [],
    vPlus: [],
    vMinus: [],
    distances: []
  }
})

const showDetailModal = ref(false)
const selectedRecord = ref(null)

// New Modal state for Transparent TOPSIS Calculation Breakdown
const showMatrixModal = ref(false)

// Constraint Screening & TOPSIS Decision Engine with Full Step Breakdown
const runConstraintScreeningAndTopsis = () => {
  const alternatives = [
    { name: 'Labor-Oriented Configuration',         labor: 6,  cost: 90000,   space: 30,  criteria: [10000, 90000,   30,  600] },
    { name: 'Machine-Oriented Configuration',       labor: 4,  cost: 450000,  space: 80,  criteria: [45000, 450000,  80,  3500] },
    { name: 'Space-Efficient Layout Configuration', labor: 5,  cost: 250000,  space: 40,  criteria: [28000, 250000,  40,  2000] },
    { name: 'Flexible Manufacturing Configuration', labor: 8,  cost: 1200000, space: 150, criteria: [90000, 1200000, 150, 10000] }
  ]

  // Stage 1: Constraint-Based Screening
  const feasible = alternatives.filter(alt => 
    alt.cost <= form.value.budget && 
    alt.space <= form.value.space && 
    alt.labor <= form.value.labor
  )

  if (feasible.length === 0) {
    return {
      text: 'Infeasible: Exceeds Constraints',
      score: 'N/A',
      reason: 'Your available budget, workforce, or space is below the minimum engineering requirements of all 4 alternative configurations.',
      rankings: alternatives.map(alt => ({ name: alt.name, score: 0 })),
      steps: { normalized: [], weighted: [], vPlus: [], vMinus: [], distances: [] }
    }
  }

  if (feasible.length === 1) {
    return {
      text: `${feasible[0].name} (Only 1 feasible option)`,
      score: '1.0000',
      reason: 'Only this configuration satisfies your strict resource constraints; therefore, no further multi-criteria ranking was required.',
      rankings: [{ name: feasible[0].name, score: 1.0 }],
      steps: { normalized: [], weighted: [], vPlus: [], vMinus: [], distances: [] }
    }
  }

  // Stage 2: TOPSIS Ranking Calculation
  const sumWeights = form.value.weight_profit + form.value.weight_cost + form.value.weight_space + form.value.weight_capacity
  const W = [
    form.value.weight_profit / sumWeights,
    form.value.weight_cost / sumWeights,
    form.value.weight_space / sumWeights,
    form.value.weight_capacity / sumWeights
  ]

  const numCriteria = W.length
  const divisors = Array(numCriteria).fill(0)
  
  feasible.forEach(alt => {
    for (let j = 0; j < numCriteria; j++) divisors[j] += Math.pow(alt.criteria[j], 2)
  })
  for (let j = 0; j < numCriteria; j++) divisors[j] = Math.sqrt(divisors[j])

  // Normalized Matrix (r_ij)
  const normalizedMatrix = feasible.map(alt => ({
    name: alt.name,
    values: alt.criteria.map((val, j) => divisors[j] === 0 ? 0 : val / divisors[j])
  }))

  // Weighted Normalized Matrix (v_ij = r_ij * W_j)
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

  weightedMatrix.forEach((row, i) => {
    let sPlusSq = 0
    let sMinusSq = 0
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

  resultsList.sort((a, b) => b.score - a.score)
  const best = resultsList[0]

  return {
    text: `${best.name} (TOPSIS Score: ${best.score.toFixed(4)})`,
    score: best.score.toFixed(4),
    reason: `Passed constraint screening among ${feasible.length} feasible alternatives. It achieved the highest closeness coefficient based on your defined criteria preferences (Profit: ${form.value.weight_profit}, Cost: ${form.value.weight_cost}, Space: ${form.value.weight_space}, Capacity: ${form.value.weight_capacity}).`,
    rankings: resultsList,
    steps: {
      normalized: normalizedMatrix,
      weighted: weightedMatrix,
      vPlus: V_plus,
      vMinus: V_minus,
      distances: distanceDetails
    }
  }
}

// Database Operations
const saveEvaluation = async () => {
  try {
    const resultObj = runConstraintScreeningAndTopsis()
    const recommendationResult = resultObj.text

    const payload = {
      budget: form.value.budget, 
      labor: form.value.labor, 
      space: form.value.space,
      target_capacity: form.value.target_capacity, 
      recommended_config: recommendationResult
    }

    if (editingId.value) {
      const { error } = await supabase.from('evaluations').update(payload).eq('id', editingId.value)
      if (error) throw error
      editingId.value = null
    } else {
      const { error } = await supabase.from('evaluations').insert([payload])
      if (error) throw error
    }

    latestResult.value = {
      config: recommendationResult,
      score: resultObj.score,
      reason: resultObj.reason,
      rankings: resultObj.rankings,
      steps: resultObj.steps
    }
    showResultModal.value = true

    resetForm()
    fetchEvaluations()
  } catch (err) { alert('Error details: ' + (err.message || JSON.stringify(err))) }
}

const fetchEvaluations = async () => {
  try {
    const { data, error } = await supabase.from('evaluations').select('*').order('created_at', { ascending: false })
    if (error) throw error
    evaluations.value = data
  } catch (err) {}
}

onMounted(() => fetchEvaluations())

const editEvaluation = (item) => {
  form.value = { ...item, weight_profit: 4, weight_cost: 4, weight_space: 3, weight_capacity: 5 }
  editingId.value = item.id
}

const deleteEvaluation = async (id) => {
  if (!confirm('Are you sure you want to delete this record?')) return
  try {
    const { error } = await supabase.from('evaluations').delete().eq('id', id)
    if (error) throw error
    fetchEvaluations()
  } catch (err) {}
}

const viewDetails = (item) => {
  selectedRecord.value = item
  showDetailModal.value = true
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

// Print / Export Function
const exportReport = () => {
  window.print()
}
</script>

<template>
  <div class="app-container">
    <header class="header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <h1>Seaweed Snack Production: DSS Configuration</h1>
        <p>Constraint Screening & True Euclidean TOPSIS Ranking</p>
      </div>
      <button class="btn btn-secondary" @click="exportReport" style="background: #ffffff; color: #1e293b; border: 1px solid #cbd5e1;">
        🖨️ Export / Print Report
      </button>
    </header>

    <!-- Factory Alternatives Baseline Specifications Card -->
    <div class="card" style="margin-bottom: 24px;">
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
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px; font-weight: 500; color: #1e293b;">Labor-Oriented Configuration</td>
              <td style="padding: 12px; text-align: center; color: #475569;">6</td>
              <td style="padding: 12px; text-align: center; color: #475569;">90,000</td>
              <td style="padding: 12px; text-align: center; color: #475569;">30</td>
              <td style="padding: 12px; text-align: center; font-weight: bold; color: #4f46e5;">~5,000</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px; font-weight: 500; color: #1e293b;">Space-Efficient Layout Configuration</td>
              <td style="padding: 12px; text-align: center; color: #475569;">5</td>
              <td style="padding: 12px; text-align: center; color: #475569;">250,000</td>
              <td style="padding: 12px; text-align: center; color: #475569;">40</td>
              <td style="padding: 12px; text-align: center; font-weight: bold; color: #4f46e5;">~15,000</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px; font-weight: 500; color: #1e293b;">Machine-Oriented Configuration</td>
              <td style="padding: 12px; text-align: center; color: #475569;">4</td>
              <td style="padding: 12px; text-align: center; color: #475569;">450,000</td>
              <td style="padding: 12px; text-align: center; color: #475569;">80</td>
              <td style="padding: 12px; text-align: center; font-weight: bold; color: #4f46e5;">~30,000</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: 500; color: #1e293b;">Flexible Manufacturing Configuration</td>
              <td style="padding: 12px; text-align: center; color: #475569;">8</td>
              <td style="padding: 12px; text-align: center; color: #475569;">1,200,000</td>
              <td style="padding: 12px; text-align: center; color: #475569;">150</td>
              <td style="padding: 12px; text-align: center; font-weight: bold; color: #4f46e5;">~45,000</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Input Constraints & Preferences Card -->
    <div class="card form-card">
      <div class="card-header">
        <h2>{{ editingId ? 'Edit System Configuration' : 'Input Constraints & Preferences' }}</h2>
        <span v-if="editingId" class="badge badge-edit">Editing Mode</span>
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

        <!-- Stage 2: TOPSIS Preferences -->
        <div class="form-section">
          <h3>2. Business Preferences (1-5 Scale)</h3>
          
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
            <div class="range-labels"><span>Low (1)</span><span>High (5)</span></div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" @click="saveEvaluation">
          {{ editingId ? 'Update & Re-run Engine' : 'Run Decision Engine' }}
        </button>
        <button v-if="editingId" class="btn btn-secondary" @click="resetForm">
          Cancel Edit
        </button>
      </div>
    </div>

    <!-- Dynamic Comparative Evaluation & TOPSIS Ranking Results Card -->
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <h2 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
          <span>📊</span> Comparative Evaluation & TOPSIS Ranking Results
        </h2>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button @click="showMatrixModal = true" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px; background: #e0e7ff; color: #3730a3; border: none; border-radius: 20px; font-weight: 600; cursor: pointer;">
            🔍 View Matrix Calculation Breakdown
          </button>
          <span style="background-color: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #a7f3d0;">
            ✨ Real-time Multi-Criteria Ranking (Cᵢ)
          </span>
        </div>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 8px; margin-bottom: 20px;">
        Visual comparison of alternative configurations based on Closeness Coefficients (Cᵢ).
      </p>

      <!-- Dynamic Ranking Bars -->
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div v-for="(item, index) in (latestResult.rankings && latestResult.rankings.length > 0 ? latestResult.rankings : [
          { name: 'Flexible Manufacturing Configuration', score: 0.845 },
          { name: 'Machine-Oriented Configuration', score: 0.720 },
          { name: 'Space-Efficient Layout Configuration', score: 0.580 },
          { name: 'Labor-Oriented Configuration', score: 0.410 }
        ])" :key="item.name" style="background: #f8fafc; padding: 14px 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px;">
            <span style="font-weight: 600; color: #1e293b;">{{ index + 1 }}. {{ item.name }}</span>
            <span style="font-weight: 700; color: #4f46e5;">Cᵢ = {{ (item.score || 0).toFixed(3) }} (Rank #{{ index + 1 }})</span>
          </div>
          <div style="width: 100%; background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
            <div :style="{ width: ((item.score || 0) * 100) + '%', background: index === 0 ? '#4f46e5' : '#0ea5e9', height: '100%', borderRadius: '5px', transition: 'width 0.5s ease' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Evaluation Records Section -->
    <div class="card">
      <div class="card-header">
        <h2>Evaluation Records</h2>
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
    <div v-if="showResultModal" class="modal-overlay" @click.self="closeResultModal">
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

    <!-- 2. Detail Popup Modal (Triggered on View button) -->
    <div v-if="showDetailModal" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content">
        <h3>Evaluation Record Details</h3>
        <div v-if="selectedRecord" class="modal-body">
          <p><strong>Investment Budget:</strong> {{ selectedRecord.budget.toLocaleString() }} THB</p>
          <p><strong>Available Workforce:</strong> {{ selectedRecord.labor }} Workers</p>
          <p><strong>Available Space:</strong> {{ selectedRecord.space }} m²</p>
          <p><strong>Target Capacity:</strong> {{ selectedRecord.target_capacity.toLocaleString() }} Units</p>
          <p><strong>Recommended Configuration:</strong> <span style="color: #2563eb; font-weight: bold;">{{ selectedRecord.recommended_config }}</span></p>
          <p><strong>Timestamp:</strong> {{ new Date(selectedRecord.created_at).toLocaleString() }}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeDetailModal">Close</button>
        </div>
      </div>
    </div>

   <!-- 3. Transparent TOPSIS Matrix Breakdown Modal -->
    <div v-if="showMatrixModal" class="modal-overlay" @click.self="showMatrixModal = false">
      <div class="modal-content" style="max-width: 800px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0;">📐 TOPSIS Step-by-Step Mathematical Breakdown</h3>
          <button @click="showMatrixModal = false" style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
        </div>
        
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
          <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">
            Detailed inspection of intermediate mathematical matrices computed by the decision engine during the latest run.
          </p>

          <div v-if="latestResult.steps && latestResult.steps.weighted && latestResult.steps.weighted.length > 0">
            <h4 style="color: #1e293b; margin-bottom: 8px;">1. Weighted Normalized Decision Matrix (v_ij)</h4>
            <div style="overflow-x: auto; margin-bottom: 20px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; color: #475569;">
                    <th style="padding: 8px;">Alternative</th>
                    <th style="padding: 8px; text-align: center;">C1 (Profit/Benefit)</th>
                    <th style="padding: 8px; text-align: center;">C2 (Cost/Cost)</th>
                    <th style="padding: 8px; text-align: center;">C3 (Space/Cost)</th>
                    <th style="padding: 8px; text-align: center;">C4 (Capacity/Benefit)</th>
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

            <h4 style="color: #1e293b; margin-bottom: 8px;">2. Ideal Best (A+) and Ideal Worst (A-) Solutions</h4>
            <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; font-size: 13px;">
              <p><strong>A+ (Ideal Best):</strong> [ {{ latestResult.steps.vPlus.map(v => v.toFixed(4)).join(', ') }} ]</p>
              <p style="margin-top: 6px;"><strong>A- (Ideal Worst):</strong> [ {{ latestResult.steps.vMinus.map(v => v.toFixed(4)).join(', ') }} ]</p>
            </div>

            <h4 style="color: #1e293b; margin-bottom: 8px;">3. Euclidean Separation Measures & Closeness Coefficients (Ci)</h4>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; color: #475569;">
                    <th style="padding: 8px;">Alternative</th>
                    <th style="padding: 8px; text-align: center;">Si+ (Distance to Best)</th>
                    <th style="padding: 8px; text-align: center;">Si- (Distance to Worst)</th>
                    <th style="padding: 8px; text-align: center;">Ci Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in latestResult.steps.distances" :key="d.name" style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: 500;">{{ d.name }}</td>
                    <td style="padding: 8px; text-align: center;">{{ d.sPlus.toFixed(4) }}</td>
                    <td style="padding: 8px; text-align: center;">{{ d.sMinus.toFixed(4) }}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #4f46e5;">{{ d.score.toFixed(4) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else style="text-align: center; color: #64748b; padding: 20px;">
            Please run the decision engine first to generate matrix computation steps.
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 16px;">
          <button class="btn btn-secondary" @click="showMatrixModal = false" style="width: 100%;">Close Matrix Breakdown</button>
        </div>
      </div>
    </div>
  </div>
</template>
