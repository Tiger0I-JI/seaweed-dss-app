<template>
  <!-- Main Card Container (Matches existing project styling) -->
  <div class="card no-print" style="margin-bottom: 24px;">
    
    <!-- Card Header -->
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <h2 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
        <span>📈</span> Sensitivity Analysis Module
      </h2>
      <span style="background-color: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #bae6fd;">
        Interactive Simulation
      </span>
    </div>
    
    <!-- Module Description -->
    <p style="color: #64748b; font-size: 14px; margin-top: 8px; margin-bottom: 20px;">
      Adjust risk parameters to evaluate the robustness and operational stability of each production alternative.
    </p>

    <!-- Sliders for Risk Parameters -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 24px; padding: 16px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
      
      <!-- Slider 1: Demand Fluctuation -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px; font-weight: 600; color: #1e293b;">Market Demand Fluctuation</label>
          <span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            {{ demandFactor > 0 ? '+' : '' }}{{ demandFactor }}%
          </span>
        </div>
        <input type="range" min="-50" max="100" step="5" v-model.number="demandFactor" style="width: 100%; cursor: pointer;" />
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-weight: 500;">
          <span>-50% (Slowdown)</span>
          <span>Base (0%)</span>
          <span>+100% (Surge)</span>
        </div>
      </div>

      <!-- Slider 2: Labor Cost Variation -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px; font-weight: 600; color: #1e293b;">Labor Cost Variation</label>
          <span style="background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            +{{ laborCostFactor }}%
          </span>
        </div>
        <input type="range" min="0" max="50" step="5" v-model.number="laborCostFactor" style="width: 100%; cursor: pointer;" />
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-weight: 500;">
          <span>0% (Standard)</span>
          <span>+25%</span>
          <span>+50% (High Increase)</span>
        </div>
      </div>
    </div>

    <!-- Results Table -->
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
            <th style="padding: 12px; font-weight: 600; border-top-left-radius: 8px;">Configuration Name</th>
            <th style="padding: 12px; font-weight: 600; text-align: center;">Base Cost (THB)</th>
            <th style="padding: 12px; font-weight: 600; text-align: center; color: #1d4ed8;">Adjusted Total Cost</th>
            <th style="padding: 12px; font-weight: 600; border-top-right-radius: 8px; text-align: center;">Feasibility Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alt in evaluatedAlternatives" :key="alt.name" style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px; font-weight: 500; color: #1e293b;">{{ alt.name }}</td>
            <td style="padding: 12px; color: #64748b; text-align: center;">{{ alt.baseCost.toLocaleString() }}</td>
            <td style="padding: 12px; font-weight: 700; color: #0f172a; text-align: center;">
              {{ alt.adjustedCost.toLocaleString() }} THB
            </td>
            <td style="padding: 12px; text-align: center;">
              <!-- Feasibility Status Badges -->
              <span v-if="alt.isFeasible" style="background-color: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; border: 1px solid #bbf7d0;">
                ✅ Feasible
              </span>
              <span v-else style="background-color: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; border: 1px solid #fecaca;">
                ⚠️ Over Capacity
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// Reactive state variables for sensitivity parameters
const demandFactor = ref(0)       // Percentage change ranging from -50% to +100%
const laborCostFactor = ref(0)    // Percentage increase in labor costs from 0% to +50%

// Base configuration alternatives (matching project specifications)
const baseAlternatives = [
  { name: 'Labor-Oriented Configuration (A1)', baseCost: 90000, workforce: 6, capacity: 5000 },
  { name: 'Machine-Oriented Configuration (A2)', baseCost: 450000, workforce: 4, capacity: 30000 },
  { name: 'Space-Efficient Layout Configuration (A3)', baseCost: 250000, workforce: 5, capacity: 15000 },
  { name: 'Flexible Manufacturing Configuration (A4)', baseCost: 1200000, workforce: 8, capacity: 45000 }
]

// Computed property for real-time recalculation when sliders change
const evaluatedAlternatives = computed(() => {
  // Base demand starts at 5000 to match the A1 capacity threshold
  const baseDemand = 5000 
  
  const currentDemand = baseDemand * (1 + demandFactor.value / 100)

  return baseAlternatives.map(alt => {
    // Labor-heavy configurations are more sensitive to labor cost increases
    const laborWeight = alt.workforce * 5000 
    const extraLaborCost = laborWeight * (laborCostFactor.value / 100)
    const adjustedCost = Math.round(alt.baseCost + extraLaborCost)

    // Check if configuration capacity satisfies current demand
    const isFeasible = alt.capacity >= currentDemand

    return {
      ...alt,
      adjustedCost,
      isFeasible
    }
  })
})
</script>
