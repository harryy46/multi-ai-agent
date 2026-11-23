(function () {
  const ok = { in: "", up: "" };
  function mk(id) {
    const d = document.createElement("div");
    d.id = id;
    d.style.cssText = "margin:8px 0;padding:8px;border:1px solid #334155;border-radius:10px;background:#020617";
    d.innerHTML = '<div style="display:flex;gap:6px"><button type="button" class="s" style="padding:7px 10px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#38bdf8;font-weight:700;font-size:12px;cursor:pointer">Send OTP</button><input class="i" maxlength="6" placeholder="6-digit" style="flex:1;min-width:0;padding:7px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:12px"><button type="button" class="v" style="padding:7px 10px;border-radius:8px;border:none;background:#16a34a;color:#fff;font-weight:700;font-size:12px;cursor:pointer">Verify</button></div><div class="m" style="font-size:11px;color:#94a3b8;margin-top:5px">Verify via OTP</div>';
    return d;
  }
  function wr(el, k, gt) {
    const m = el.querySelector(".m");
    el.querySelector(".s").onclick = async () => {
      const t = ((gt && gt()) || "").trim();
      if (!t) { m.textContent = "Enter phone/email"; return; }
      m.textContent = "Sending...";
      const r = await fetch("/api/otp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: t }) }).then((x) => x.json());
      m.textContent = r.error || ("OTP: " + r.devOtp);
    };
    el.querySelector(".v").onclick = async () => {
      const t = ((gt && gt()) || "").trim();
      const o = el.querySelector(".i").value.trim();
      const r = await fetch("/api/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: t, otp: o }) }).then((x) => x.json());
      if (r.verified) { ok[k] = t.toLowerCase(); m.textContent = "OTP Verified!"; }
      else { m.textContent = r.error || "Invalid OTP"; }
    };
    return () => ok[k] === ((gt && gt()) || "").trim().toLowerCase() && ok[k] !== "";
  }
  const iv = setInterval(() => {
    const b1 = document.getElementById("sb-go-in");
    const b2 = document.getElementById("sb-go-up");
    if (!b1 || !b2 || document.getElementById("ob1")) return;
    clearInterval(iv);
    const d1 = mk("ob1"), d2 = mk("ob2");
    b1.before(d1);
    b2.before(d2);
    const c1 = wr(d1, "in", () => (document.getElementById("sb-l-ph") || {}).value);
    const c2 = wr(d2, "up", () => (document.getElementById("sb-s-ph") || {}).value);
    b1.addEventListener("click", (e) => { if (!c1()) { e.stopImmediatePropagation(); e.preventDefault(); d1.querySelector(".m").textContent = "Verify OTP first"; } }, true);
    b2.addEventListener("click", (e) => { if (!c2()) { e.stopImmediatePropagation(); e.preventDefault(); d2.querySelector(".m").textContent = "Verify OTP first"; } }, true);
  }, 300);
})();