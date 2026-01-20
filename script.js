// ========================================
// STATE MANAGEMENT
// ========================================
let tasks = [];
let editingTaskId = null;
let currentFilter = 'all';
let searchQuery = '';
let fileHandle = null; // For File System Access API

// ========================================
// SYNCHRONIZATION - Broadcast Channel API
// ========================================
// Create a broadcast channel for cross-tab synchronization
const syncChannel = new BroadcastChannel('taskflow_sync');

// Listen for sync messages from other tabs
syncChannel.onmessage = (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'TASKS_UPDATED':
            // Update tasks from another tab
            tasks = data.tasks;
            renderTasks();
            updateStats();
            console.log('📡 Tasks synced from another tab');
            break;
        case 'TASK_ADDED':
            tasks.push(data.task);
            saveTasks();
            renderTasks();
            updateStats();
            showToast('✨ New task synced from another tab', 'success');
            break;
        case 'TASK_UPDATED':
            const updateIndex = tasks.findIndex(t => t.id === data.task.id);
            if (updateIndex !== -1) {
                tasks[updateIndex] = data.task;
                saveTasks();
                renderTasks();
                updateStats();
            }
            break;
        case 'TASK_DELETED':
            tasks = tasks.filter(t => t.id !== data.taskId);
            saveTasks();
            renderTasks();
            updateStats();
            break;
        case 'TASK_TOGGLED':
            const toggleIndex = tasks.findIndex(t => t.id === data.taskId);
            if (toggleIndex !== -1) {
                tasks[toggleIndex].completed = data.completed;
                saveTasks();
                renderTasks();
                updateStats();
            }
            break;
    }
};

// Broadcast task changes to other tabs
function broadcastSync(type, data) {
    syncChannel.postMessage({ type, data });
}

// ========================================
// DOM ELEMENTS
// ========================================
const taskForm = document.getElementById('taskForm');
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskTime = document.getElementById('taskTime');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const cancelBtn = document.getElementById('cancelBtn');
const tasksList = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');
const totalTasksEl = document.getElementById('totalTasks');
const completedTasksEl = document.getElementById('completedTasks');
const pendingTasksEl = document.getElementById('pendingTasks');
const filterButtons = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('searchInput');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    loadTasks();
    renderTasks();
    updateStats();
    setupEventListeners();
    displaySyncInfo();
});

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Form submission
    taskForm.addEventListener('submit', handleFormSubmit);

    // Cancel button
    cancelBtn.addEventListener('click', resetForm);

    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderTasks();
    });
}

function handleFormSubmit(e) {
    e.preventDefault();

    const title = taskTitle.value.trim();
    const description = taskDescription.value.trim();
    const time = taskTime.value;

    if (!title || !description) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    if (editingTaskId !== null) {
        updateTask(editingTaskId, title, description, time);
    } else {
        addTask(title, description, time);
    }

    resetForm();
}

// ========================================
// TASK OPERATIONS
// ========================================
function addTask(title, description, time) {
    const task = {
        id: Date.now(),
        title,
        description,
        time,
        completed: false,
        createdAt: new Date().toISOString()
    };

    tasks.push(task);
    saveTasks();
    renderTasks();
    updateStats();
    showToast('Task added successfully! ✓', 'success');

    // Broadcast to other tabs
    broadcastSync('TASK_ADDED', { task });
}

function updateTask(id, title, description, time) {
    const taskIndex = tasks.findIndex(task => task.id === id);

    if (taskIndex !== -1) {
        tasks[taskIndex] = {
            ...tasks[taskIndex],
            title,
            description,
            time,
            updatedAt: new Date().toISOString()
        };

        saveTasks();
        renderTasks();
        updateStats();
        showToast('Task updated successfully! ✓', 'success');

        // Broadcast to other tabs
        broadcastSync('TASK_UPDATED', { task: tasks[taskIndex] });
    }
}

function deleteTask(id) {
    const taskCard = document.querySelector(`[data-task-id="${id}"]`);

    if (taskCard) {
        taskCard.classList.add('deleting');

        setTimeout(() => {
            tasks = tasks.filter(task => task.id !== id);
            saveTasks();
            renderTasks();
            updateStats();
            showToast('Task deleted successfully! 🗑️', 'success');

            // Broadcast to other tabs
            broadcastSync('TASK_DELETED', { taskId: id });
        }, 300);
    }
}

