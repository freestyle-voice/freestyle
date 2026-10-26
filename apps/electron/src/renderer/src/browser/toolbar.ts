import { type PreviewScenario, scenarios } from "./fixtures";

/** Development controls live outside React so product layouts stay identical. */
export function mountPreviewToolbar(
  mode: "fixtures" | "server",
  scenario: PreviewScenario,
): void {
  const toolbar = document.createElement("aside");
  toolbar.setAttribute("aria-label", "Browser development controls");
  toolbar.style.cssText =
    "position:fixed;z-index:2147483647;bottom:8px;right:8px;max-width:calc(100vw - 16px);padding:8px 12px;border:1px solid #8886;border-radius:10px;background:#202320;color:#fff;font:12px/1.5 system-ui;box-shadow:0 2px 12px #0004;";
  const label = document.createElement("span");
  label.textContent =
    mode === "fixtures"
      ? "Browser preview · fixtures "
      : "Browser · development server ";
  toolbar.append(label);
  if (mode === "fixtures") {
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Preview scenario");
    select.style.cssText =
      "background:#303830;color:white;border:1px solid #888;border-radius:4px;margin:0 8px;padding:2px;";
    for (const name of scenarios) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === scenario;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const url = new URL(location.href);
      url.searchParams.set("scenario", select.value);
      location.href = url.href;
    });
    toolbar.append(select);
  }
  const detail = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Desktop features unavailable";
  const explanation = document.createElement("p");
  explanation.textContent =
    "Global shortcuts, cross-app paste, accessibility, system audio, native plugin views, and app updates require Electron. Preview data resets on reload.";
  explanation.style.cssText = "max-width:340px;white-space:normal;";
  detail.append(summary, explanation);
  toolbar.append(detail);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.style.cssText = "margin:0;max-width:420px;white-space:normal;";
  toolbar.append(status);
  window.addEventListener("freestyle:browser-unsupported", (event) => {
    status.textContent = (event as CustomEvent<string>).detail;
  });
  document.body.append(toolbar);
}
