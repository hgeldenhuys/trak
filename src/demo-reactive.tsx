import { Database } from "bun:sqlite";
import { EventEmitter } from "events";
import { createCliRenderer, KeyEvent } from "@opentui/core";
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

// ============================================
// Event Bus
// ============================================
type TaskEvent =
  | { type: "task:created"; taskId: string }
  | { type: "task:updated"; taskId: string }
  | { type: "task:deleted"; taskId: string }
  | { type: "tasks:reload" };

class DataBus extends EventEmitter {
  emit(event: "data", payload: TaskEvent): boolean {
    return super.emit("data", payload);
  }
  on(event: "data", listener: (payload: TaskEvent) => void): this {
    return super.on(event, listener);
  }
  off(event: "data", listener: (payload: TaskEvent) => void): this {
    return super.off(event, listener);
  }
}

const bus = new DataBus();

// ============================================
// Repository (DB operations that emit events)
// ============================================
interface Task {
  id: string;
  title: string;
  completed: number;
  created_at: string;
}

const TaskRepo = {
  getAll(): Task[] {
    return db.query("SELECT * FROM tasks ORDER BY created_at DESC").all() as Task[];
  },

  create(title: string): Task {
    const id = uuid();
    db.run("INSERT INTO tasks (id, title) VALUES (?, ?)", [id, title]);
    bus.emit("data", { type: "task:created", taskId: id });
    return this.getById(id)!;
  },

  toggle(id: string): void {
    db.run("UPDATE tasks SET completed = NOT completed WHERE id = ?", [id]);
    bus.emit("data", { type: "task:updated", taskId: id });
  },

  delete(id: string): void {
    db.run("DELETE FROM tasks WHERE id = ?", [id]);
    bus.emit("data", { type: "task:deleted", taskId: id });
  },

  getById(id: string): Task | null {
    return db.query("SELECT * FROM tasks WHERE id = ?").get(id) as Task | null;
  }
};

// ============================================
// React Hook for reactive data
// ============================================
function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(TaskRepo.getAll());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handler = (event: TaskEvent) => {
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
function TaskItem({ task, selected }: { task: Task; selected: boolean }) {
  const prefix = selected ? "→ " : "  ";
  const checkbox = task.completed ? "[x]" : "[ ]";
  const suffix = selected ? " ←" : "";
  const color = selected ? "cyan" : task.completed ? "gray" : "white";

  return (
    <text color={color}>
      {prefix}{checkbox} {task.title}{suffix}
    </text>
  );
}

function App() {
  const { width, height } = useTerminalDimensions();
  const { tasks, version } = useTasks();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [inputMode, setInputMode] = useState(false);
  const [inputBuffer, setInputBuffer] = useState("");

  useKeyboard((event: KeyEvent) => {
    if (inputMode) {
      if (event.name === "escape") {
        setInputMode(false);
        setInputBuffer("");
      } else if (event.name === "return") {
        if (inputBuffer.trim()) {
          TaskRepo.create(inputBuffer.trim());
        }
        setInputMode(false);
        setInputBuffer("");
      } else if (event.name === "backspace") {
        setInputBuffer(b => b.slice(0, -1));
      } else if (event.sequence && event.sequence.length === 1 && !event.ctrl) {
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
      if (task) TaskRepo.toggle(task.id);
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

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <box border="single" padding={1}>
        <text bold color="cyan">Trak - Reactive SQLite Demo</text>
        <text color="gray"> ({width}x{height}) updates: {version}</text>
      </box>

      <box style={{ flexDirection: "column", flexGrow: 1 }} padding={1}>
        {tasks.length === 0 ? (
          <text color="gray">No tasks. Press 'a' to add one.</text>
        ) : (
          tasks.map((task, index) => (
            <TaskItem key={task.id} task={task} selected={index === selectedIndex} />
          ))
        )}
      </box>

      {inputMode ? (
        <box border="single" padding={1}>
          <text color="yellow">New task: {inputBuffer}_</text>
        </box>
      ) : (
        <box border="single" padding={1}>
          <text color="gray">↑/↓:navigate  space:toggle  d:delete  a:add  q:quit</text>
        </box>
      )}
    </box>
  );
}

// ============================================
// Main
// ============================================
async function main() {
  const renderer = await createCliRenderer();
  const root = createRoot(renderer);
  root.render(<App />);
}

main();
