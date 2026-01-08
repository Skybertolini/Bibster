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
  const rPlace = el("rPlace");
  const rRole = el("rRole");
  const rTagline = el("rTagline");
  const bottomMsg = el("bottomMsg");

  const btnScanAgain = el("btnScanAgain");
  const btnRevealName = el("btnRevealName");

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

  function setNameHidden(person) {
    rName.dataset.full = person?.name || "Ukjent";
    rName.dataset.hidden = "1";
    rName.textContent = "???";
    btnRevealName.textContent = "👁️ Avslør hvem det er";
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

    const metaParts = [];
    if (person.id) metaParts.push(`ID ${person.id}`);
    if (person.code) metaParts.push(`KODE ${person.code}`);
    rMeta.textContent = metaParts.join(" • ") || "—";

    rPlace.textContent = person.place || "—";
    rRole.textContent = person.role || "—";
    rTagline.textContent = person.tagline || "—";

    bottomMsg.textContent =
      parsed.code ? `QR: code=${parsed.code}` :
      parsed.id   ? `QR: id=${parsed.id}` :
                    `QR: ${parsed.raw}`;

    resultCard.classList.add("on");
    setStatus(true, "Klar");
  }

  function clearUI() {
    manualInput.value = "";
    resultCard.classList.remove("on");
    bottomMsg.textContent = "";
    lastDecoded = null;
    if (persons.length) setStatus(true, "Klar");
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


  btnScanAgain.addEventListener("click", () => {
    clearUI();
    startScan();
  });

  btnRevealName.addEventListener("click", () => {
    const hidden = rName.dataset.hidden === "1";
    if (hidden) {
      rName.textContent = rName.dataset.full || "—";
      rName.dataset.hidden = "0";
      btnRevealName.textContent = "🙈 Skjul navn";
    } else {
      rName.textContent = "???";
      rName.dataset.hidden = "1";
      btnRevealName.textContent = "👁️ Avslør hvem det er";
    }
  });


  // Init
  loadPersons();
})();
