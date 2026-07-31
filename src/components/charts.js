// Componente de Gráficos (Chart.js)

import { donutChartInstance, barChartInstance } from '../config/state.js';

/**
 * Renderiza gráficos da dashboard
 */
export function renderizarGraficos() {
  const { kpisMensais, STATUS } = arguments.length > 0 
    ? arguments[0] 
    : { kpisMensais: [], STATUS: {} };
  
  // Destroi instâncias anteriores
  if (donutChartInstance) {
    donutChartInstance.destroy();
  }
  if (barChartInstance) {
    barChartInstance.destroy();
  }
  
  // Gráfico Donut - Status dos Orçamentos
  const donutCtx = document.getElementById('donutChart');
  if (donutCtx) {
    const statusCount = {};
    kpisMensais.forEach(o => {
      const status = o.status || 'Contato Inicial';
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    
    const labels = Object.keys(statusCount);
    const data = Object.values(statusCount);
    
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#e5e7eb' : '#374151';
    
    donutChartInstance = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor }
          }
        }
      }
    });
  }
  
  // Gráfico de Barras - Vendedores
  const barCtx = document.getElementById('barChart');
  if (barCtx) {
    const { todosVendedores } = await import('../config/state.js');
    
    const vendedorData = {};
    kpisMensais.forEach(o => {
      const vendedorId = o.id_usuario;
      if (!vendedorData[vendedorId]) {
        vendedorData[vendedorId] = { nome: '', total: 0, fechados: 0 };
      }
      vendedorData[vendedorId].total += o.valor_orcado || 0;
      if (o.status === STATUS.FECHADO || o.status === 'Fechado') {
        vendedorData[vendedorId].fechados += 1;
      }
    });
    
    const labels = todosVendedores.map(v => {
      const data = vendedorData[v.id_usuario];
      return data ? data.nome || v.nome : v.nome;
    });
    
    const data = todosVendedores.map(v => {
      const data = vendedorData[v.id_usuario];
      return data ? data.total : 0;
    });
    
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const gridColor = isDark ? '#374151' : '#e5e7eb';
    
    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Valor Total',
          data: data,
          backgroundColor: '#6366f1',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { 
              color: textColor,
              callback: (value) => 'R$ ' + (value / 1000).toFixed(0) + 'k'
            },
            grid: { color: gridColor }
          },
          x: {
            ticks: { color: textColor },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

/**
 * Tenta renderizar gráficos se os elementos existirem
 */
export async function tentarRenderizarGraficos() {
  const donutCtx = document.getElementById('donutChart');
  const barCtx = document.getElementById('barChart');
  
  if (donutCtx || barCtx) {
    const { kpisMensais } = await import('../config/state.js');
    const { STATUS } = await import('../config/constants.js');
    
    renderizarGraficos({ kpisMensais, STATUS });
  }
}
