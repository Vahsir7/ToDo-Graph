const ME_NODE_ID = 'me_node';
const CATEGORY_NODE_PREFIX = 'cat_';
const TASK_NODE_PREFIX = 'task_'; // Actually using task ID directly
let tasks = {}; // { id: { title: '', categoryId: '', completed: false, dependencies: [], dueDate: 'YYYY-MM-DD' | null } }
let categories = {}; // { id: 'Category Name' }
const generateId = () => `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const generateCatId = (name) => CATEGORY_NODE_PREFIX + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const formatDate = (dateString, options = { month: 'short', day: 'numeric' }) => {
    if (!dateString) return '';
    try {
        // Handle potential timezone issues by ensuring we parse as local date
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day); // Month is 0-indexed
        return date.toLocaleDateString(undefined, options);
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return dateString; // Fallback to original string
    }
};
const getISODate = (dateString) => { // Ensure date is in YYYY-MM-DD for input[type=date]
     if (!dateString) return '';
     try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return dateString;
        }
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
             console.warn("Could not parse date for ISO conversion:", dateString);
             return ''; // Return empty if parsing fails
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
     } catch { return ''; }
}
async function loadData() {
    try {
        const [taskRes, catRes] = await Promise.all([
            fetch("/api/tasks"),
            fetch("/api/categories")
        ]);
        const taskData = await taskRes.json();
        const catData = await catRes.json();

        tasks = {};
        for (const task of taskData) {
            const taskId = task.id.toString(); // 👈 convert to string!
            tasks[taskId] = {
                title: task.title,
                categoryId: task.categoryId.toString(), // in case category ID is numeric too
                completed: task.completed,
                dueDate: task.dueDate,
                dependencies: []
            };
        }
        

        categories = {};
        for (const cat of catData) {
            categories[cat.id] = cat.name;
        }

        window.dispatchEvent(new CustomEvent("dataUpdated"));
    } catch (err) {
        console.error("Failed to fetch backend data:", err);
        alert("Could not load data from backend.");
    }
}

function saveData() {
    try {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        localStorage.setItem('categories', JSON.stringify(categories));
        console.log("Data saved.");
        window.dispatchEvent(new CustomEvent('dataUpdated'));
    } catch (e) {
        console.error("Error saving data to localStorage:", e);
        alert("Could not save data. Local storage might be full or disabled.");
    }
}
async function addTask(title, categoryId, dueDate = null) {
    if (!title || !categoryId) return null;
    const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, categoryId, dueDate })
    });
    if (!res.ok) return null;
    const task = await res.json();
    const taskId = task.id.toString();  // ✅ Convert to string
    const catId = task.categoryId.toString(); // ✅ Just in case

    tasks[taskId] = {
        title: task.title,
        categoryId: catId,
        completed: false,
        dueDate: task.dueDate,
        dependencies: []
    };
    window.dispatchEvent(new CustomEvent("dataUpdated"));
    return taskId;
}

async function updateTask(taskId, updatedData) {
    if (!tasks[taskId]) return false;
    const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData)
    });
    if (!res.ok) return false;
    Object.assign(tasks[taskId], updatedData);
    window.dispatchEvent(new CustomEvent("dataUpdated"));
    return true;
}

async function deleteTask(taskId) {
    if (!tasks[taskId]) return false;
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) return false;
    delete tasks[taskId];
    window.dispatchEvent(new CustomEvent("dataUpdated"));
    return true;
}
function toggleTaskComplete(taskId) {
    const task = tasks[taskId];
    if (!task) return false; // Task not found
    const markAsComplete = !task.completed;
    if (markAsComplete) {
        // Check dependencies
        const unmetDependencies = task.dependencies.filter(depId => tasks[depId] && !tasks[depId].completed);
        if (unmetDependencies.length > 0) {
            const unmetNames = unmetDependencies.map(depId => tasks[depId]?.title || `Unknown Task (ID: ${depId})`).join(', ');
            // Return error message to be displayed by UI
            return `Cannot complete "${task.title}". Prerequisite tasks unmet:\n- ${unmetNames.replace(/, /g, '\n- ')}`;
        }
    }
    task.completed = markAsComplete;
    saveData();
    return true; // Indicate success
}
async function addCategory(name) {
    if (!name) return null;
    const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
    });
    if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create category.");
        return null;
    }
    const cat = await res.json();
    categories[cat.id] = cat.name;
    window.dispatchEvent(new CustomEvent("dataUpdated"));
    return cat.id;
}

async function updateCategory(categoryId, newName) {
    const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName })
    });
    if (!res.ok) return false;
    categories[categoryId] = newName;
    window.dispatchEvent(new CustomEvent("dataUpdated"));
    return true;
}

async function deleteCategory(categoryId) {
    const res = await fetch(`/api/categories/${categoryId}`, { method: "DELETE" });
    if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete category.");
        return false;
    }
    delete categories[categoryId];
    window.dispatchEvent(new CustomEvent("dataUpdated"));
    return true;
}
function addDependency(taskId, prerequisiteTaskId) {
     const task = tasks[taskId];
     if (!task || !tasks[prerequisiteTaskId]) return "Task or prerequisite not found.";
     if (taskId === prerequisiteTaskId) return "A task cannot depend on itself.";
     if (task.dependencies.includes(prerequisiteTaskId)) {
         console.log("Dependency already exists.");
         return true; // Indicate success even if it already exists
     };
     const checkCircular = (currentTaskId, targetTaskId, visited = new Set()) => {
         if (currentTaskId === targetTaskId) return true; // Cycle detected
         if (visited.has(currentTaskId)) return false; // Already checked this path
         visited.add(currentTaskId);
         const currentTask = tasks[currentTaskId];
         if (!currentTask || !currentTask.dependencies || currentTask.dependencies.length === 0) {
             return false; // No further dependencies
         }
         for (const depId of currentTask.dependencies) {
             if (checkCircular(depId, targetTaskId, new Set(visited))) { // Pass copy of visited set
                 return true;
             }
         }
         return false;
     };
     if (checkCircular(prerequisiteTaskId, taskId)) {
         return `Cannot add dependency: This would create a circular dependency involving "${tasks[prerequisiteTaskId].title}" and "${task.title}".`;
     }
     task.dependencies.push(prerequisiteTaskId);
     saveData();
     return true;
}
function removeDependency(taskId, prerequisiteTaskId) {
     const task = tasks[taskId];
     if (!task) return false; 
     const initialLength = task.dependencies.length;
     task.dependencies = task.dependencies.filter(depId => depId !== prerequisiteTaskId);
     if (task.dependencies.length < initialLength) {
         saveData();
         return true;
     }
     console.log("Attempted to remove a dependency that did not exist.");
     return false;
}
function applyTheme(isDark) {
    const lightIcon = document.getElementById('theme-icon-light');
    const darkIcon = document.getElementById('theme-icon-dark');
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    if (lightIcon && darkIcon) {
        lightIcon.classList.toggle('hidden', !isDark);
        darkIcon.classList.toggle('hidden', isDark);
    }
}
function initializeTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('darkMode');
    let isDark;
    if (savedTheme !== null) {
        isDark = savedTheme === 'true';
    } else {
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme(isDark);
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const newIsDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('darkMode', newIsDark);
            applyTheme(newIsDark);
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { isDark: newIsDark } }));
        });
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    try {
        mediaQuery.addEventListener('change', (e) => {
            if (localStorage.getItem('darkMode') === null) {
                applyTheme(e.matches);
                 window.dispatchEvent(new CustomEvent('themeChanged', { detail: { isDark: e.matches } }));
            }
        });
    } catch (e) { 
        try {
             mediaQuery.addListener((e) => { 
                 if (localStorage.getItem('darkMode') === null) {
                     applyTheme(e.matches);
                      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { isDark: e.matches } }));
                 }
             });
        } catch (e2) {
             console.error("Theme change listener not supported:", e2);
        }
    }
}
function setActiveNav(currentPageFilename) {
    const navLinks = document.querySelectorAll('.navbar div a'); 
    navLinks.forEach(link => {
        link.classList.remove('active');
        const linkFilename = link.getAttribute('href').split('/').pop();
        if (linkFilename === currentPageFilename) {
            link.classList.add('active');
        }
    });
}
loadData();
