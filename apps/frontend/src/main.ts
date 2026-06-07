import "@/styles/index.css";
import { mountShell } from "@/shell/index.js";

const container = document.getElementById("app");
if (!container) {
  throw new Error("yn: #app container missing from index.html");
}
mountShell(container);
