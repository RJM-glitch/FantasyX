(() => {
  const SUPABASE_URL = "https://gjkivetatcnskoszsdzf.supabase.co";
  const SUPABASE_KEY = "sb_publishable_x-etGDngNtgDlY4d4gJsXg_FrbplfY2";
  if (!window.supabase?.createClient) {
    console.error("FantasyUefa auth: Supabase client did not load.");
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let mode = "login";
  let currentUser = null;
  let busy = false;

  const style = document.createElement("style");
  style.textContent = `
    .auth-overlay{position:fixed;inset:0;z-index:10000;background:rgba(4,13,29,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:18px}
    .auth-overlay.open{display:flex}.auth-card{position:relative;width:min(100%,440px);background:#f5faff;color:#102b4e;border:1px solid #c7e1f6;border-radius:22px;padding:28px;box-shadow:0 24px 80px #00152b80}
    .auth-card h2{font-size:26px;margin:0 0 6px}.auth-sub{color:#54708f;font-size:14px;margin:0 0 20px}.auth-close{position:absolute;right:14px;top:12px;border:0;background:transparent;font-size:28px;cursor:pointer;color:#102b4e}
    .auth-tabs{display:flex;gap:8px;margin-bottom:18px}.auth-tabs button{flex:1;border:1px solid #c7d8e8;background:#e8f3fc;color:#153758;border-radius:10px;padding:10px;font-weight:700;cursor:pointer}.auth-tabs button.active{background:#173e68;color:white}
    .auth-field{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}.auth-input{width:100%;box-sizing:border-box;border:1px solid #c6d8e8;border-radius:10px;padding:12px;background:white;color:#102b4e;font:inherit}
    .auth-submit{width:100%;border:0;border-radius:11px;padding:13px;background:#123e69;color:#fff;font-weight:800;cursor:pointer;margin-top:18px}.auth-submit:disabled{opacity:.55;cursor:wait}
    .auth-msg{font-size:13px;line-height:1.5;margin:12px 0 0;min-height:18px;color:#365a7b}.auth-msg.error{color:#a52c36}.auth-account{margin-top:16px;padding-top:14px;border-top:1px solid #d4e3f0;display:flex;justify-content:space-between;align-items:center;gap:12px}.auth-account button{border:1px solid #c5d7e7;background:white;color:#153758;border-radius:9px;padding:9px 12px;cursor:pointer}
    .auth-hidden{display:none!important}
  `;
  document.head.appendChild(style);
  const overlay = document.createElement("div");
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" type="button" aria-label="Close">×</button>
      <div class="section-kicker">FANTASY PREMIER LEAGUE</div>
      <h2 id="authTitle">Welcome back</h2>
      <p class="auth-sub">Sign in to save your squad across devices.</p>
      <div class="auth-tabs"><button type="button" data-mode="login" class="active">Log in</button><button type="button" data-mode="signup">Create account</button></div>
      <form id="authForm">
        <div id="authNameWrap" class="auth-hidden"><label class="auth-field" for="authName">Your name</label><input class="auth-input" id="authName" maxlength="60" autocomplete="name" placeholder="Name"></div>
        <div id="authTeamWrap" class="auth-hidden"><label class="auth-field" for="authTeam">Fantasy team name</label><input class="auth-input" id="authTeam" maxlength="30" autocomplete="nickname" placeholder="e.g. Rodwell FC"></div>
        <label class="auth-field" for="authEmail">Email address</label><input class="auth-input" id="authEmail" type="email" required maxlength="254" autocomplete="email" placeholder="you@example.com">
        <label class="auth-field" for="authPassword">Password</label><input class="auth-input" id="authPassword" type="password" required minlength="8" autocomplete="current-password" placeholder="At least 8 characters">
        <button class="auth-submit" id="authSubmit" type="submit">Log in</button>
      </form>
      <p class="auth-msg" id="authMessage" role="status" aria-live="polite"></p>
      <div id="authSignedIn" class="auth-hidden">
        <div class="auth-account"><span id="authUserLabel"></span><button type="button" id="authSignOut">Log out</button></div>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  const $ = id => document.getElementById(id);
  const message = (text, error=false) => { $("authMessage").textContent=text; $("authMessage").classList.toggle("error",error); };
  const setBusy = value => { busy=value; $("authSubmit").disabled=value; $("authSubmit").textContent=value?"Please wait…":(mode==="login"?"Log in":"Create account"); };
  function setMode(next) {
    mode=next;
    overlay.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
    $("authTitle").textContent=mode==="login"?"Welcome back":"Join FantasyUefa";
    $("authNameWrap").classList.toggle("auth-hidden",mode!=="signup");
    $("authTeamWrap").classList.toggle("auth-hidden",mode!=="signup");
    $("authPassword").autocomplete=mode==="login"?"current-password":"new-password";
    $("authSubmit").textContent=mode==="login"?"Log in":"Create account";
    message("");
  }
  function open() {
    overlay.classList.add("open");
    message("");
    if (currentUser) {
      $("authForm").classList.add("auth-hidden");
      overlay.querySelector(".auth-tabs").classList.add("auth-hidden");
      $("authTitle").textContent="Your account";
      $("authSignedIn").classList.remove("auth-hidden");
      $("authUserLabel").textContent=currentUser.email||"Signed in";
      $("authSubmit").classList.add("auth-hidden");
      $("authMessage").textContent="Your account is connected. Your saved squad syncs when you save it.";
    } else {
      $("authForm").classList.remove("auth-hidden");
      overlay.querySelector(".auth-tabs").classList.remove("auth-hidden");
      $("authSignedIn").classList.add("auth-hidden");
      $("authSubmit").classList.remove("auth-hidden");
      setMode("login");
    }
  }
  function close(){overlay.classList.remove("open")}
  overlay.querySelector(".auth-close").addEventListener("click",close);
  overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
  overlay.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));

  async function ensureProfile(user, realName, teamName) {
    const payload={user_id:user.id,real_name:realName||user.user_metadata?.real_name||"",team_name:teamName||user.user_metadata?.team_name||"My XI",budget:100.0,total_points:0,wildcard_used:false,free_hit_used:false,bench_boost_used:false,triple_captain_used:false};
    const {error}=await client.from("fantasy_profiles").upsert(payload,{onConflict:"user_id"});
    if(error) console.warn("FantasyUefa profile save:",error.message);
  }
  async function loadSavedSquad(user) {
    const {data,error}=await client.from("fantasy_squads").select("player_id,player_name,club,position,price,is_captain,is_vice,is_bench").eq("user_id",user.id);
    if(error){message("Signed in, but your saved squad could not be loaded yet: "+error.message,true);return}
    if(data?.length) {
      const saved={selected:data.map(x=>Number(x.player_id)).filter(Number.isFinite),captain:String(data.find(x=>x.is_captain)?.player_id||""),vice:String(data.find(x=>x.is_vice)?.player_id||""),formation:localStorage.getItem("fantasyuefa-formation")||"4-3-3"};
      try{localStorage.setItem("fantasyuefa-squad",JSON.stringify(saved));}catch{}
      location.reload();
    }
  }
  async function handleAuth(event) {
    event.preventDefault();
    if(busy)return;
    const email=$("authEmail").value.trim();
    const password=$("authPassword").value;
    setBusy(true);
    try {
      if(mode==="signup") {
        const realName=$("authName").value.trim();
        const teamName=$("authTeam").value.trim()||"My XI";
        if(!realName){message("Please enter your name.",true);return}
        const {data,error}=await client.auth.signUp({email,password,options:{data:{real_name:realName,team_name:teamName},emailRedirectTo:location.origin}});
        if(error)throw error;
        if(data.session) {
          currentUser=data.user;
          await ensureProfile(data.user,realName,teamName);
          message("Account created! Your account is ready.");
          updateProfileButton();
          setTimeout(close,900);
        } else {
          message("Check your email for a confirmation link. Then return here and log in.");
          setMode("login");
          $("authEmail").value=email;
        }
      } else {
        const {data,error}=await client.auth.signInWithPassword({email,password});
        if(error)throw error;
        currentUser=data.user;
        await ensureProfile(data.user);
        updateProfileButton();
        message("Signed in! Checking for your saved squad…");
        await loadSavedSquad(data.user);
        setTimeout(close,700);
      }
    } catch(err) {
      const friendly=(err?.message||"Something went wrong. Please try again.").replace(/<[^>]*>/g,"");
      message(friendly,true);
    } finally {setBusy(false)}
  }
  $("authForm").addEventListener("submit",handleAuth);
  async function signOut() {
    const {error}=await client.auth.signOut();
    if(error){message(error.message,true);return}
    currentUser=null;
    updateProfileButton();
    message("You have logged out. Your cloud squad remains saved to your account.");
    $("authForm").classList.remove("auth-hidden");
    overlay.querySelector(".auth-tabs").classList.remove("auth-hidden");
    $("authSignedIn").classList.add("auth-hidden");
    $("authSubmit").classList.remove("auth-hidden");
    setMode("login");
  }
  $("authSignOut").addEventListener("click",signOut);
  function updateProfileButton() {
    const btn=$("profileBtn");
    if(!btn)return;
    btn.innerHTML=currentUser?((currentUser.email||"Account").split("@")[0].slice(0,14)+" <span>⌄</span>"):"RJ <span>⌄</span>";
    btn.setAttribute("aria-label",currentUser?"Account: "+currentUser.email:"Log in or create an account");
  }
  async function saveSquadToCloud(detail) {
    if(!currentUser||!detail?.selected?.length)return;
    const form=(detail.formation||"4-3-3").split("-").map(Number);
    const starters=new Set([
      ...detail.selected.filter(p=>p.pos==="GK").slice(0,1),
      ...detail.selected.filter(p=>p.pos==="DEF").slice(0,form[0]),
      ...detail.selected.filter(p=>p.pos==="MID").slice(0,form[1]),
      ...detail.selected.filter(p=>p.pos==="FWD").slice(0,form[2])
    ].map(p=>p.id));
    const rows=detail.selected.map(p=>({user_id:currentUser.id,player_id:p.id,player_name:p.n,club:p.club,position:p.pos,price:p.price,is_captain:String(detail.captain)===String(p.id),is_vice:String(detail.vice)===String(p.id),is_bench:!starters.has(p)}));
    const {error:delError}=await client.from("fantasy_squads").delete().eq("user_id",currentUser.id);
    if(delError){console.error("FantasyUefa squad delete:",delError.message);message("Local squad saved, but cloud sync failed: "+delError.message,true);return}
    const {error:insertError}=await client.from("fantasy_squads").insert(rows);
    if(insertError){console.error("FantasyUefa squad sync:",insertError.message);message("Local squad saved, but cloud sync failed: "+insertError.message,true);return}
    message("Squad saved to your account and synced across devices.");
  }
  window.addEventListener("fantasyuefa:squad-saved",e=>saveSquadToCloud(e.detail));
  window.FantasyAuth={open,close,getUser:()=>currentUser,client};
  client.auth.getSession().then(async ({data})=>{
    currentUser=data.session?.user||null;
    updateProfileButton();
    if(currentUser) await ensureProfile(currentUser);
  }).catch(err=>console.warn("FantasyUefa session check failed:",err));
})();