<template>
  <div class="card no-print" style="margin-bottom: 24px;">
    
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <h2 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
        <span>📈</span> Sensitivity Analysis Module
      </h2>
      <span style="background-color: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid #bae6fd;">
        Interactive Simulation
      </span>
    </div>
    
    <p style="color: #64748b; font-size: 14px; margin-top: 8px; margin-bottom: 20px;">
      Adjust risk parameters to evaluate the robustness and operational stability of each production alternative.
      <br/>
      <span style="display: inline-block; margin-top: 10px; background-color: #f8fafc; color: #475569; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6;">
        💡 <strong>Baseline Assumption:</strong> Initial Market Demand is set to <strong>5,000 Units/Month</strong> (matching A1 capacity threshold).
      </span>
    </p>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 24px; padding: 16px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
      
      <!-- Slider 1: Market Demand Fluctuation with Alternative Capacity Limits -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px; font-weight: 600; color: #1e293b;">Market Demand Fluctuation</label>
          <span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            {{ demandFactor > 0 ? '+' : '' }}{{ demandFactor }}% 
            <span style="font-weight: 500; opacity: 0.8;">({{ (5000 * (1 + demandFactor / 100)).toLocaleString() }} Units)</span>
          </span>
        </div>
        <input type="range" min="-50" max="1000" step="10" v-model.number="demandFactor" style="width: 100%; cursor: pointer;" />
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; font-weight: 600; flex-wrap: wrap; gap: 2px;">
          <span>-50%</span>
          <span style="color: #0284c7;">5k (A1)</span>
          <span style="color: #0284c7;">15k (A3)</span>
          <span style="color: #0284c7;">30k (A2)</span>
          <span style="color: #0284c7;">45k (A4)</span>
          <span>+1000%</span>
        </div>
      </div>

      <!-- Slider 2: Labor Cost Variation with Defined Limits -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px; font-weight: 600; color: #1e293b;">Labor Cost Variation</label>
          <span style="background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 700;">
            +{{ laborCostFactor }}%
          </span>
        </div>
        <input type="range" min="0" max="100" step="5" v-model.number="laborCostFactor" style="width: 100%; cursor: pointer;" />
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-weight: 500;">
          <span>0% (Standard)</span>
          <span style="color: #d97706; font-weight: 600;">Limit 10% (Risk)</span>
          <span style="color: #dc2626; font-weight: 600;">Limit 20% (Critical)</span>
        </div>
      </div>
    </div>

    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
            <th style="padding: 12px; font-weight: 600; border-top-left-radius: 8px;">Configuration Name</th>
            <th style="padding: 12px; font-weight: 600; text-align: center;">Base Cost (THB)</th>
            <th style="padding: 12px; font-weight: 600; text-align: center; color: #1d4ed8;">Adjusted Total Cost</th>
            <th style="padding: 12px; font-weight: 600; border-top-right-radius: 8px; text-align: center;">Operational Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alt in evaluatedAlternatives" :key="alt.name" style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px; font-weight: 500; color: #1e293b;">{{ alt.name }}</td>
            <td style="padding: 12px; color: #64748b; text-align: center;">{{ alt.baseCost.toLocaleString() }}</td>
            <td style="padding: 12px; font-weight: 700; color: #0f172a; text-align: center;">
              {{ alt.adjustedCost.toLocaleString() }} THB
              <span v-if="alt.costIncreasePercent > 0" style="color: #dc2626; font-size: 11px; margin-left: 6px;">
                (+{{ alt.costIncreasePercent }}%)
              </span>
            </td>
            <td style="padding: 12px; text-align: center;">
              <span :style="{ backgroundColor: alt.statusBg, color: alt.statusColor, padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: '1px solid ' + alt.statusBorder }">
                {{ alt.statusText }}
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

const demandFactor = ref(0)       
const laborCostFactor = ref(0)    

const baseAlternatives = [
  { name: 'Labor-Oriented Configuration (A1)', baseCost: 90000, workforce: 6, capacity: 5000 },
  { name: 'Machine-Oriented Configuration (A2)', baseCost: 450000, workforce: 4, capacity: 30000 },
  { name: 'Space-Efficient Layout Configuration (A3)', baseCost: 250000, workforce: 5, capacity: 15000 },
  { name: 'Flexible Manufacturing Configuration (A4)', baseCost: 1200000, workforce: 8, capacity: 45000 }
]

const evaluatedAlternatives = computed(() => {
  const baseDemand = 5000 
  const currentDemand = baseDemand * (1 + demandFactor.value / 100)

  return baseAlternatives.map(alt => {
    const laborWeight = alt.workforce * 5000 
    const extraLaborCost = laborWeight * (laborCostFactor.value / 100)
    const adjustedCost = Math.round(alt.baseCost + extraLaborCost)
    const costIncreasePercent = (extraLaborCost / alt.baseCost) * 100

    let statusText = '✅ Stable'
    let statusBg = '#dcfce7'
    let statusColor = '#166534'
    let statusBorder = '#bbf7d0'

    if (alt.capacity < currentDemand) {
      statusText = '🛑 Bottleneck'
      statusBg = '#fee2e2'
      statusColor = '#991b1b'
      statusBorder = '#fecaca'
    } else if (costIncreasePercent >= 20) {
      statusText = '🚨 Critical Cost Overrun'
      statusBg = '#fee2e2'
      statusColor = '#b91c1c'
      statusBorder = '#fecaca'
    } else if (costIncreasePercent >= 10) {
      statusText = '⚠️ High Cost Risk'
      statusBg = '#ffedd5'
      statusColor = '#9a3412'
      statusBorder = '#fed7aa'
    }

    return {
      ...alt,
      adjustedCost,
      costIncreasePercent: costIncreasePercent.toFixed(1),
      statusText,
      statusBg,
      statusColor,
      statusBorder
    }
  })
})
</script>
