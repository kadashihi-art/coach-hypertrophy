// Coach Hypertrophy - Lógica do App

// Exercícios de hipertrofia
const exercises = [
    {
        id: 1,
        name: 'Supino Reto',
        muscle: 'Peito',
        sets: 4,
        reps: '8-12',
        weight: '60-80 kg',
        rest: '90 segundos'
    },
    {
        id: 2,
        name: 'Agachamento Livre',
        muscle: 'Pernas',
        sets: 4,
        reps: '8-10',
        weight: '80-100 kg',
        rest: '120 segundos'
    },
    {
        id: 3,
        name: 'Levantamento Terra',
        muscle: 'Costas',
        sets: 3,
        reps: '6-8',
        weight: '100-120 kg',
        rest: '180 segundos'
    },
    {
        id: 4,
        name: 'Remada Curvada',
        muscle: 'Costas',
        sets: 4,
        reps: '10-12',
        weight: '60-80 kg',
        rest: '90 segundos'
    },
    {
        id: 5,
        name: 'Elevação Lateral',
        muscle: 'Ombros',
        sets: 4,
        reps: '12-15',
        weight: '15-20 kg',
        rest: '60 segundos'
    },
    {
        id: 6,
        name: 'Crunch Abdominal',
        muscle: 'Abdômen',
        sets: 4,
        reps: '15-20',
        weight: 'Corpo',
        rest: '45 segundos'
    }
];

// Dicas de nutrição e descanso
const tips = [
    "💧 Beba pelo menos 3 litros de água por dia",
    "🍗 Consuma proteína em cada refeição",
    "😴 Durma pelo menos 7-8 horas por noite",
    "🥑 Inclua gorduras saudáveis na dieta",
    "🥦 Não esqueça das fibras e vegetais",
    "🏃‍♂️ Faça dias de descanso ativo (caminhada leve)"
];

// Estado do app
let currentExercise = null;
let workoutLog = [];

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    renderExercises();
    renderTips();
    setupEventListeners();
});

// Renderizar lista de exercícios
function renderExercises() {
    const container = document.getElementById('exercises-list');
    container.innerHTML = exercises.map(exercise => `
        <div class="exercise-item" data-id="${exercise.id}">
            <h3>${exercise.name}</h3>
            <p><strong>Músculo:</strong> ${exercise.muscle}</p>
            <p><strong>Séries:</strong> ${exercise.sets}</p>
            <p><strong>Repetições:</strong> ${exercise.reps}</p>
            <p><strong>Peso:</strong> ${exercise.weight}</p>
            <p><strong>Descanso:</strong> ${exercise.rest}</p>
            <button class="action-btn" onclick="selectExercise(${exercise.id})">🎯 Selecionar</button>
        </div>
    `).join('');
}

// Renderizar dicas
function renderTips() {
    const container = document.getElementById('tips-list');
    container.innerHTML = tips.map(tip => `<li>${tip}</li>`).join('');
}

// Selecionar exercício
function selectExercise(id) {
    const exercise = exercises.find(ex => ex.id === id);
    currentExercise = exercise;
    
    // Adicionar ao log do treino
    workoutLog.push({
        exercise: exercise.name,
        muscle: exercise.muscle,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight,
        rest: exercise.rest,
        timestamp: new Date().toLocaleTimeString()
    });
    
    renderWorkout();
    renderStats();
}

// Renderizar display do treino
function renderWorkout() {
    const container = document.getElementById('workout-display');
    
    if (workoutLog.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">📝 Comece selecionando um exercício da lista!</p>';
        return;
    }
    
    container.innerHTML = workoutLog.map((log, index) => `
        <div class="workout-item">
            <h3>${index + 1}. ${log.exercise}</h3>
            <p><strong>Músculo:</strong> ${log.muscle}</p>
            <p><strong>Séries:</strong> ${log.sets} | <strong>Repetições:</strong> ${log.reps}</p>
            <p><strong>Peso:</strong> ${log.weight}</p>
            <p><strong>Descanso:</strong> ${log.rest}</p>
            <p style="font-size: 0.85em; color: #888; margin-top: 5px;">⏰ ${log.timestamp}</p>
        </div>
    `).join('');
}

// Renderizar estatísticas
function renderStats() {
    const container = document.getElementById('stats');
    const totalExercises = workoutLog.length;
    const totalSets = workoutLog.reduce((sum, log) => sum + parseInt(log.sets), 0);
    const musclesWorked = [...new Set(workoutLog.map(log => log.muscle))].length;
    
    container.innerHTML = `
        <div class="stat-card">
            <h3>${totalExercises}</h3>
            <p>Exercícios</p>
        </div>
        <div class="stat-card">
            <h3>${totalSets}</h3>
            <p>Séries Totais</p>
        </div>
        <div class="stat-card">
            <h3>${musclesWorked}</h3>
            <p>Músculos Trabalhados</p>
        </div>
    `;
}