function toggleTaskCompletion(id) {
    const taskIndex = tasks.findIndex(task => task.id === id);

    if (taskIndex !== -1) {
        tasks[taskIndex].completed = !tasks[taskIndex].completed;
        saveTasks();
        renderTasks();
        updateStats();

        const status = tasks[taskIndex].completed ? 'completed' : 'pending';
        showToast(`Task marked as ${status}! ${tasks[taskIndex].completed ? '✓' : '↺'}`, 'success');

        // Broadcast to other tabs
        broadcastSync('TASK_TOGGLED', { taskId: id, completed: tasks[taskIndex].completed });
    }
}

function editTask(id) {
    const task = tasks.find(task => task.id === id);

    if (task) {
        editingTaskId = id;
        taskTitle.value = task.title;
        taskDescription.value = task.description;
        taskTime.value = task.time || '';

        btnText.textContent = 'Update Task';
        submitBtn.querySelector('.btn-icon').textContent = '✓';
        cancelBtn.style.display = 'flex';

        // Scroll to form
        document.querySelector('.add-task-section').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        taskTitle.focus();
    }
}

// ========================================
// RENDER FUNCTIONS
// ========================================
function renderTasks() {
    const filteredTasks = getFilteredTasks();

    if (filteredTasks.length === 0) {
        tasksList.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    tasksList.innerHTML = filteredTasks.map(task => createTaskCard(task)).join('');

    // Attach event listeners to task cards
    filteredTasks.forEach(task => {
        const taskCard = document.querySelector(`[data-task-id="${task.id}"]`);

        if (taskCard) {
            const checkbox = taskCard.querySelector('.task-checkbox');
            const editBtn = taskCard.querySelector('.edit-btn');
            const deleteBtn = taskCard.querySelector('.delete-btn');

            checkbox.addEventListener('click', () => toggleTaskCompletion(task.id));
            editBtn.addEventListener('click', () => editTask(task.id));
            deleteBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this task?')) {
                    deleteTask(task.id);
                }
            });
        }
    });
}

function createTaskCard(task) {
    const timeFormatted = task.time ? formatDateTime(task.time) : null;

    return `
        <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
            <div class="task-header">
                <div class="task-main">
                    <div class="task-checkbox ${task.completed ? 'checked' : ''}"></div>
                    <div class="task-content">
                        <h3 class="task-title">${escapeHtml(task.title)}</h3>
                        <p class="task-description">${escapeHtml(task.description)}</p>
                        ${timeFormatted ? `
                            <div class="task-time">
                                <span class="task-time-icon">⏰</span>
                                <span>${timeFormatted}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="action-btn edit-btn" title="Edit task">✏️</button>
                    <button class="action-btn delete-btn" title="Delete task">🗑️</button>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// FILTER & SEARCH
// ========================================
function getFilteredTasks() {
    let filtered = [...tasks];

    // Apply status filter
    if (currentFilter === 'completed') {
        filtered = filtered.filter(task => task.completed);
    } else if (currentFilter === 'pending') {
        filtered = filtered.filter(task => !task.completed);
    }

    // Apply search filter
    if (searchQuery) {
        filtered = filtered.filter(task =>
            task.title.toLowerCase().includes(searchQuery) ||
            task.description.toLowerCase().includes(searchQuery)
        );
    }

    // Sort by creation date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return filtered;
}

// ========================================
// STATISTICS
// ========================================
function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const pending = total - completed;

    animateCounter(totalTasksEl, total);
    animateCounter(completedTasksEl, completed);
    animateCounter(pendingTasksEl, pending);
}

function animateCounter(element, targetValue) {
    const currentValue = parseInt(element.textContent) || 0;
    const increment = targetValue > currentValue ? 1 : -1;
    const duration = 300;
    const steps = Math.abs(targetValue - currentValue);

    if (steps === 0) return;

    const stepDuration = duration / steps;
    let current = currentValue;

    const timer = setInterval(() => {
        current += increment;
        element.textContent = current;

        if (current === targetValue) {
            clearInterval(timer);
        }
    }, stepDuration);
}

// ========================================
// LOCAL STORAGE / JSON PERSISTENCE
// ========================================
function saveTasks() {
    try {
        const tasksJSON = JSON.stringify(tasks, null, 2);
        localStorage.setItem('taskflow_tasks', tasksJSON);
        console.log('💾 Tasks saved to localStorage');
    } catch (error) {
        console.error('Error saving tasks:', error);
        showToast('Error saving tasks', 'error');
    }
}

