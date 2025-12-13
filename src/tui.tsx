import { createCliRenderer, KeyEvent } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  const { width, height } = useTerminalDimensions();

  useKeyboard((event: KeyEvent) => {
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

  return (
    <box border="single" padding={1}>
      <text>Trak TUI Prototype</text>
      <text>Terminal: {width}x{height}</text>
      <text>Count: {count}</text>
      <text color="gray">Press up/down or j/k to change count</text>
      <text color="gray">Press q to quit</text>
    </box>
  );
}

async function main() {
  const renderer = await createCliRenderer();
  const root = createRoot(renderer);
  root.render(<App />);
}

main();
