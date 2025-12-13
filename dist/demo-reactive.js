import { jsxs as _jsxs, jsx as _jsx } from "@opentui/react/jsx-runtime";
import { Database } from "bun:sqlite";
import { EventEmitter } from "events";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState, useEffect } from "react";
import { v4 as uuid } from "uuid";
// ============================================
// Database Layer
// ============================================
const db = new Database(":memory:");
db.run(`
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
// Seed some initial data
db.run(`INSERT INTO tasks (id, title) VALUES (?, ?)`, [uuid(), "Build TUI prototype"]);
db.run(`INSERT INTO tasks (id, title) VALUES (?, ?)`, [uuid(), "Add SQLite reactivity"]);
db.run(`INSERT INTO tasks (id, title) VALUES (?, ?)`, [uuid(), "Test event bus"]);
class DataBus extends EventEmitter {
    emit(event, payload) {
        return super.emit("data", payload);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
}
const bus = new DataBus();
const TaskRepo = {
    getAll() {
        return db.query("SELECT * FROM tasks ORDER BY created_at DESC").all();
    },
    create(title) {
        const id = uuid();
        db.run("INSERT INTO tasks (id, title) VALUES (?, ?)", [id, title]);
        bus.emit("data", { type: "task:created", taskId: id });
        return this.getById(id);
    },
    toggle(id) {
        db.run("UPDATE tasks SET completed = NOT completed WHERE id = ?", [id]);
        bus.emit("data", { type: "task:updated", taskId: id });
    },
    delete(id) {
        db.run("DELETE FROM tasks WHERE id = ?", [id]);
        bus.emit("data", { type: "task:deleted", taskId: id });
    },
    getById(id) {
        return db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    }
};
// ============================================
// React Hook for reactive data
// ============================================
function useTasks() {
    const [tasks, setTasks] = useState(TaskRepo.getAll());
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const handler = (event) => {
            // Re-fetch from DB on any change
            setTasks(TaskRepo.getAll());
            setVersion(v => v + 1);
        };
        bus.on("data", handler);
        return () => { bus.off("data", handler); };
    }, []);
    return { tasks, version };
}
// ============================================
// TUI Components
// ============================================
function TaskItem({ task, selected }) {
    const prefix = selected ? "→ " : "  ";
    const checkbox = task.completed ? "[x]" : "[ ]";
    const suffix = selected ? " ←" : "";
    const color = selected ? "cyan" : task.completed ? "gray" : "white";
    return (_jsxs("text", { color: color, children: [prefix, checkbox, " ", task.title, suffix] }));
}
function App() {
    const { width, height } = useTerminalDimensions();
    const { tasks, version } = useTasks();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [inputMode, setInputMode] = useState(false);
    const [inputBuffer, setInputBuffer] = useState("");
    useKeyboard((event) => {
        if (inputMode) {
            if (event.name === "escape") {
                setInputMode(false);
                setInputBuffer("");
            }
            else if (event.name === "return") {
                if (inputBuffer.trim()) {
                    TaskRepo.create(inputBuffer.trim());
                }
                setInputMode(false);
                setInputBuffer("");
            }
            else if (event.name === "backspace") {
                setInputBuffer(b => b.slice(0, -1));
            }
            else if (event.sequence && event.sequence.length === 1 && !event.ctrl) {
                setInputBuffer(b => b + event.sequence);
            }
            return;
        }
        if (event.name === "q") {
            process.exit(0);
        }
        if (event.name === "up" || event.name === "k") {
            setSelectedIndex(i => Math.max(0, i - 1));
        }
        if (event.name === "down" || event.name === "j") {
            setSelectedIndex(i => Math.min(tasks.length - 1, i + 1));
        }
        if (event.name === "space" || event.name === "return") {
            const task = tasks[selectedIndex];
            if (task)
                TaskRepo.toggle(task.id);
        }
        if (event.name === "d" || event.name === "x") {
            const task = tasks[selectedIndex];
            if (task) {
                TaskRepo.delete(task.id);
                setSelectedIndex(i => Math.max(0, Math.min(i, tasks.length - 2)));
            }
        }
        if (event.name === "a" || event.name === "n") {
            setInputMode(true);
        }
    });
    return (_jsxs("box", { style: { flexDirection: "column", width: "100%", height: "100%" }, children: [_jsxs("box", { border: "single", padding: 1, children: [_jsx("text", { bold: true, color: "cyan", children: "Trak - Reactive SQLite Demo" }), _jsxs("text", { color: "gray", children: [" (", width, "x", height, ") updates: ", version] })] }), _jsx("box", { style: { flexDirection: "column", flexGrow: 1 }, padding: 1, children: tasks.length === 0 ? (_jsx("text", { color: "gray", children: "No tasks. Press 'a' to add one." })) : (tasks.map((task, index) => (_jsx(TaskItem, { task: task, selected: index === selectedIndex }, task.id)))) }), inputMode ? (_jsx("box", { border: "single", padding: 1, children: _jsxs("text", { color: "yellow", children: ["New task: ", inputBuffer, "_"] }) })) : (_jsx("box", { border: "single", padding: 1, children: _jsx("text", { color: "gray", children: "\u2191/\u2193:navigate  space:toggle  d:delete  a:add  q:quit" }) }))] }));
}
// ============================================
// Main
// ============================================
async function main() {
    const renderer = await createCliRenderer();
    const root = createRoot(renderer);
    root.render(_jsx(App, {}));
}
main();