// Configurar listeners de eventos
function setupEventListeners() {
    // Adicionar listener para abrir edição quando clicar no display do treino
    const workoutDisplay = document.getElementById('workout-display');
    if (workoutDisplay) {
        workoutDisplay.addEventListener('click', (e) => {
            // Se clicar no botão de editar, abrir modal
            if (e.target.closest('.edit-btn')) {
                openEditWorkout();
            }
        });
    }
}

// === FUNÇÕES DE EDIÇÃO DE TREINO ===

// Abrir modal de edição
function openEditWorkout() {
    if (workoutLog.length === 0) {
        alert('📝 Nenhum treino para editar! Comece selecionando exercícios.');
        return;
    }
    
    // Criar modal de edição
    const modal = document.createElement('div');
    modal.id = 'edit-workout-modal';
    modal.className = 'edit-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div class="edit-modal-content" style="
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        ">
            <h2 style="color: #b21f1f; margin-bottom: 20px;">🔧 Editar Treino</h2>
            
            <div class="edit-workout-list" style="display: flex; flex-direction: column; gap: 15px;">
                ${workoutLog.map((log, index) => `
                    <div class="edit-workout-item" style="
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 10px;
                        border-left: 4px solid #b21f1f;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <h3 style="color: #333; margin-bottom: 5px;">
                                    <span style="color: #666; font-size: 0.9em;">${index + 1}.</span> ${log.exercise}
                                </h3>
                                <p style="color: #666; font-size: 0.9em;">🏋️ ${log.muscle}</p>
                                <p style="color: #666; font-size: 0.9em;">
                                    <strong>Séries:</strong> ${log.sets} | 
                                    <strong>Repetições:</strong> ${log.reps} | 
                                    <strong>Peso:</strong> ${log.weight}
                                </p>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button class="edit-btn edit-btn-decrease" style="
                                    background: #ffebee;
                                    border: none;
                                    padding: 8px 12px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-size: 0.9em;
                                ">📉</button>
                                <button class="edit-btn edit-btn-delete" style="
                                    background: #fff3e0;
                                    border: none;
                                    padding: 8px 12px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-size: 0.9em;
                                ">🗑️</button>
                                <button class="edit-btn edit-btn-increase" style="
                                    background: #e8f5e9;
                                    border: none;
                                    padding: 8px 12px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-size: 0.9em;
                                ">📈</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                <button class="edit-btn edit-btn-cancel" onclick="closeEditWorkout()" style="
                    background: #e9ecef;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                ">Cancelar</button>
                <button class="edit-btn edit-btn-save" onclick="saveEditWorkout()" style="
                    background: linear-gradient(135deg, #4caf50, #45a049);
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                    color: white;
                ">Salvar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Fechar modal de edição
function closeEditWorkout() {
    const modal = document.getElementById('edit-workout-modal');
    if (modal) modal.remove();
}

// Salvar edições do treino
function saveEditWorkout() {
    renderWorkout();
    renderStats();
    closeEditWorkout();
    alert('✅ Treino atualizado com sucesso!');
}

// Adicionar novo exercício ao treino
function addWorkoutItem() {
    const newExercise = exercises[Math.floor(Math.random() * exercises.length)];
    workoutLog.push({
        exercise: newExercise.name,
        muscle: newExercise.muscle,
        sets: newExercise.sets,
        reps: newExercise.reps,
        weight: newExercise.weight,
        rest: newExercise.rest,
        timestamp: new Date().toLocaleTimeString()
    });
    renderWorkout();
    renderStats();
}

// Remover exercício do treino
function deleteWorkoutItem(index) {
    if (confirm('🗑️ Deseja remover este exercício do treino?')) {
        workoutLog.splice(index, 1);
        renderWorkout();
        renderStats();
    }
}

// Editar item específico do treino (futuro)
function editWorkoutItem(index, field, value) {
    workoutLog[index][field] = value;
    renderWorkout();
    renderStats();
}

// === FUNÇÕES ANTERIORES ===

// Resetar treino
function resetWorkout() {
    workoutLog = [];
    currentExercise = null;
    renderWorkout();
    renderStats();
}

// Expor funções para o HTML
window.selectExercise = selectExercise;
window.renderWorkout = renderWorkout;
window.resetWorkout = resetWorkout;
window.openEditWorkout = openEditWorkout;
window.closeEditWorkout = closeEditWorkout;
window.saveEditWorkout = saveEditWorkout;
window.editWorkoutItem = editWorkoutItem;
window.deleteWorkoutItem = deleteWorkoutItem;
window.addWorkoutItem = addWorkoutItem;
