<template>
  <div class="p-6 bg-white rounded-xl shadow-md border border-gray-100 mt-6">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-bold text-gray-800">
        📊 Sensitivity Analysis Module
      </h3>
      <span class="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">
        Interactive Simulation
      </span>
    </div>
    <p class="text-sm text-gray-600 mb-6">
      Adjust risk parameters to evaluate the robustness and operational stability of each production alternative.
    </p>

    <!-- Sliders for Sensitivity Parameters -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 p-4 bg-gray-50 rounded-lg">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Market Demand Fluctuation: 
          <span class="font-bold text-blue-600">{{ demandFactor }}%</span>
        </label>
        <input 
          type="range" 
          min="-50" 
          max="100" 
          step="5" 
          v-model.number="demandFactor"
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>-50% (Slowdown)</span>
          <span>Base (0%)</span>
          <span>+100% (Surge)</span>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Labor Cost Variation: 
          <span class="font-bold text-red-600">{{ laborCostFactor }}%</span>
        </label>
        <input 
          type="range" 
          min="0" 
          max="50" 
          step="5" 
          v-model.number="laborCostFactor"
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600"
        />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>0% (Standard)</span>
          <span>+25%</span>
          <span>+50% (High Increase)</span>
        </div>
      </div>
    </div>

    <!-- Dynamic Evaluation Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-gray-100 text-gray-700 text-xs uppercase tracking-wider">
            <th class="p-3 border-b">Configuration Name</th>
            <th class="p-3 border-b">Base Cost (THB)</th>
            <th class="p-3 border-b text-blue-600">Adjusted Total Cost</th>
            <th class="p-3 border-b">Feasibility Status</th>
          </tr>
        </thead>
        <tbody class="text-sm text-gray-700">
          <tr v-for="alt in evaluatedAlternatives" :key="alt.name" class="hover:bg-gray-50 transition-colors">
            <td class="p-3 border-b font-medium">{{ alt.name }}</td>
            <td class="p-3 border-b text-gray-500">{{ alt.baseCost.toLocaleString() }}</td>
            <td class="p-3 border-b font-bold text-gray-900">
              {{ alt.adjustedCost.toLocaleString() }} THB
            </td>
            <td class="p-3 border-b">
              <span 
                :class="alt.isFeasible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                class="px-2.5 py-1 rounded-full text-xs font-semibold"
              >
                {{ alt.isFeasible ? '✅ Feasible' : '⚠️ Over Capacity (Bottleneck)' }}
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
  const baseDemand = 10000 // Baseline market demand threshold
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
