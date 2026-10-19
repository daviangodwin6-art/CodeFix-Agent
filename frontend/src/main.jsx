import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "material-symbols/outlined.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
