import { api } from "./browser-api.js";
import { $, setupActions, watchStatus } from "./ui.js";
setupActions();
$("configure").addEventListener("click", () => api.runtime.openOptionsPage());
watchStatus();
