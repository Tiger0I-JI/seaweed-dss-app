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
  reason: ''
})

const showDetailModal = ref(false)
const selectedRecord = ref(null)

// Constraint Screening & TOPSIS Decision Engine
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
      reason: 'Your available budget, workforce, or space is below the minimum engineering requirements of all 4 alternative configurations.'
    }
  }

  if (feasible.length === 1) {
    return {
      text: `${feasible[0].name} (Only 1 feasible option)`,
      score: 'N/A',
      reason: 'Only this configuration satisfies your strict resource constraints; therefore, no further multi-criteria ranking was required.'
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

  const weightedMatrix = feasible.map(alt => alt.criteria.map((val, j) => (val / divisors[j]) * W[j]))

  const isMaxBenefit = [true, false, false, true]
  const V_plus = Array(numCriteria).fill(0)
  const V_minus = Array(numCriteria).fill(0)

  for (let j = 0; j < numCriteria; j++) {
    const columnValues = weightedMatrix.map(row => row[j])
    if (isMaxBenefit[j]) {
      V_plus[j] = Math.max(...columnValues)
      V_minus[j] = Math.min(...columnValues)
    } else {
      V_plus[j] = Math.min(...columnValues)
      V_minus[j] = Math.max(...columnValues)
    }
  }

  let bestC = -1
  let bestAlternative = ''

  feasible.forEach((alt, i) => {
    let sPlusSq = 0
    let sMinusSq = 0
    for (let j = 0; j < numCriteria; j++) {
      sPlusSq += Math.pow(weightedMatrix[i][j] - V_plus[j], 2)
      sMinusSq += Math.pow(weightedMatrix[i][j] - V_minus[j], 2)
    }
    const S_plus = Math.sqrt(sPlusSq)
    const S_minus = Math.sqrt(sMinusSq)
    
    const C_i = S_minus / (S_plus + S_minus)

    if (C_i > bestC) {
      bestC = C_i
      bestAlternative = alt.name
    }
  })

  return {
    text: `${bestAlternative} (TOPSIS Score: ${bestC.toFixed(4)})`,
    score: bestC.toFixed(4),
    reason: `Passed constraint screening among ${feasible.length} feasible alternatives. It achieved the highest closeness coefficient based on your defined criteria preferences (Profit: ${form.value.weight_profit}, Cost: ${form.value.weight_cost}, Space: ${form.value.weight_space}, Capacity: ${form.value.weight_capacity}).`
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
      reason: resultObj.reason
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
</script>

<template>
  <div class="app-container">
    <header class="header">
      <h1>Seaweed Snack Production: DSS Configuration</h1>
      <p>Constraint Screening & True Euclidean TOPSIS Ranking</p>
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

    <!-- Results Section -->
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
  </div>
</template>
