(() => {
  const DATA_URL = "./data/persons.json";

  let persons = [];
  let personsByCode = new Map();
  let personsById = new Map();

  let html5QrCode = null;
  let scanning = false;
  let lastDecoded = null;

  const el = (id) => document.getElementById(id);

  const statusDot = el("statusDot");
  const statusText = el("statusText");

  const btnScan = el("btnScan");
  const btnStop = el("btnStop");


  const scannerWrap = el("scannerWrap");
  const resultCard = el("resultCard");

  const rName = el("rName");
  const rMeta = el("rMeta");
  const rImage = el("rImage");
  const rImageWrap = el("rImageWrap");
  const rLived = el("rLived");
  const rLivedWrap = el("rLivedWrap");
  const rPlace = el("rPlace");
  const rRole = el("rRole");
  const rTagline = el("rTagline");
  const bottomMsg = el("bottomMsg");

  const btnRevealName = el("btnRevealName");

  const hintCards = Array.from(document.querySelectorAll(".hint-card"));
  let hintProgressIndex = 0;
  const hintRevealTimers = new WeakMap();

  function setStatus(ok, text) {
    statusDot.classList.remove("ok", "bad");
    if (ok === true) statusDot.classList.add("ok");
    if (ok === false) statusDot.classList.add("bad");
    statusText.textContent = text;
  }

  const normalize = (s) => String(s ?? "").trim();

  function parseQRPayload(payloadRaw) {
    const raw = normalize(payloadRaw);
    if (!raw) return { code: "", id: "", raw };

    if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
      try {
        const obj = JSON.parse(raw);
        return {
          code: normalize(obj.code ?? obj.CODE),
          id: normalize(obj.id ?? obj.ID),
          raw
        };
      } catch {}
    }

    let s = raw.replace(/^bibster:/i, "").trim();

    const mCode = s.match(/(?:^|[?&\s])code\s*=\s*([01]{6,32})/i);
    const mId = s.match(/(?:^|[?&\s])id\s*=\s*([0-9]{1,3}-[0-9]{1,3})/i);
    if (mCode) return { code: mCode[1], id: "", raw };
    if (mId) return { code: "", id: mId[1], raw };

    if (/^[01]{6,32}$/.test(s)) return { code: s, id: "", raw };
    if (/^[0-9]{1,3}-[0-9]{1,3}$/.test(s)) return { code: "", id: s, raw };

    const bitsInside = s.match(/[01]{6,32}/);
    if (bitsInside) return { code: bitsInside[0], id: "", raw };

    const idInside = s.match(/[0-9]{1,3}-[0-9]{1,3}/);
    if (idInside) return { code: "", id: idInside[0], raw };

    return { code: "", id: "", raw };
  }

  function buildIndexes(list) {
    personsByCode = new Map();
    personsById = new Map();
    for (const p of list) {
      const code = normalize(p.code);
      const id = normalize(p.id);
      if (code) personsByCode.set(code, p);
      if (id) personsById.set(id, p);
    }
  }

  function findPersonByInput(inputRaw) {
    const parsed = parseQRPayload(inputRaw);
    if (parsed.code && personsByCode.has(parsed.code)) return { person: personsByCode.get(parsed.code), parsed };
    if (parsed.id && personsById.has(parsed.id)) return { person: personsById.get(parsed.id), parsed };

    const direct = normalize(inputRaw);
    if (personsByCode.has(direct)) return { person: personsByCode.get(direct), parsed: { code: direct, id: "", raw: inputRaw } };
    if (personsById.has(direct)) return { person: personsById.get(direct), parsed: { code: "", id: direct, raw: inputRaw } };

    return { person: null, parsed };
  }

  function setRevealState(show) {
    if (show) {
      rName.textContent = rName.dataset.full || "—";
      rName.dataset.hidden = "0";
      btnRevealName.textContent = "🙈 Skjul navn";
      rLivedWrap.classList.add("on");
      if (rImage.dataset.failed !== "1" && rImage.src) {
        rImageWrap.classList.add("on");
      }
      resultCard.dataset.revealed = "1";
      return;
    }

    rName.textContent = "???";
    rName.dataset.hidden = "1";
    btnRevealName.textContent = "👁️ Avslør hvem det er";
    rLivedWrap.classList.remove("on");
    rImageWrap.classList.remove("on");
    resultCard.dataset.revealed = "0";
  }

  function setNameHidden(person) {
    rName.dataset.full = person?.name || "Ukjent";
    setRevealState(false);
  }

  function updateHintLocks() {
    hintCards.forEach((card, index) => {
      const isLocked = index > hintProgressIndex;
      card.classList.toggle("locked", isLocked);
      card.setAttribute("aria-disabled", isLocked ? "true" : "false");
    });
  }

  function revealHint(card) {
    if (card.classList.contains("revealed") || card.classList.contains("revealing")) return;
    if (card.classList.contains("locked")) return;

    card.classList.add("revealing");
    const finishReveal = () => {
      card.classList.remove("revealing");
      card.classList.add("revealed");
      hintProgressIndex = Math.min(hintProgressIndex + 1, hintCards.length - 1);
      updateHintLocks();
    };
    const timer = window.setTimeout(finishReveal, 720);
    hintRevealTimers.set(card, timer);
  }

  function resetHintProgress() {
    hintProgressIndex = 0;
    hintCards.forEach((card) => {
      const timer = hintRevealTimers.get(card);
      if (timer) window.clearTimeout(timer);
      hintRevealTimers.delete(card);
      card.classList.remove("revealed");
      card.classList.remove("revealing");
      card.classList.remove("locked");
    });
    updateHintLocks();
  }

  function initHintTaps() {
    const tryReveal = (card) => {
      if (card.classList.contains("locked")) return;
      revealHint(card);
    };

    hintCards.forEach((card) => {
      card.addEventListener("click", () => tryReveal(card));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          tryReveal(card);
        }
      });
    });
  }

  function showResult(person, parsed) {
    if (!person) {
      resultCard.classList.remove("on");
      setStatus(false, "Fant ikke kode i data");
      bottomMsg.textContent = `Ingen match for: "${parsed.raw || ""}"`;
      return;
    }

    // Name hidden by default
    setNameHidden(person);
    resetHintProgress();

    const metaParts = [];
    if (person.id) metaParts.push(`ID ${person.id}`);
    if (person.code) metaParts.push(`KODE ${person.code}`);
    rMeta.textContent = metaParts.join(" • ") || "—";

    rPlace.textContent = person.place || "—";
    rRole.textContent = person.role || "—";
    rTagline.textContent = person.tagline || "—";
    rLived.textContent = person.lived_text || "—";
    rLivedWrap.classList.remove("on");

    if (person.id) {
      rImage.dataset.failed = "0";
      rImage.src = `./assets/${person.id}.png`;
    } else {
      rImage.dataset.failed = "1";
      rImage.removeAttribute("src");
    }
    rImage.alt = "Personbilde";
    rImageWrap.classList.remove("on");

    bottomMsg.textContent =
      parsed.code ? `QR: code=${parsed.code}` :
      parsed.id   ? `QR: id=${parsed.id}` :
                    `QR: ${parsed.raw}`;

    resultCard.classList.add("on");
    setStatus(true, "Klar");
  }

  async function startScan() {
    if (scanning) return;
    if (!window.Html5Qrcode) {
      setStatus(false, "QR-bibliotek mangler");
      return;
    }

    await stopScan(false);

    scannerWrap.classList.add("on");
    btnScan.disabled = true;
    btnStop.disabled = false;

    html5QrCode = new Html5Qrcode("qr-reader", false);

    try {
      scanning = true;
      setStatus(true, "Scanner…");

      const config = {
        fps: 12,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
        disableFlip: false
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          if (decodedText && decodedText === lastDecoded) return;
          lastDecoded = decodedText;

          const { person, parsed } = findPersonByInput(decodedText);
          showResult(person, parsed);

          if (person) stopScan(true);
        },
        () => {}
      );
    } catch (err) {
      scanning = false;
      btnScan.disabled = false;
      btnStop.disabled = true;
      setStatus(false, "Kamera-feil / ikke tilgang");
      scannerWrap.classList.remove("on");
      bottomMsg.textContent =
        `Klarte ikke starte kamera. Gi kameratilgang i nettleseren. (${String(err).slice(0, 120)})`;
    }
  }

  async function stopScan(hidePanel = true) {
    btnStop.disabled = true;

    if (html5QrCode) {
      try { if (scanning) await html5QrCode.stop(); } catch {}
      try { await html5QrCode.clear(); } catch {}
    }

    html5QrCode = null;
    scanning = false;

    btnScan.disabled = false;
    btnStop.disabled = true;

    if (hidePanel) scannerWrap.classList.remove("on");
    if (persons.length) setStatus(true, "Klar");
  }

  async function loadPersons() {
    setStatus(null, "Laster data…");
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error("persons.json må være en array []");

      persons = json;
      buildIndexes(persons);

      setStatus(true, `Klar (${persons.length} kort)`);
      btnScan.disabled = false;
      btnStop.disabled = true;
      return true;
    } catch (e) {
      setStatus(false, "Klarte ikke laste data");
      btnScan.disabled = true;
      bottomMsg.textContent =
        `Sjekk at ${DATA_URL} finnes og er gyldig JSON. (${String(e).slice(0, 160)})`;
      return false;
    }
  }

  // Events
  btnScan.addEventListener("click", startScan);
  btnStop.addEventListener("click", () => stopScan(true));


  btnRevealName.addEventListener("click", () => {
    const hidden = rName.dataset.hidden === "1";
    setRevealState(hidden);
  });

  rImage.addEventListener("error", () => {
    rImage.dataset.failed = "1";
    rImageWrap.classList.remove("on");
  });

  rImage.addEventListener("load", () => {
    rImage.dataset.failed = "0";
    if (resultCard.dataset.revealed === "1") {
      rImageWrap.classList.add("on");
    }
  });


  // Init
  initHintTaps();
  loadPersons();
})();
