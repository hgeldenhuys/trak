import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
function App() {
    const [count, setCount] = useState(0);
    const { width, height } = useTerminalDimensions();
    useKeyboard((event) => {
        if (event.name === "q") {
            process.exit(0);
        }
        if (event.name === "up" || event.name === "k") {
            setCount((c) => c + 1);
        }
        if (event.name === "down" || event.name === "j") {
            setCount((c) => c - 1);
        }
    });
    return (_jsxs("box", { border: "single", padding: 1, children: [_jsx("text", { children: "Trak TUI Prototype" }), _jsxs("text", { children: ["Terminal: ", width, "x", height] }), _jsxs("text", { children: ["Count: ", count] }), _jsx("text", { color: "gray", children: "Press up/down or j/k to change count" }), _jsx("text", { color: "gray", children: "Press q to quit" })] }));
}
async function main() {
    const renderer = await createCliRenderer();
    const root = createRoot(renderer);
    root.render(_jsx(App, {}));
}
main();
