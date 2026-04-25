import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme-context";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
