export function injectModalStyles() {
    if (document.getElementById("lora-explorer-css")) return;
    const s = document.createElement("style");
    s.id = "lora-explorer-css";
    s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

#lora-explorer { position:fixed; inset:0; z-index:99998; display:flex; align-items:center; justify-content:center; font-family:'Inter',sans-serif; }
#lora-explorer .lora-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.82); backdrop-filter:blur(10px); }
#lora-explorer .lora-window { position:relative; z-index:1; width:min(98vw,1540px); height:min(95vh,960px); background:#0b0c12; border:1px solid #293148; border-radius:14px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 40px 100px #000c, inset 0 1px 0 rgba(255,255,255,.04); }
#lora-explorer .lora-hdr { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #252a3a; background:linear-gradient(180deg,#151827 0%,#0f111a 100%); flex-shrink:0; flex-wrap:wrap; }
#lora-explorer .lora-title { font-size:13px; font-weight:700; color:#eef2ff; white-space:nowrap; margin-right:4px; }
#lora-explorer .lora-tabs { display:flex; align-items:center; gap:6px; }
#lora-explorer .lora-tab { background:#171b2f; border:1px solid #303956; color:#aab6df; font-size:10px; font-weight:600; padding:6px 12px; border-radius:6px; cursor:pointer; }
#lora-explorer .lora-tab:hover { background:#202946; border-color:#536797; color:#eef3ff; }
#lora-explorer .lora-tab.active { background:#263457; border-color:#7891cf; color:#fff; box-shadow:0 0 0 1px rgba(125,155,230,.24), inset 0 1px 0 rgba(255,255,255,.08); }
#lora-explorer .lora-local-sort { min-height:29px; padding:6px 8px; background:#121625; border:1px solid #2b3552; border-radius:7px; color:#b2bee6; font-size:10px; font-weight:600; outline:none; }
#lora-explorer .lora-search-wrap { position:relative; flex:1; min-width:220px; max-width:420px; margin-left:8px; }
#lora-explorer .lora-search-icon { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:#52607f; font-size:11px; pointer-events:none; font-family:'JetBrains Mono',monospace; }
#lora-explorer .lora-search { width:100%; padding:7px 10px 7px 27px; background:#0f1320; border:1px solid #27304a; border-radius:7px; color:#c4ceef; font-family:'JetBrains Mono',monospace; font-size:12px; outline:none; box-sizing:border-box; }
#lora-explorer .lora-search::placeholder { color:#46506c; }
#lora-explorer .lora-search:focus { border-color:#52689c; }
#lora-explorer .lora-gap { flex:1; }
#lora-explorer .lora-auth { font-size:10px; font-family:'JetBrains Mono',monospace; color:#8a8aa8; margin-right:6px; }
#lora-explorer .lora-auth.connected { color:#9fd29f; }
#lora-explorer .lora-btn-text, #lora-explorer .lora-btn { background:#171b2f; border:1px solid #303956; color:#aab6df; font-family:'Inter',sans-serif; font-size:10px; font-weight:600; padding:6px 12px; border-radius:6px; cursor:pointer; transition:all .14s; }
#lora-explorer .lora-btn-text:hover, #lora-explorer .lora-btn:hover { background:#202946; border-color:#536797; color:#eef3ff; }
#lora-explorer .lora-btn-text:disabled, #lora-explorer .lora-btn:disabled { opacity:.62; cursor:wait; }
#lora-explorer .lora-btn-text.disabled, #lora-explorer .lora-btn.disabled { opacity:.5; pointer-events:none; }
#lora-explorer .lora-btn-secondary { background:#101826; border-color:#27405c; color:#9bd7ef; }
#lora-explorer .lora-btn-danger { background:transparent; border-color:#342024; color:#b86d7d; }
#lora-explorer .lora-btn-danger:hover { background:#241015; border-color:#5a2b38; color:#ffc7d2; }
#lora-explorer .lora-close { width:29px; height:29px; display:flex; align-items:center; justify-content:center; background:transparent; border:1px solid #342024; border-radius:7px; color:#8a4454; cursor:pointer; font-size:13px; flex-shrink:0; }
#lora-explorer .lora-close:hover { background:#241015; border-color:#5a2b38; color:#ffc7d2; }
#lora-explorer .lora-prompt-panel { display:grid; grid-template-columns:132px 1fr; gap:10px; align-items:stretch; padding:10px 14px; border-bottom:1px solid #202436; background:#0d1019; flex-shrink:0; }
#lora-explorer .lora-prompt-head { display:flex; flex-direction:column; justify-content:center; gap:5px; color:#e4ebff; font-size:11px; font-weight:700; }
#lora-explorer .lora-prompt-head small { color:#8794ba; font-family:'JetBrains Mono',monospace; font-size:9.5px; font-weight:500; }
#lora-explorer #lora-prompt-editor { width:100%; min-height:58px; max-height:112px; resize:vertical; border-radius:8px; border:1px solid #27304a; background:#090d16; color:#dfe8ff; outline:none; padding:9px 10px; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.45; box-sizing:border-box; }
#lora-explorer #lora-prompt-editor:focus { border-color:#52689c; }
#lora-explorer .lora-body { flex:1; overflow-y:auto; padding:12px; scrollbar-width:thin; scrollbar-color:#27304a transparent; }
#lora-explorer .lora-body::-webkit-scrollbar { width:5px; }
#lora-explorer .lora-body::-webkit-scrollbar-thumb { background:#27304a; border-radius:3px; }
#lora-explorer .lora-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(205px,1fr)); gap:10px; width:100%; }
#lora-explorer .lora-empty, #lora-explorer .lora-net-gate { grid-column:1/-1; min-height:420px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:40px; text-align:center; color:#7f8bad; font-size:12px; }
#lora-explorer .lora-net-gate strong { color:#eaf0ff; font-size:18px; letter-spacing:.04em; }
#lora-explorer .lora-net-gate span { max-width:520px; line-height:1.55; color:#9ca9cd; }
#lora-explorer .lora-spinner { width:24px; height:24px; border:2px solid #181d2b; border-top-color:#6f84c2; border-radius:50%; animation:lora-spin .6s linear infinite; }
@keyframes lora-spin { to { transform:rotate(360deg); } }

#lora-explorer .lora-card { border-radius:8px; overflow:hidden; background:#0f1018; border:1px solid #1d2130; cursor:pointer; transition:transform .15s,border-color .15s,box-shadow .15s; }
#lora-explorer .lora-card:hover { transform:translateY(-2px); border-color:#35405f; box-shadow:0 8px 24px #0009; }
#lora-explorer .lora-card-img { position:relative; aspect-ratio:1; overflow:hidden; background:#0b0d14; }
#lora-explorer .lora-card-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .25s; }
#lora-explorer .lora-card-img-contain { background:#171a22; }
#lora-explorer .lora-card-img-contain img { object-fit:contain; }
#lora-explorer .lora-card:hover .lora-card-img img { transform:scale(1.04); }
#lora-explorer .lora-no-img { display:flex; align-items:center; justify-content:center; }
#lora-explorer .lora-no-img::after { content:attr(data-init); font-family:'JetBrains Mono',monospace; font-size:26px; font-weight:700; color:#252c40; text-transform:uppercase; }
#lora-explorer .lora-card-overlay { position:absolute; inset:0; background:rgba(0,0,0,.68); display:flex; flex-direction:column; gap:7px; align-items:center; justify-content:center; opacity:0; transition:opacity .18s; padding:10px; box-sizing:border-box; }
#lora-explorer .lora-card:hover .lora-card-overlay { opacity:1; }
#lora-explorer .lora-btn.fetching { background:#2a2010; border-color:#6c5526; color:#f2ca71; }
#lora-explorer .lora-card-meta { padding:8px 10px 10px; }
#lora-explorer .lora-card-title { display:block; font-size:11.5px; font-weight:600; font-family:'JetBrains Mono',monospace; color:#d8def6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#lora-explorer .lora-card-subtitle { display:block; font-size:10px; color:#8895bb; font-family:'JetBrains Mono',monospace; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#lora-explorer .lora-card-triggers { display:block; font-size:9.5px; color:#a78bfa; font-family:'JetBrains Mono',monospace; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#lora-explorer .lora-card-link { display:block; margin-top:6px; color:#9bd7ef; font-size:9.5px; font-weight:700; text-decoration:none; }
#lora-explorer .lora-card-link:hover { color:#dff8ff; text-decoration:underline; }
#lora-explorer .lora-open-info { margin-top:7px; width:100%; min-height:26px; border-radius:6px; border:1px solid #27405c; background:#101826; color:#9bd7ef; font-size:10px; font-weight:600; cursor:pointer; }
#lora-explorer .lora-open-info:hover { background:#173047; color:#dff8ff; }
#lora-explorer .lora-update-badge, #lora-explorer .lora-update-banner { display:inline-flex; align-items:center; align-self:flex-start; margin-bottom:6px; padding:4px 7px; border-radius:999px; border:1px solid #5d6f2a; background:#20240d; color:#e5ed8f; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
#lora-explorer .lora-update-banner { border-radius:8px; margin:0 0 12px; font-size:10px; text-transform:none; letter-spacing:0; }
#lora-explorer .lora-card-progress, #lora-explorer .lora-info-progress { margin-top:8px; padding:8px; border-radius:8px; border:1px solid #25314d; background:#080d18; }
#lora-explorer .lora-card-progress.hidden, #lora-explorer .lora-info-progress.hidden { display:none; }
#lora-explorer .lora-progress-line { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; color:#9fb0d6; font-family:'JetBrains Mono',monospace; font-size:9px; }
#lora-explorer .lora-progress-msg { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#lora-explorer .lora-progress-size { flex-shrink:0; color:#c9d6ff; }
#lora-explorer .lora-progress-track { height:6px; overflow:hidden; border-radius:999px; background:#10182a; }
#lora-explorer .lora-progress-fill { display:block; height:100%; width:0%; border-radius:inherit; background:linear-gradient(90deg,#6fa3ff,#9bd7ef); transition:width .18s ease; }
#lora-explorer .indeterminate .lora-progress-fill { animation:lora-progress-pulse 1s ease-in-out infinite alternate; }
@keyframes lora-progress-pulse { from { transform:translateX(-55%); } to { transform:translateX(145%); } }
#lora-explorer .lora-ftr { display:flex; align-items:center; gap:10px; padding:8px 14px; border-top:1px solid #202436; flex-shrink:0; background:#0b0c12; }
#lora-explorer .lora-count { font-size:10px; font-family:'JetBrains Mono',monospace; color:#909dbc; }
#lora-explorer .lora-ftr-gap { flex:1; }

#lora-explorer .lora-key-modal, #lora-explorer .lora-info-modal { position:absolute; inset:0; z-index:31; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(5,8,14,.78); backdrop-filter:blur(8px); }
#lora-explorer .lora-key-modal.hidden, #lora-explorer .lora-info-modal.hidden { display:none; }
#lora-explorer .lora-key-panel, #lora-explorer .lora-info-panel { width:min(760px,100%); max-height:calc(100vh - 48px); border-radius:14px; border:1px solid #26314c; background:linear-gradient(180deg,#0f1422 0%,#090d17 100%); box-shadow:0 28px 70px rgba(0,0,0,.42); overflow:hidden; display:flex; flex-direction:column; }
#lora-explorer .lora-info-panel { width:min(1120px,100%); }
#lora-explorer .lora-panel-header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:16px 18px 14px; border-bottom:1px solid #192235; }
#lora-explorer .lora-panel-copy { display:flex; flex-direction:column; gap:5px; min-width:0; }
#lora-explorer .lora-panel-copy strong { font-size:14px; color:#edf2ff; letter-spacing:.01em; }
#lora-explorer .lora-panel-copy span { font-size:11px; line-height:1.55; color:#9fb0d6; max-width:720px; }
#lora-explorer .lora-key-body, #lora-explorer .lora-info-body { padding:16px 18px; overflow:auto; }
#lora-explorer .lora-key-link { display:inline-flex; align-self:flex-start; min-height:28px; padding:6px 10px; border-radius:8px; border:1px solid #385083; background:#17213a; color:#d8e5ff; text-decoration:none; font-size:10.5px; font-weight:600; box-sizing:border-box; align-items:center; }
#lora-explorer .lora-key-field { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
#lora-explorer .lora-key-field span { color:#dce6ff; font-size:11px; font-weight:600; }
#lora-explorer .lora-key-field textarea { width:100%; resize:vertical; min-height:84px; padding:12px 14px; border-radius:12px; border:1px solid #24304a; background:#0b1120; color:#e8efff; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.5; box-sizing:border-box; outline:none; }
#lora-explorer .lora-key-hint { margin:10px 0 0; color:#8ea1cf; font-size:10.5px; line-height:1.5; }
#lora-explorer .lora-key-actions { display:flex; justify-content:flex-end; padding:0 18px 18px; }
#lora-explorer .lora-info-tools { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
#lora-explorer .lora-btn-link { display:inline-flex; align-items:center; min-height:28px; padding:6px 12px; border-radius:6px; border:1px solid #27405c; background:#101826; color:#9bd7ef; text-decoration:none; font-size:10px; font-weight:700; box-sizing:border-box; }
#lora-explorer .lora-btn-link:hover { background:#173047; color:#dff8ff; }
#lora-explorer .lora-version-picker { display:flex; flex-direction:column; gap:6px; margin:0 0 12px; }
#lora-explorer .lora-version-picker span { color:#e5ecff; font-size:10px; font-weight:700; }
#lora-explorer .lora-version-picker select { min-height:32px; border-radius:8px; border:1px solid #24304a; background:#0b1120; color:#d8e5ff; font-size:10.5px; padding:6px 8px; outline:none; }
#lora-explorer .lora-info-details { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; margin-bottom:12px; }
#lora-explorer .lora-info-details span { display:flex; flex-direction:column; gap:3px; padding:8px 10px; border-radius:8px; border:1px solid #24304a; background:#0b1120; color:#aebce6; font-size:10px; min-width:0; }
#lora-explorer .lora-info-details b { color:#e5ecff; font-size:10px; }
#lora-explorer .lora-trigger-list { width:100%; min-height:44px; padding:10px; border-radius:8px; border:1px solid #24304a; background:#0b1120; color:#d8e5ff; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.5; box-sizing:border-box; }
#lora-explorer .lora-ref-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; margin-top:14px; }
#lora-explorer .lora-example-card { overflow:hidden; border-radius:8px; border:1px solid #24304a; background:#080b13; }
#lora-explorer .lora-example-card img { width:100%; aspect-ratio:1; object-fit:cover; display:block; background:#080b13; }
#lora-explorer .lora-example-meta { display:flex; flex-direction:column; gap:7px; padding:8px; border-top:1px solid #1c2942; }
#lora-explorer .lora-example-meta span, #lora-explorer .lora-example-meta small { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; color:#cbd7fb; font-family:'JetBrains Mono',monospace; font-size:9.5px; line-height:1.35; }
#lora-explorer .lora-example-meta small { color:#8794ba; -webkit-line-clamp:2; }
#lora-explorer .lora-example-actions { display:grid; grid-template-columns:1fr; gap:5px; }
#lora-explorer .lora-example-actions .lora-btn-text { width:100%; min-height:25px; padding:5px 7px; }
#lora-explorer .lora-info-empty { min-height:120px; padding:18px; }
@media (max-width: 760px) {
    #lora-explorer .lora-prompt-panel { grid-template-columns:1fr; }
}
    `;
    document.head.appendChild(s);
}
