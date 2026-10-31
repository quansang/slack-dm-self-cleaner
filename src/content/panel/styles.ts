export const PANEL_CSS = `
:host { color-scheme: light; }
:host, * { box-sizing: border-box; }
.panel {
  position: fixed; inset: 0 0 0 auto; z-index: 2147483647; width: min(420px, 100vw); height: 100vh;
  display: flex; flex-direction: column; overflow: hidden; background: #f8fafc; color: #172033;
  border-left: 1px solid #d7dee8; box-shadow: -12px 0 32px rgba(23, 32, 51, .18);
  font: 14px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.header {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 17px 18px;
  background: #172033; color: #fff; border-bottom: 3px solid #14b8a6;
}
.header h1 { margin: 0; font-size: 16px; line-height: 1.2; letter-spacing: .01em; }
.header span { display: block; margin-top: 3px; color: #b9c4d6; font-size: 11px; }
.header button { border: 0; background: transparent; color: #fff; font-size: 24px; line-height: 1; cursor: pointer; padding: 4px; border-radius: 5px; }
.body { flex: 1; overflow-y: auto; padding: 16px; }
.identity, .controls, .preview, .operation, .result {
  margin-bottom: 14px; padding: 14px; background: #fff; border: 1px solid #dfe5ed; border-radius: 12px;
  box-shadow: 0 1px 2px rgba(23, 32, 51, .04);
}
dl { margin: 0; }
dl div { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; padding: 5px 0; border-bottom: 1px solid #edf1f5; }
dl div:last-child { border-bottom: 0; }
dt { color: #667085; font-size: 12px; }
dd { margin: 0; font-weight: 650; overflow-wrap: anywhere; }
fieldset { margin: 0 0 14px; padding: 0; border: 0; }
legend { margin-bottom: 7px; font-size: 12px; font-weight: 750; color: #475467; text-transform: uppercase; letter-spacing: .04em; }
.radio-row, .checkbox-row, .confirm { display: flex; align-items: flex-start; gap: 9px; padding: 8px 0; cursor: pointer; }
.radio-row input, .checkbox-row input, .confirm input { margin-top: 3px; accent-color: #0f766e; flex: 0 0 auto; }
.radio-row span, .checkbox-row span, .confirm span { min-width: 0; }
.radio-row b, .checkbox-row b { display: block; }
small { display: block; margin-top: 2px; color: #667085; line-height: 1.35; }
.date-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.date-grid label { color: #475467; font-size: 12px; font-weight: 650; }
.date-grid input { width: 100%; margin-top: 5px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #172033; }
.btn { width: 100%; margin-top: 9px; padding: 10px 12px; border: 0; border-radius: 8px; font: inherit; font-weight: 750; cursor: pointer; }
.btn-primary { background: #0f766e; color: #fff; }
.btn-danger { background: #b42318; color: #fff; }
.btn-secondary { background: #e9eef5; color: #172033; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn:focus-visible, input:focus-visible, .header button:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
.error { margin-bottom: 14px; padding: 11px 12px; border: 1px solid #fda29b; border-radius: 9px; background: #fff1f0; color: #912018; font-weight: 600; }
.preview h2, .result h2 { margin: 0 0 10px; font-size: 19px; }
.warning { padding: 10px; border-left: 3px solid #f59e0b; background: #fffaeb; color: #7a2e0e; font-size: 12px; }
.confirm { margin: 10px 0 2px; color: #344054; font-size: 12px; }
.spinner { width: 30px; height: 30px; margin: 4px auto 12px; border: 3px solid #dce3eb; border-top-color: #0f766e; border-radius: 50%; animation: cleaner-spin .8s linear infinite; }
@keyframes cleaner-spin { to { transform: rotate(360deg); } }
.operation > p { text-align: center; }
.metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin: 10px 0; }
.metric-grid span { padding: 8px; border-radius: 7px; background: #f1f5f9; color: #475467; font-size: 12px; }
.metric-grid b { color: #172033; }
.progress-wrap { height: 10px; overflow: hidden; border-radius: 999px; background: #dce3eb; }
.progress-bar { height: 100%; background: #14b8a6; transition: width .2s ease; }
.eta { margin: 8px 0; color: #667085; font-size: 12px; }
.note { margin: 14px 2px 2px; color: #667085; font-size: 11px; line-height: 1.5; }
@media (max-width: 380px) {
  .body { padding: 12px; }
  .date-grid, .metric-grid { grid-template-columns: 1fr; }
  dl div { grid-template-columns: 96px minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
  .progress-bar { transition: none; }
}
`;
