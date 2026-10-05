import express from "express";
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sockInstance = null;
let lastCode = null;
let lastPairNumber = null;
let pairBusy = false;
let resetSession = null;

function setSock(s) { sockInstance = s; }
function setReset(fn) { resetSession = fn; }
function formatPairCode(code) {
  const c = String(code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (c.length === 8) return c.slice(0, 4) + "-" + c.slice(4);
  return String(code || "");
}
function setCode(c, n) {
  lastCode = c || null;
  lastPairNumber = c ? String(n || lastPairNumber || "").replace(/[^0-9]/g, "") || null : null;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function sockReady() {
  return !!(sockInstance && !sockInstance.__dead && !sockInstance.authState?.creds?.registered);
}
async function waitSock(ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (sockInstance && !sockInstance.__dead) {
      try {
        await sockInstance.waitForSocketOpen();
        if (sockInstance && !sockInstance.__dead) return sockInstance;
      } catch {}
    }
    await sleep(400);
  }
  throw new Error("Bot pas pret, reessaie dans quelques secondes");
}

const PAGE = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SYMPRAX MD • Pairing</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700;800&family=Geist+Mono:wght@600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#060a07; --card:#0f1711; --card2:#131f16; --line:#1e3324;
      --text:#eafff0; --muted:#7aa58a; --green:#2fff6a; --green2:#19c94a;
      --red:#ff5a5a; --blue:#5ab8ff;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      min-height:100vh; font-family:Geist, sans-serif; color:var(--text);
      background: var(--bg);
      display:grid; place-items:center; padding:24px; overflow:hidden;
    }
    /* BACKGROUND GLOW */
    .bg{position:fixed; inset:0; pointer-events:none;}
    .glow{position:absolute; border-radius:50%; filter:blur(90px); opacity:.55;}
    .g1{width:600px;height:600px; background:radial-gradient(circle at 30% 30%, #2fff6a, transparent 70%); left:-150px; top:-200px; animation:move1 10s infinite alternate;}
    .g2{width:500px;height:500px; background:radial-gradient(circle at 50% 50%, #00ffa2, transparent 70%); right:-120px; top:10%; animation:move2 12s infinite alternate;}
    .g3{width:700px;height:700px; background:radial-gradient(circle at 50% 50%, #0a3d1a, transparent 70%); left:30%; bottom:-300px; opacity:.8;}
    @keyframes move1{to{transform:translate(60px,40px) scale(1.1)}}
    @keyframes move2{to{transform:translate(-40px,60px) scale(0.9)}}

    .wrap{position:relative; z-index:2; width:min(420px,100%);}
    
    .badge{
      display:flex; align-items:center; gap:8px; width:fit-content; margin:0 auto 18px;
      padding:6px 14px; border-radius:999px; background:rgba(47,255,106,.08);
      border:1px solid rgba(47,255,106,.18); color:var(--green); font-size:12px; font-weight:700; letter-spacing:.08em;
    }
    .badge i{width:6px;height:6px;background:var(--green);border-radius:50%;box-shadow:0 0 12px var(--green); display:inline-block; animation:pulse 1.5s infinite;}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

    .card{
      background: linear-gradient(180deg, var(--card) 0%, #0a1210 100%);
      border:1px solid var(--line); border-radius:28px; padding:28px;
      box-shadow: 0 20px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05);
      position:relative; overflow:hidden;
    }
    .card::before{
      content:""; position:absolute; inset:0; border-radius:28px; padding:1px;
      background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.02));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events:none;
    }
    .head{text-align:center; margin-bottom:26px;}
    .logo{
      width:56px;height:56px;margin:0 auto 14px; border-radius:16px;
      background:linear-gradient(180deg, #1a2e1e, #0f1a11);
      border:1px solid var(--line); display:grid; place-items:center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }
    h1{font-size:26px; font-weight:800; letter-spacing:-.04em;}
    h1 span{color:var(--green)}
    .sub{color:var(--muted); font-size:13.5px; margin-top:6px; line-height:1.4}

    .status{
      display:flex; align-items:center; justify-content:space-between;
      background:#0a1610; border:1px solid var(--line); border-radius:14px;
      padding:10px 12px; margin-bottom:18px; font-size:12px;
    }
    .status-left{display:flex; align-items:center; gap:8px; color:var(--muted); font-weight:600}
    .dot{width:8px;height:8px;border-radius:50%; background:#8a8a00;}
    .status.ok .dot{background:var(--green); box-shadow:0 0 10px var(--green)}
    .status.busy .dot{background:var(--blue); box-shadow:0 0 10px var(--blue)}
    .status.err .dot{background:var(--red); box-shadow:0 0 10px var(--red)}
    #stt{color:var(--text)}

    label{font-size:11px; font-weight:700; letter-spacing:.12em; color:var(--muted); margin:0 0 8px 2px; display:block;}
    .field{
      display:flex; align-items:center; gap:10px; background:#080f09;
      border:1px solid var(--line); border-radius:16px; padding:6px 8px 6px 16px;
      transition:.2s; 
    }
    .field:focus-within{border-color:var(--green); box-shadow:0 0 0 4px rgba(47,255,106,.12)}
    .plus{font-weight:800; color:var(--green)}
    input{flex:1; background:transparent; border:0; outline:0; color:var(--text); font:600 16px Geist, sans-serif; padding:10px 0;}
    
    .go{
      width:100%; margin-top:14px; border:0; cursor:pointer; border-radius:16px; padding:15px;
      font:800 14px Geist, sans-serif; letter-spacing:.02em; color:#032a10;
      background:linear-gradient(180deg, var(--green), var(--green2));
      box-shadow:0 10px 20px rgba(47,255,106,.25), inset 0 1px 0 rgba(255,255,255,.6);
      transition:.15s;
    }
    .go:hover{transform:translateY(-1px); filter:brightness(1.05)}
    .go:active{transform:translateY(1px)}
    .go:disabled{opacity:.6; cursor:wait}

    .hint{ text-align:center; color:#5a7a65; font-size:11.5px; margin-top:14px; line-height:1.5;}
    .hint b{color:var(--muted)}

    .result{margin-top:18px; display:none; animation:pop .4s cubic-bezier(.16,1,.3,1)}
    .result.show{display:block}
    @keyframes pop{from{opacity:0; transform:translateY(10px) scale(.98)} to{opacity:1; transform:translateY(0) scale(1)}}
    
    .code-box{
      background: #080f09; border:1px dashed rgba(47,255,106,.3); border-radius:20px;
      padding:18px; text-align:center; position:relative;
    }
    .code-label{font-size:10px; font-weight:700; letter-spacing:.18em; color:var(--muted)}
    .code{
      font-family: "Geist Mono", monospace; font-size:36px; font-weight:600;
      letter-spacing:.22em; color:var(--green); margin:10px 0 14px;
      text-shadow:0 0 20px rgba(47,255,106,.5);
    }
    .actions{display:flex; gap:8px; justify-content:center}
    .copy, .time{
      border-radius:12px; padding:10px 14px; font:700 12px Geist, sans-serif; border:1px solid var(--line); cursor:pointer;
    }
    .copy{background:var(--text); color:#08120a; border-color:var(--text);}
    .time{background:transparent; color:var(--muted); pointer-events:none;}

    .err{
      display:none; margin-top:12px; padding:12px; border-radius:12px; font-size:12.5px; font-weight:500;
      background:rgba(255,90,90,.08); border:1px solid rgba(255,90,90,.18); color:#ffb4b4;
    }
    .err.show{display:block}
    footer{ text-align:center; margin-top:18px; font-size:11px; color:#3d5a46; letter-spacing:.08em}
  </style>
</head>
<body>
  <div class="bg"><div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div></div>
  <div class="wrap">
    <div class="badge"><i></i> SYSTEM ONLINE • ENCRYPTED</div>
    <div class="card">
      <div class="head">
        <div class="logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3C17 3 21 6.5 21 11C21 13.2 20.1 15.2 18.6 16.8L20 21L15.2 19.4C14.2 19.8 13.1 20 12 20C7 20 3 16.5 3 11S7 3 12 3Z" stroke="#2fff6a" stroke-width="1.7"/><path d="M8.5 10.5C8.7 13 10.9 15.2 13.5 15.4" stroke="#2fff6a" stroke-width="1.7" stroke-linecap="round"/></svg>
        </div>
        <h1>SYMPRAX <span>MD</span></h1>
        <p class="sub">Connecte ton WhatsApp en 10 secondes.<br>Rapide • Sécurisé • Anti-Ban</p>
      </div>

      <div id="st" class="status"><div class="status-left"><span class="dot"></span> <span id="stt">Initialisation...</span></div><span style="font-size:10px; opacity:.6">v1.0</span></div>

      <form id="f">
        <label>NUMÉRO WHATSAPP</label>
        <div class="field"><span class="plus">+</span><input id="number" name="number" inputmode="numeric" autocomplete="tel" placeholder="237 6XX XXX XXX" maxlength="16" required></div>
        <button class="go" id="btn" type="submit">GÉNÉRER LE CODE →</button>
      </form>

      <div id="err" class="err"></div>

      <div id="res" class="result">
        <div class="code-box">
          <div class="code-label">TON CODE DE LIAISON</div>
          <div class="code" id="code">----</div>
          <div class="actions"><button class="copy" id="copy" type="button">COPIER LE CODE</button><button class="time" id="timer" type="button">90s</button></div>
        </div>
      </div>

      <p class="hint"><b>Comment l'utiliser :</b> WhatsApp > ⋮ > Appareils liés > Lier un appareil > Lier avec un numéro de téléphone > colle le code</p>
      <footer>DEV BY SYMPRAX • MADE IN CAMEROON</footer>
    </div>
  </div>
<script>
    const st = document.getElementById("st");
    const stt = document.getElementById("stt");
    const f = document.getElementById("f");
    const btn = document.getElementById("btn");
    const err = document.getElementById("err");
    const res = document.getElementById("res");
    const codeEl = document.getElementById("code");
    const copy = document.getElementById("copy");
    const timerEl = document.getElementById("timer");
    let countdown = null;

    function setStatus(kind, text) {
      st.className = "status " + kind;
      stt.textContent = text;
    }
    function showErr(m) {
      err.textContent = m || "";
      err.classList.toggle("show", !!m);
    }
    function startTimer(){
      let s = 90;
      clearInterval(countdown);
      timerEl.textContent = s+"s";
      countdown = setInterval(()=>{
        s--; timerEl.textContent = s+"s";
        if(s<=0){ clearInterval(countdown); timerEl.textContent="Expiré"; setStatus("err","Code expiré, régénère"); }
      },1000);
    }
    async function ping() {
      try {
        const r = await fetch("/status");
        const d = await r.json();
        if (d.registered) setStatus("ok", "Bot déjà lié ✓");
        else if (d.ready) setStatus("ok", "Prêt à lier • En attente");
        else setStatus("", "Connexion en cours...");
      } catch { setStatus("err", "Hors ligne"); }
    }
    ping(); setInterval(ping, 4000);

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr("");
      const number = document.getElementById("number").value.replace(/[^0-9]/g, "");
      if (number.length < 8 || number.length > 15) { showErr("Numéro invalide. Mets indicatif + numéro, ex: 2376XXXXXXXX"); return; }
      btn.disabled = true; btn.textContent = "GÉNÉRATION...";
      setStatus("busy", "Génération du code...");
      try {
        const r = await fetch("/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }) });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        codeEl.textContent = d.code;
        res.classList.add("show");
        setStatus("ok", "Code prêt ! Colle-le vite");
        startTimer();
        btn.textContent = "CODE GÉNÉRÉ ✓";
      } catch (ex) {
        showErr(ex.message || "Erreur");
        setStatus("err", "Échec de génération");
        btn.textContent = "GÉNÉRER LE CODE →";
      } finally { setTimeout(()=>{btn.disabled=false; if(!res.classList.contains("show")) btn.textContent="GÉNÉRER LE CODE →";}, 1500); }
    });
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(codeEl.textContent.replace("-", "")); copy.textContent = "COPIÉ ✓"; setTimeout(() => copy.textContent = "COPIER LE CODE", 1200); } catch {}
    });
  </script>
</body>
</html>`;

async function pair(num) {
  const phone = String(num || "").replace(/[^0-9]/g, "");
  if (phone.length < 8 || phone.length > 15) throw new Error("Numero invalide (indicatif + numero, 8-15 chiffres)");
  if (sockInstance?.authState?.creds?.registered) throw new Error("Bot deja lie. Supprime la session pour relier.");
  if (lastCode && lastPairNumber === phone && sockReady()) return lastCode;
  if (pairBusy) throw new Error("Pairing deja en cours, reessaie");
  pairBusy = true;
  try {
    if (lastPairNumber && lastPairNumber !== phone && typeof resetSession === "function") {
      lastCode = null;
      lastPairNumber = null;
      await resetSession();
    }
    const sock = await waitSock();
    if (sock.authState?.creds?.registered) throw new Error("Bot deja lie. Supprime la session pour relier.");
    const raw = await sock.requestPairingCode(phone);
    const code = formatPairCode(raw);
    lastCode = code;
    lastPairNumber = phone;
    console.log("Code pairing pour " + phone + " : " + code);
    return code;
  } finally {
    pairBusy = false;
  }
}

app.get("/", (_req, res) => res.type("html").send(PAGE));
app.post("/pair", async (req, res) => {
  try { res.json({ code: await pair(req.body.number) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/pair", async (req, res) => {
  try { res.json({ code: await pair(req.query.number) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/status", (_req, res) => {
  res.json({
    ready: sockReady(),
    registered: !!sockInstance?.authState?.creds?.registered,
    code: lastCode,
    number: lastPairNumber
  });
});
app.get("/health", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(PORT, () => {
  console.log("WEB PAIR sur le port " + PORT);
  let publicUrl = null;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) publicUrl = "https://" + process.env.RAILWAY_PUBLIC_DOMAIN;
  else if (process.env.RAILWAY_STATIC_URL) publicUrl = process.env.RAILWAY_STATIC_URL;
  else if (process.env.PANEL_PUBLIC_URL) publicUrl = process.env.PANEL_PUBLIC_URL;
  console.log("==============================================");
  if (publicUrl) {
    console.log("  OUVRE CE LIEN POUR TE CONNECTER :");
    console.log("  " + publicUrl);
  } else {
    console.log("  Lien a ouvrir : <adresse-de-ton-panel>:" + PORT);
    console.log("  (regarde l'onglet Network/Networking de ton panel");
    console.log("   pour l'adresse exacte, ex: seven.hopto.org:" + PORT + ")");
    console.log("  Astuce: definis PANEL_PUBLIC_URL dans les variables");
    console.log("  pour que ce lien s'affiche automatiquement ici.");
  }
  console.log("==============================================");
});
export { setSock, setCode, setReset, formatPairCode, pair };