function loadTasks() {
    try {
        const tasksJSON = localStorage.getItem('taskflow_tasks');

        if (tasksJSON) {
            tasks = JSON.parse(tasksJSON);
            console.log('📂 Tasks loaded from localStorage:', tasks.length, 'tasks');
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        showToast('Error loading tasks', 'error');
        tasks = [];
    }
}

// ========================================
// FILE SYSTEM ACCESS API - JSON FILE SYNC
// ========================================

// Save tasks to a local JSON file
async function saveTasksToFile() {
    try {
        // Check if File System Access API is supported
        if (!('showSaveFilePicker' in window)) {
            showToast('File System Access API not supported in this browser', 'error');
            return;
        }

        const options = {
            types: [
                {
                    description: 'JSON Files',
                    accept: {
                        'application/json': ['.json'],
                    },
                },
            ],
            suggestedName: `taskflow-backup-${new Date().toISOString().split('T')[0]}.json`,
        };

        fileHandle = await window.showSaveFilePicker(options);
        const writable = await fileHandle.createWritable();
        const tasksJSON = JSON.stringify(tasks, null, 2);
        await writable.write(tasksJSON);
        await writable.close();

        showToast('Tasks saved to file successfully! 💾', 'success');
        console.log('📁 Tasks saved to file:', fileHandle.name);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error saving file:', error);
            showToast('Error saving file', 'error');
        }
    }
}

// Load tasks from a local JSON file
async function loadTasksFromFile() {
    try {
        // Check if File System Access API is supported
        if (!('showOpenFilePicker' in window)) {
            showToast('File System Access API not supported in this browser', 'error');
            return;
        }

        const options = {
            types: [
                {
                    description: 'JSON Files',
                    accept: {
                        'application/json': ['.json'],
                    },
                },
            ],
            multiple: false,
        };

        const [handle] = await window.showOpenFilePicker(options);
        const file = await handle.getFile();
        const contents = await file.text();
        const importedTasks = JSON.parse(contents);

        if (Array.isArray(importedTasks)) {
            tasks = importedTasks;
            saveTasks();
            renderTasks();
            updateStats();
            broadcastSync('TASKS_UPDATED', { tasks });
            showToast('Tasks loaded from file successfully! 📂', 'success');
            console.log('📁 Tasks loaded from file:', file.name, '-', tasks.length, 'tasks');
        } else {
            throw new Error('Invalid JSON format');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error loading file:', error);
            showToast('Error loading file. Invalid format.', 'error');
        }
    }
}

// Legacy fallback: Export tasks to a downloadable JSON file
function exportTasksToFile() {
    const dataStr = JSON.stringify(tasks, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taskflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Tasks exported successfully! 📥', 'success');
}

// Legacy fallback: Import tasks from a JSON file
function importTasksFromFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const importedTasks = JSON.parse(e.target.result);

            if (Array.isArray(importedTasks)) {
                tasks = importedTasks;
                saveTasks();
                renderTasks();
                updateStats();
                broadcastSync('TASKS_UPDATED', { tasks });
                showToast('Tasks imported successfully! 📤', 'success');
            } else {
                throw new Error('Invalid JSON format');
            }
        } catch (error) {
            console.error('Error importing tasks:', error);
            showToast('Error importing tasks. Invalid file format.', 'error');
        }
    };

    reader.readAsText(file);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function resetForm() {
    taskForm.reset();
    editingTaskId = null;
    btnText.textContent = 'Add Task';
    submitBtn.querySelector('.btn-icon').textContent = '+';
    cancelBtn.style.display = 'none';
}

function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const options = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displaySyncInfo() {
    console.log('🚀 TaskFlow Initialized!');
    console.log('📡 Cross-tab synchronization: ACTIVE');
    console.log('💾 Data storage: localStorage (JSON format)');
    console.log('📁 File sync: Available via save/load functions');
    console.log('');
    console.log('💡 Synchronization Features:');
    console.log('   • Tasks sync automatically across all browser tabs');
    console.log('   • Use window.saveToFile() to save to a JSON file');
    console.log('   • Use window.loadFromFile() to load from a JSON file');
    console.log('   • Legacy export/import still available');
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
    }

    // Escape to reset form
    if (e.key === 'Escape' && editingTaskId !== null) {
        resetForm();
    }

    // Ctrl/Cmd + S to save to file
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveTasksToFile();
    }

    // Ctrl/Cmd + O to open/load from file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        loadTasksFromFile();
    }
});

// ========================================
// EXPORT FUNCTIONS (Global API)
// ========================================
window.saveToFile = saveTasksToFile;
window.loadFromFile = loadTasksFromFile;
window.exportTasks = exportTasksToFile;
window.importTasks = (event) => {
    const file = event.target.files[0];
    if (file) {
        importTasksFromFile(file);
    }
};
