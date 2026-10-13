/* Browser bookmarklet. Reads the normal rendered viewer; no external libraries. */
(() => {
  "use strict";
  const VERSION = "2.2.0";
  if (window.novelDL) {
    window.novelDL.show();
    if (window.novelDL.version !== VERSION) alert("이전 버전이 실행 중입니다. 부분 본문을 내보낸 뒤 새로고침하고 보완판을 실행하세요.");
    return;
  }
  const match = location.pathname.match(/^\/novel\/(\d+)(?:\/(\d+))?\/?$/);
  if (!match) { alert("소설 회차 목록 페이지에서 실행하세요. 예: /novel/4591"); return; }
  const novelId = match[1], origin = location.origin, readerName = `novel-dl-reader-${novelId}`;
  if (match[2]) {
    window.name = readerName;
    alert("이 회차 탭을 저장 작업에 연결했습니다. 작품 목록 탭에서 북마크를 실행하고 ‘이어서 저장’을 누르세요.");
    return;
  }
  if (!document.querySelector(`ul[data-novel-id="${novelId}"]`) || !document.querySelector(".novel-episode-head")) {
    alert("지원하는 소설 회차 목록을 찾지 못했습니다. 북토끼의 소설 목록에서 실행하세요. 화면 구조가 바뀌었으면 호환성 확인이 필요합니다."); return;
  }
  const visibleHeading = doc => [...doc.querySelectorAll("h1")].find(el => el.getClientRects().length && doc.defaultView.getComputedStyle(el).visibility !== "hidden");
  const title = visibleHeading(document)?.innerText.trim() || `novel-${novelId}`;
  const saved = new Map(), catalog = new Map();
  let db, job = null, busy = false, cancelled = false, ready = false, reader, wake = null, waitWake = null, renderTimer = null;
  const metrics = { started: 0, paused: 0, pauseStarted: 0, samples: [], remaining: 0, nextAt: 0 };
  // Interrupt waits immediately when the user pauses; never accelerate site requests.
  const sleep = ms => new Promise(resolve => {
    const finish = () => { clearTimeout(timer); waitWake = null; resolve(); };
    const timer = setTimeout(finish, ms); waitWake = finish;
    if (cancelled) finish();
  });
  const now = () => new Date().toISOString();
  const error = (code, message) => Object.assign(new Error(message), { code });
  const checkCancelled = () => { if (cancelled) throw error("STOPPED", "사용자가 중지했습니다."); };
  const panel = document.createElement("section");
  panel.id = "novel-dl-panel";
  Object.assign(panel.style, { position: "fixed", top: "16px", right: "16px", zIndex: "2147483647", width: "390px", maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", overflow: "auto", padding: "22px", borderRadius: "18px", background: "#fafcf9", color: "#243c33", boxShadow: "0 12px 48px #173d3329", font: '14px/1.6 Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif', border: "1px solid #dce6dc", boxSizing: "border-box" });
  panel.setAttribute("aria-label", "소설 저장 작업");
  panel.innerHTML = `<style>
    #novel-dl-panel *{box-sizing:border-box}#novel-dl-panel [hidden],#novel-dl-launcher[hidden]{display:none!important}
    #novel-dl-panel button{all:unset;box-sizing:border-box;cursor:pointer;border:1px solid #d6e2d8;border-radius:8px;padding:8px 12px;background:#fff;color:#335b48;font:inherit;font-size:13px;text-align:center;line-height:1.5}
    #novel-dl-panel button:hover{background:#edf3ec}#novel-dl-panel button:disabled{opacity:.5;cursor:default}#novel-dl-panel button:focus-visible,#novel-dl-panel summary:focus-visible,#novel-dl-panel input:focus-visible{outline:3px solid #9cb989;outline-offset:3px}
    #novel-dl-panel .nd-header,#novel-dl-panel .nd-progress-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
    #novel-dl-panel .nd-brand{font-size:13px;color:#607965;font-weight:700}#novel-dl-panel [data-close]{padding:4px 9px;font-size:12px;background:transparent}
    #novel-dl-panel [data-title]{font-size:23px;font-weight:700;line-height:1.4;letter-spacing:-.7px;margin:16px 0 5px;overflow-wrap:anywhere}#novel-dl-panel .nd-subtitle{font-size:12px;color:#718371;margin-bottom:18px}
    #novel-dl-panel .nd-stage{font-size:12px;color:#42694a;border-radius:20px;background:#eaf1e5;padding:4px 10px}#novel-dl-panel[data-state=paused] .nd-stage{color:#835e1c;background:#fff0d2}#novel-dl-panel[data-state=failed] .nd-stage{color:#984334;background:#fae9e4}
    #novel-dl-panel [data-percent]{font-size:24px;line-height:1;font-weight:700}#novel-dl-panel progress{display:block;width:100%;height:8px;accent-color:#246b50;border:0;border-radius:8px;margin:14px 0 8px}#novel-dl-panel progress::-webkit-progress-bar{background:#e3eadf;border-radius:8px}#novel-dl-panel progress::-webkit-progress-value{background:#246b50;border-radius:8px}
    #novel-dl-panel [data-count]{font-size:12px;color:#657a65}#novel-dl-panel [data-timing]{font-size:12px;color:#738674;margin:6px 0 16px;min-height:19px}
    #novel-dl-panel [data-all]{display:block;width:100%;background:#1d5e45;color:#fff;border-color:#1d5e45;padding:13px;font-size:16px;font-weight:700}#novel-dl-panel [data-all]:hover:enabled{background:#287153}
    #novel-dl-panel .nd-actions{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0 16px}#novel-dl-panel .nd-actions button{flex:1;white-space:nowrap}
    #novel-dl-panel [data-status]{background:#eef3eb;border-radius:9px;padding:12px;font-size:12px;color:#49614b;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}#novel-dl-panel [data-status]:empty{display:none}
    #novel-dl-panel .nd-help{margin:12px 0 16px;color:#7a8976;font-size:11px;line-height:1.8}
    #novel-dl-panel details{border-top:1px solid #e0e8dc;margin-top:12px;padding-top:12px}#novel-dl-panel summary{font-size:13px;color:#54704e;cursor:pointer;padding:3px 0}#novel-dl-panel label{display:block;font-size:12px;color:#5e755b;margin:10px 0}
    #novel-dl-panel input{font:inherit;font-size:12px;border:1px solid #ceddca;border-radius:6px;background:white;color:#2f5039;padding:6px;width:80px;margin-left:8px}#novel-dl-panel input[type=file]{display:block;width:100%;margin:6px 0}#novel-dl-panel .nd-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}#novel-dl-panel .nd-tools button{font-size:12px}
    @media(prefers-reduced-motion:no-preference){#novel-dl-panel progress::-webkit-progress-value{transition:width .2s}}
  </style><div class="nd-header"><span class="nd-brand">소설 저장</span><button data-close aria-label="저장 패널 접기">접기 ↘</button></div>
    <div data-title></div><div class="nd-subtitle">한 번 시작하면 자동 저장 · 완료 후 합본 TXT</div>
    <div class="nd-progress-head"><span class="nd-stage" data-stage>준비 중</span><span data-percent>0%</span></div>
    <progress data-progress max="1" value="0" aria-label="회차 진행"></progress><div data-count></div><div data-timing></div>
    <button data-all disabled>전체 저장</button><div class="nd-actions"><button data-stop disabled>일시정지</button><button data-export disabled>TXT 받기</button></div>
    <div class="nd-actions"><button data-reader hidden>회차 탭 보기 ↗</button><button data-continue disabled hidden>확인 후 계속</button></div>
    <div data-status role="status" aria-live="polite"></div><p class="nd-help">브라우저와 회차 탭을 열어 두세요. 인증이 나오면 회차 탭에서 직접 해결하며, 본문이 표시되면 자동으로 이어집니다.</p>
    <details><summary>저장 범위·백업</summary><label>시작 회차 <input data-start type="number" min="1" value="1"></label><label>끝 회차 <input data-end type="number" min="1" value="3"></label>
      <div class="nd-tools"><button data-run disabled>선택 회차 저장</button><button data-backup disabled>복구 백업 저장</button></div><label>복구 백업 가져오기 <input data-import type="file" accept=".json,application/json" disabled></label></details>
    <details><summary>대기 설정·진단</summary><label>회차 간 대기(초) <input data-delay type="number" min="2" max="60" value="8"></label><label>본문 대기(초) <input data-timeout type="number" min="5" max="180" value="60"></label><label>로딩 재시도 <input data-retries type="number" min="0" max="2" value="2"></label>
      <div class="nd-tools"><button data-report disabled>실행 기록 JSON</button><button data-verify disabled>본문 검증 JSON</button><button data-list disabled>회차 목록 JSON</button></div></details>`;
  document.body.appendChild(panel);
  const ui = selector => panel.querySelector(selector);
  ui(".nd-brand").textContent = `소설 저장 · ${VERSION}`;
  const launcher = document.createElement("button");
  launcher.id = "novel-dl-launcher"; launcher.hidden = true; launcher.setAttribute("aria-label", "저장 패널 다시 열기");
  Object.assign(launcher.style, { position: "fixed", bottom: "20px", right: "20px", zIndex: "2147483647", background: "#1d5e45", color: "white", border: "0", borderRadius: "30px", padding: "12px 18px", cursor: "pointer", font: "bold 13px/1.5 sans-serif", boxShadow: "0 5px 22px #173d3330" });
  document.body.appendChild(launcher);
  const show = () => { panel.style.display = "block"; launcher.hidden = true; };
  launcher.onclick = show;
  ui("[data-title]").textContent = title;
  const status = text => { ui("[data-status]").textContent = text; };
  const fullCount = () => Number(document.querySelector(".novel-episode-head")?.innerText.match(/(\d+)\s*화/)?.[1]) || 0;
  const formatDuration = ms => { const seconds = Math.max(0, Math.round(ms / 1000)); return seconds < 60 ? `${seconds}초` : seconds < 3600 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분`; };
  const isCachedRange = range => {
    for (let n = range.start; n <= range.end; n++) if (!saved.has(n)) return false;
    return true;
  };
  function controls() {
    for (const selector of ["[data-all]", "[data-run]", "[data-verify]", "[data-list]", "[data-import]", "[data-start]", "[data-end]", "[data-delay]", "[data-timeout]", "[data-retries]"]) ui(selector).disabled = !ready || busy;
    ui("[data-continue]").disabled = !ready || (busy ? !wake : !job || job.state === "complete");
    ui("[data-stop]").disabled = !busy;
    ui("[data-export]").disabled = !ready || !saved.size;
    ui("[data-backup]").disabled = !ready || busy;
    ui("[data-report]").disabled = !ready || !job;
    const fullTotal = fullCount(), allCached = fullTotal > 0 && isCachedRange({ start: 1, end: fullTotal });
    const total = job ? job.range.end - job.range.start + 1 : fullTotal;
    const completed = job ? job.successes.length : Math.min(saved.size, total);
    ui("[data-progress]").max = total || 1;
    ui("[data-progress]").value = completed;
    ui("[data-count]").textContent = `범위 완료 ${completed}/${total} · 본문 보관 ${saved.size}개`;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    ui("[data-percent]").textContent = `${percent}%`;
    panel.dataset.state = job?.state || "ready";
    ui("[data-stage]").textContent = !ready ? "준비 중" : busy ? wake ? "확인 필요" : "자동 저장 중" : job?.state === "complete" ? "완료" : job?.state === "failed" ? "확인 필요" : job?.state === "paused" ? "일시정지" : allCached ? "보관 완료" : "준비 완료";
    ui("[data-all]").textContent = busy ? wake ? "확인 대기 중" : "자동 저장 중…" : allCached ? "합본 TXT 다시 받기" : job && job.mode === "download" && job.state !== "complete" ? "이어서 저장" : saved.size ? "남은 회차 저장" : `전체 ${fullCount() || ""}화 저장`;
    ui("[data-stop]").hidden = !busy;
    ui("[data-export]").hidden = !saved.size || allCached;
    ui("[data-stop]").parentElement.hidden = !busy && (!saved.size || allCached);
    ui("[data-reader]").hidden = !busy || !reader || reader.closed;
    ui("[data-continue]").hidden = busy ? !wake || ["CAPTCHA", "ACCESS"].includes(job?.pauseReason?.code) : !job || job.mode !== "verify" || job.state === "complete";
    ui("[data-continue]").textContent = busy ? "확인 후 계속" : "검증 이어서 하기";
    launcher.textContent = `소설 저장 · ${ui("[data-stage]").textContent}${total ? ` ${percent}%` : ""}`;
    if (busy && metrics.started) {
      const elapsed = performance.now() - metrics.started - metrics.paused - (metrics.pauseStarted ? performance.now() - metrics.pauseStarted : 0);
      const remaining = metrics.remaining;
      const average = metrics.samples.length ? metrics.samples.reduce((a, b) => a + b, 0) / metrics.samples.length : 0;
      const estimate = remaining && metrics.samples.length >= 2 ? ` · 남은 시간 약 ${formatDuration(remaining * (average + (job?.settings.delay || 0)) - (job?.settings.delay || 0))}` : remaining ? " · 예상 시간 측정 중" : "";
      const cooldown = metrics.nextAt > performance.now() ? ` · 다음 회차 ${Math.ceil((metrics.nextAt - performance.now()) / 1000)}초 후` : "";
      ui("[data-timing]").textContent = `실행 ${formatDuration(elapsed)}${wake ? " · 사용자 확인 대기" : estimate + cooldown}`;
    } else ui("[data-timing]").textContent = allCached ? "보관한 본문으로 바로 만듭니다. 회차를 다시 열지 않습니다." : "저장한 회차는 건너뜁니다. 복사·붙여넣기는 필요하지 않습니다.";
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const jsonDownload = (name, value) => download(name, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
  const ordered = map => [...map.values()].sort((a, b) => a.number - b.number);
  function validURL(value) {
    try { const url = new URL(value); return url.origin === origin && new RegExp(`^/novel/${novelId}/\\d+/?$`).test(url.pathname) && !url.search && !url.hash; } catch { return false; }
  }
  async function digest(text) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
  }
  const metadata = ep => ({ number: ep.number, url: ep.url, characters: ep.characters, paragraphs: ep.paragraphs, sha256: ep.sha256 });
  async function validChapter(ep) {
    return ep && Number.isSafeInteger(ep.number) && ep.number > 0 && validURL(ep.url) && typeof ep.heading === "string" && ep.heading.length > 0 && !/[\r\n]/.test(ep.heading) && typeof ep.text === "string" && ep.text.trim().length > 0 && ep.characters === ep.text.length && ep.paragraphs === ep.text.split(/\n\s*\n/).length && ep.sha256 === await digest(ep.text);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("novel-dl-checkpoints", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("works", { keyPath: "novelId" });
        request.result.createObjectStore("chapters", { keyPath: ["novelId", "number"] }).createIndex("work", "novelId");
      };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(error("STORAGE", "브라우저 저장소를 열지 못했습니다. 저장소 사용 설정을 확인하세요."));
      request.onblocked = () => reject(error("STORAGE", "다른 탭에서 저장소 갱신을 막고 있습니다. 해당 작업을 마친 뒤 다시 실행하세요."));
    });
  }
  function load() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["works", "chapters"], "readonly");
      const work = tx.objectStore("works").get(novelId);
      const chapters = tx.objectStore("chapters").index("work").getAll(novelId);
      tx.oncomplete = () => resolve({ work: work.result, chapters: chapters.result });
      tx.onerror = tx.onabort = () => reject(error("STORAGE", "브라우저에 저장된 진행 상태를 읽지 못했습니다."));
    });
  }
  // Commit the body and its success record together before advancing to another chapter.
  function checkpoint(chapters = []) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(["works", "chapters"], "readwrite");
        tx.objectStore("works").put({ novelId, title, schema: 2, catalog: ordered(catalog), job, updatedAt: now() });
        for (const ep of chapters) tx.objectStore("chapters").put({ ...ep, novelId });
      } catch {
        try { tx?.abort(); } catch { /* Transaction may already have aborted. */ }
        reject(error("STORAGE", "저장소 쓰기를 시작하지 못했습니다. 복구 백업을 저장한 뒤 확인하세요.")); return;
      }
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(error("STORAGE", "본문 자동 저장에 실패했습니다. 저장 공간을 확인하고 복구 백업을 저장하세요. 다음 회차로 넘어가지 않습니다."));
    });
  }
  function event(code, number, message) {
    if (job) job.events.push({ at: now(), code, ...(number ? { number } : {}), ...(message ? { message } : {}) });
  }
  async function restore() {
    const data = await load();
    saved.clear(); catalog.clear();
    let invalid = 0;
    // Validate in bounded batches; retain the same per-body SHA-256 checks.
    for (let i = 0; i < data.chapters.length; i += 16) {
      const batch = data.chapters.slice(i, i + 16);
      const valid = await Promise.all(batch.map(validChapter));
      batch.forEach((ep, index) => { if (valid[index]) saved.set(ep.number, ep); else invalid++; });
    }
    for (const ep of data.work?.catalog || []) if (Number.isSafeInteger(ep.number) && ep.number > 0 && validURL(ep.url) && typeof ep.title === "string") catalog.set(ep.number, ep);
    const restored = data.work?.schema === 2 ? data.work.job : null;
    if (restored) {
      if (!Number.isSafeInteger(restored.range?.start) || !Number.isSafeInteger(restored.range?.end) || restored.range.start < 1 || restored.range.end < restored.range.start || restored.range.end - restored.range.start >= 100000 || !["download", "verify"].includes(restored.mode) || !Array.isArray(restored.successes) || !Array.isArray(restored.events)) throw error("STORAGE", "진행 기록 형식이 손상됐습니다. 복구 백업을 확인하세요.");
      const numbers = new Set();
      restored.successes = restored.successes.filter(ep => {
        const good = ep.number >= restored.range.start && ep.number <= restored.range.end && !numbers.has(ep.number) && validURL(ep.url) && Number.isInteger(ep.characters) && ep.characters > 0 && Number.isInteger(ep.paragraphs) && ep.paragraphs > 0 && /^[a-f0-9]{64}$/.test(ep.sha256) && (restored.mode === "verify" || (saved.has(ep.number) && JSON.stringify(metadata(saved.get(ep.number))) === JSON.stringify(metadata(ep))));
        if (good) numbers.add(ep.number); return good;
      }).sort((a, b) => a.number - b.number);
      job = restored;
      if (job.state === "running" || (job.state === "complete" && job.successes.length !== job.range.end - job.range.start + 1)) {
        job.state = "paused"; delete job.finishedAt; event("RESTORED", null, "새로고침 또는 탭 종료 후 진행 상태 복원");
      }
      ui("[data-start]").value = job.range.start; ui("[data-end]").value = job.range.end;
      if (job.settings) {
        ui("[data-delay]").value = job.settings.delay / 1000;
        ui("[data-timeout]").value = job.settings.timeout / 1000;
        ui("[data-retries]").value = job.settings.retries;
      }
    } else job = null;
    return invalid;
  }
  function episodes() {
    const byNumber = new Map();
    for (const row of document.querySelectorAll(`ul[data-novel-id="${novelId}"] li[data-ep]`)) {
      const link = row.querySelector("a.novel-ep-link"), number = Number(row.dataset.ep);
      if (!link || !Number.isSafeInteger(number) || number < 1) continue;
      const url = new URL(link.getAttribute("href"), origin).href;
      if (!validURL(url)) continue;
      if (byNumber.has(number) && byNumber.get(number).url !== url) throw error("CATALOG", `${number}화에 서로 다른 링크가 있습니다.`);
      byNumber.set(number, { number, title: link.innerText.trim(), url });
    }
    return ordered(byNumber);
  }
  function remember(items) {
    for (const ep of items) {
      if (catalog.has(ep.number) && catalog.get(ep.number).url !== ep.url) throw error("CATALOG", `${ep.number}화 링크가 변경됐습니다. 이 목록의 링크를 확인하세요.`);
      catalog.set(ep.number, ep);
    }
    return ordered(catalog);
  }
  async function collect(start, end, all = false) {
    const expected = Number(document.querySelector(".novel-episode-head")?.innerText.match(/(\d+)\s*화/)?.[1]) || null;
    let direction = "older";
    for (let page = 0; page < 200; page++) {
      checkCancelled(); const current = episodes();
      if (!current.length) throw error("CATALOG", "회차 목록 요소를 찾을 수 없습니다.");
      const accumulated = remember(current); await checkpoint();
      if (all && expected && accumulated.length === expected) return accumulated;
      if (!all && accumulated.filter(ep => ep.number >= start && ep.number <= end).length === end - start + 1) return accumulated;
      const list = document.querySelector(`ul[data-novel-id="${novelId}"]`);
      const buttons = [...(list.closest("section")?.querySelectorAll("button") || [])];
      if (!all) {
        const missing = Array.from({ length: end - start + 1 }, (_, i) => start + i).find(n => !catalog.has(n));
        direction = missing < current[0].number ? "older" : "newer";
      }
      const findButton = dir => buttons.find(el => dir === "older" ? /이전 회차 더 보기/.test(el.innerText) : /더 최신 회차 보기/.test(el.innerText));
      let button = findButton(direction);
      if (!button && all && direction === "older") { direction = "newer"; button = findButton(direction); }
      if (!button) {
        if (all && expected && accumulated.length !== expected) throw error("CATALOG", `전체 ${expected}화 중 ${accumulated.length}개만 수집했습니다.`);
        return accumulated;
      }
      if (button.disabled) {
        const limit = Date.now() + 20000;
        while (button.disabled && button.isConnected && Date.now() < limit) { checkCancelled(); await sleep(500); }
        if (!button.isConnected) continue;
        if (button.disabled) throw error("CATALOG", "회차 목록이 20초 넘게 로딩 중입니다.");
      }
      status(`회차 목록 수집 중: ${accumulated.length}개 (화면 ${current.length}개)`);
      const before = current.map(ep => ep.url).join("\n"); button.click();
      const deadline = Date.now() + 20000;
      while (episodes().map(ep => ep.url).join("\n") === before) {
        checkCancelled(); if (Date.now() >= deadline) throw error("CATALOG", "회차 목록 로딩 실패 (20초). 현재 목록을 확인하세요."); await sleep(500);
      }
      remember(episodes()); await checkpoint(); await sleep(1500);
    }
    throw error("CATALOG", "목록 수집 한도(200페이지)에 도달했습니다.");
  }
  function bodyState(doc) {
    const article = doc.querySelector("article.novel-viewer");
    if (!article) return { kind: "loading" };
    const buttons = [...article.querySelectorAll("button")];
    if (buttons.some(el => /퍼즐 슬라이더/.test(el.getAttribute("aria-label") || "")) || /퍼즐 조각을 맞춰주세요/.test(article.innerText)) return { kind: "gate", code: "CAPTCHA", message: "회차 확인 탭에서 CAPTCHA를 직접 해결하세요. 본문이 표시되면 자동으로 이어집니다." };
    if (article.querySelector("input[type=password]")) return { kind: "gate", code: "ACCESS", message: "회차 확인 탭에서 로그인 또는 접근 조건을 직접 확인하세요. 본문이 표시되면 자동으로 이어집니다." };
    const slot = [...article.children].find(el => el.tagName === "DIV" && !el.classList.contains("novel-tools") && !el.classList.contains("novel-loading"));
    if (!slot || slot.hidden) return { kind: "loading" };
    const root = slot.__novelShadow || slot.shadowRoot || slot;
    if (root.querySelector("iframe, canvas, img")) throw error("UNSUPPORTED", "이미지·캔버스 본문입니다. 텍스트 저장으로 완전하게 보존할 수 없습니다.");
    const epub = root.querySelector(".novel-epub-rendered"), paragraphs = [...root.querySelectorAll("p")];
    const raw = epub ? epub.innerText : paragraphs.length ? paragraphs.map(p => p.innerText).join("\n\n") : slot.innerText;
    const text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
    if (!text || /^(불러오는 중|로딩 중|Loading)[\s.…!]*$/i.test(text)) return { kind: "loading" };
    // Restrict gate messages to short UI notices; a novel may contain these words.
    if (root === slot && text.length < 300 && /^(?:본문을 보려면|로그인이 필요|로그인 후|권한이 없|접근이 거부|인증이 필요|포인트가 부족|구매 후|CAPTCHA)/i.test(text)) return { kind: "gate", code: "ACCESS", message: "본문 대신 접근 안내가 표시됩니다. 회차 확인 탭에서 직접 확인하세요. 본문이 표시되면 자동으로 이어집니다." };
    return { kind: "body", text };
  }
  async function pause(reason, ep) {
    metrics.pauseStarted = performance.now(); metrics.nextAt = 0;
    job.state = "paused"; job.pauseReason = { code: reason.code, message: reason.message, number: ep.number };
    event(reason.code, ep.number, reason.message); await checkpoint();
    let monitor, automatic = false;
    await new Promise(resolve => {
      wake = resolve; controls(); status(`${ep.number}화에서 대기 중\n${reason.message}\n완료된 본문과 진행 기록은 자동 저장됐습니다.`);
      // Observe the existing viewer only. Never submit, solve, refresh, or retry a challenge.
      if (["CAPTCHA", "ACCESS"].includes(reason.code)) monitor = setInterval(() => {
        try {
          if (!reader || reader.closed || reader.location.href !== ep.url) return;
          if (bodyState(reader.document).kind === "body") { automatic = true; resolve(); }
        } catch { /* User may be navigating or completing authentication. */ }
      }, 1000);
      if (cancelled) resolve();
    });
    clearInterval(monitor);
    metrics.paused += performance.now() - metrics.pauseStarted; metrics.pauseStarted = 0;
    wake = null; checkCancelled(); job.state = "running"; delete job.pauseReason;
    event(automatic ? "AUTO_RESUMED" : "RESUMED", ep.number); await checkpoint(); controls();
  }
  function ensureReader() {
    // Empty URL preserves an existing named tab and its completed authentication.
    if (!reader || reader.closed) reader = window.open("", readerName);
    if (!reader) throw error("READER", "회차 확인 탭을 열지 못했습니다. 이 사이트의 팝업 허용 후 다시 실행하세요.");
  }
  async function readEpisode(ep) {
    let attempts = 0;
    const expectedPath = new URL(ep.url).pathname;
    try { if (!reader.closed && reader.location.href !== ep.url) reader.location.href = ep.url; }
    catch { throw error("READER", "회차 확인 탭에 접근할 수 없습니다. 브라우저 창을 확인하세요."); }
    for (;;) {
      let previous = "", stable = 0, deadline = Date.now() + job.settings.timeout;
      while (Date.now() < deadline) {
        checkCancelled();
        if (!reader || reader.closed) {
          await pause(error("READER", "회차 확인 탭이 닫혔습니다. ‘확인 후 계속’을 눌러 다시 여세요."), ep);
          reader.location.href = ep.url; deadline = Date.now() + job.settings.timeout; previous = ""; stable = 0; continue;
        }
        let doc;
        try {
          if (reader.location.href === "about:blank") { reader.location.href = ep.url; await sleep(500); continue; }
          if (reader.location.origin !== origin) throw error("ORIGIN", "회차 탭이 다른 사이트로 이동했습니다. 원래 회차로 직접 돌아온 뒤 계속하세요.");
          if (reader.location.pathname !== expectedPath) { await sleep(500); continue; }
          doc = reader.document;
          if (doc.location.pathname !== expectedPath) { await sleep(500); continue; }
          // A page may clear its target name during navigation. Restore it only
          // after checking the same-origin episode, so a reloaded list can reuse it.
          reader.name = readerName;
        } catch (e) {
          await pause(error("ORIGIN", e.code === "ORIGIN" ? e.message : "회차 탭의 출처 또는 창 간 접근이 제한됐습니다. 직접 확인한 뒤 계속하세요."), ep);
          deadline = Date.now() + job.settings.timeout; previous = ""; stable = 0; continue;
        }
        const result = bodyState(doc);
        if (result.kind === "gate") {
          await pause(error(result.code, result.message), ep);
          deadline = Date.now() + job.settings.timeout; previous = ""; stable = 0; continue;
        }
        const text = result.kind === "body" ? result.text : "";
        stable = text && text === previous ? stable + 1 : 0; previous = text;
        if (stable >= 2) {
          const heading = (visibleHeading(doc)?.innerText || ep.title).replace(/\s*\n\s*/g, " ").trim();
          return { ...ep, heading, text, characters: text.length, paragraphs: text.split(/\n\s*\n/).length, sha256: await digest(text), verifiedAt: now() };
        }
        await sleep(1000);
      }
      if (reader && !reader.closed) {
        let last;
        try { if (reader.location.origin === origin && reader.location.pathname === expectedPath) last = bodyState(reader.document); } catch (e) { if (e.code === "UNSUPPORTED") throw e; }
        if (last?.kind === "gate") { await pause(error(last.code, last.message), ep); continue; }
      }
      if (attempts < job.settings.retries) {
        attempts++; event("LOAD_RETRY", ep.number, `${attempts}/${job.settings.retries}`); await checkpoint();
        status(`${ep.number}화 로딩 재시도 ${attempts}/${job.settings.retries}`); await sleep(Math.max(job.settings.delay, attempts * 2000)); checkCancelled();
        if (reader && !reader.closed) reader.location.href = ep.url;
      } else {
        await pause(error("LOAD_TIMEOUT", `본문을 ${job.settings.timeout / 1000}초 안에 확인하지 못했습니다. 회차 탭을 직접 확인한 뒤 계속하세요. 빈 본문을 성공으로 기록하지 않습니다.`), ep);
        attempts = 0;
      }
    }
  }
  function settings() {
    const delay = Number(ui("[data-delay]").value), timeout = Number(ui("[data-timeout]").value), retries = Number(ui("[data-retries]").value);
    if (![delay, timeout, retries].every(Number.isFinite) || delay < 2 || delay > 60 || timeout < 5 || timeout > 180 || !Number.isInteger(retries) || retries < 0 || retries > 2) throw error("SETTINGS", "대기 설정 범위를 확인하세요.");
    return { delay: delay * 1000, timeout: timeout * 1000, retries };
  }
  function exportItems(items, complete = false) {
    if (!items.length) throw error("EMPTY", "저장된 본문이 없습니다. 빈 파일은 만들지 않습니다.");
    for (let i = 1; i < items.length; i++) if (items[i].number !== items[i - 1].number + 1) throw error("GAP", "저장된 회차 사이에 누락이 있습니다. 빠진 회차를 저장한 뒤 합본을 내보내세요.");
    const text = items.map(ep => `${title} ${ep.number}화 — ${ep.heading}\n출처: ${ep.url}\n\n${ep.text}`).join("\n\n====================\n\n");
    download(`${title}_${items[0].number}-${items.at(-1).number}화${complete ? "" : "_부분"}.txt`, text, "text/plain;charset=utf-8");
  }
  async function locked(action) {
    if (!navigator.locks) throw error("LOCK", "중복 실행을 막는 브라우저 기능이 없습니다. 최신 Chrome에서 실행하세요.");
    return navigator.locks.request(`novel-dl:${novelId}`, { ifAvailable: true }, async lock => {
      if (!lock) throw error("LOCK", "다른 탭에서 이 작품을 처리 중입니다. 기존 탭에서 계속하세요.");
      return action();
    });
  }
  async function execute(action) {
    if (!ready || busy) return;
    busy = true; cancelled = false; controls();
    renderTimer = setInterval(controls, 1000);
    try { await locked(action); }
    catch (e) {
      if (job && e.code !== "LOCK") {
        job.state = e.code === "STOPPED" ? "paused" : "failed";
        job.pauseReason = { code: e.code || "ERROR", message: e.message };
        event(e.code || "ERROR", null, e.message);
        try { await checkpoint(); } catch (storageError) { e = storageError; }
      }
      status(`${e.code === "STOPPED" ? "중지됨" : "중단"}: ${e.message}\n보관한 본문 ${saved.size}개. 저장된 본문과 실행 기록을 내보낼 수 있습니다.`);
    } finally { clearInterval(renderTimer); renderTimer = null; busy = false; wake = null; metrics.nextAt = 0; metrics.pauseStarted = 0; controls(); }
  }
  function start(mode, resume = false) {
    if (!ready || busy) return;
    const range = { start: Number(ui("[data-start]").value), end: Number(ui("[data-end]").value) };
    const total = Number(document.querySelector(".novel-episode-head")?.innerText.match(/(\d+)\s*화/)?.[1]);
    let config;
    try {
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 1 || range.end < range.start || range.end - range.start >= 100000 || (total && range.end > total)) throw error("RANGE", "작품 전체 회차 수와 저장 범위를 확인하세요.");
      config = settings();
      if (mode !== "download" || !isCachedRange(range)) ensureReader();
    } catch (e) { status(e.message); return; }
    execute(async () => {
      Object.assign(metrics, { started: performance.now(), paused: 0, pauseStarted: 0, samples: [], remaining: 0, nextAt: 0 });
      await restore();
      if (!resume || !job || job.mode !== mode || job.range.start !== range.start || job.range.end !== range.end) job = { version: VERSION, title, source: location.href, mode, startedAt: now(), range, settings: config, state: "running", successes: [], failures: [], events: [] };
      else { job.settings = config; job.state = "running"; delete job.finishedAt; delete job.pauseReason; event("RESUMED", null, "저장된 진행 기록에서 재개"); }
      ui("[data-start]").value = range.start; ui("[data-end]").value = range.end;
      await checkpoint(); controls();
      // A fully cached range is already hash-checked by restore(). Export in one
      // transaction without opening a reader, traversing lists, or saving every body again.
      if (mode === "download" && isCachedRange(range)) {
        const items = [], hashes = new Set();
        for (let n = range.start; n <= range.end; n++) {
          checkCancelled(); const ep = saved.get(n);
          if (hashes.has(ep.sha256)) throw error("DUPLICATE", `${n}화 본문이 다른 회차와 동일합니다. 회차 탭을 확인하세요.`);
          hashes.add(ep.sha256); items.push(ep);
        }
        job.successes = items.map(metadata); event("CACHE_EXPORT", null, `${items.length}개 보관 본문으로 합본 생성`);
        job.state = "complete"; job.finishedAt = now(); delete job.pauseReason;
        await checkpoint(); controls(); exportItems(items, true);
        status(`${items.length}개 회차의 합본 TXT를 만들었습니다.\n보관한 본문을 사용해 회차를 다시 요청하지 않았습니다.`); return;
      }
      ensureReader();
      const links = (await collect(range.start, range.end)).filter(ep => ep.number >= range.start && ep.number <= range.end);
      if (links.length !== range.end - range.start + 1) throw error("CATALOG", "요청 범위에 빠진 회차가 있습니다.");
      const done = new Map(job.successes.map(ep => [ep.number, ep]));
      const bodyOwners = new Map(job.successes.map(ep => [ep.sha256, ep.number]));
      metrics.remaining = links.filter(ep => !done.has(ep.number) && (mode !== "download" || saved.get(ep.number)?.url !== ep.url)).length;
      for (const ep of links) {
        checkCancelled();
        if (done.has(ep.number) && done.get(ep.number).url === ep.url) continue;
        status(`${ep.number}화 확인 중 (${range.start}~${range.end}화)`);
        const cached = mode === "download" ? saved.get(ep.number) : null, usedCache = cached?.url === ep.url;
        const readStarted = performance.now(), pausedBefore = metrics.paused;
        const result = usedCache ? cached : await readEpisode(ep);
        if (bodyOwners.has(result.sha256) && bodyOwners.get(result.sha256) !== ep.number) throw error("DUPLICATE", `${ep.number}화 본문이 다른 회차와 동일합니다. 회차 탭을 확인하세요.`);
        const previous = [...job.successes], previousEventCount = job.events.length, previousCurrent = job.current;
        done.set(ep.number, metadata(result)); job.successes = ordered(done); job.current = ep.number; event(usedCache ? "CACHED" : "SAVED", ep.number);
        try { await checkpoint(mode === "download" ? [result] : []); }
        catch (e) { job.successes = previous; job.events.length = previousEventCount; job.current = previousCurrent; done.delete(ep.number); throw e; }
        if (mode === "download") saved.set(ep.number, result);
        bodyOwners.set(result.sha256, ep.number);
        if (!usedCache) {
          metrics.samples.push(performance.now() - readStarted - (metrics.paused - pausedBefore));
          if (metrics.samples.length > 10) metrics.samples.shift();
          metrics.remaining--;
        }
        controls();
        if (!usedCache && metrics.remaining > 0) {
          metrics.nextAt = performance.now() + config.delay; controls();
          await sleep(config.delay); metrics.nextAt = 0;
        }
      }
      checkCancelled(); job.state = "complete"; job.finishedAt = now(); delete job.pauseReason; await checkpoint(); controls();
      if (mode === "download") exportItems(links.map(ep => saved.get(ep.number)), true);
      else jsonDownload(`${title}_${range.start}-${range.end}화_본문검증.json`, job);
      status(mode === "download" ? `${job.successes.length}개 회차 저장 완료.\n합본 TXT 다운로드를 시작했습니다. 파일이 보이지 않으면 저장 버튼으로 다시 받을 수 있습니다.` : `${job.successes.length}개 회차 검증 완료. 검증 기록 JSON 다운로드를 시작했습니다.`);
    });
  }
  async function backup() {
    await locked(async () => {
      const data = await load();
      jsonDownload(`${title}_복구백업.json`, { format: "novel-dl-backup", schema: 2, version: VERSION, novelId, title, source: origin, exportedAt: now(), work: data.work, chapters: data.chapters });
      status("복구 백업을 저장했습니다. 백업에는 저장된 본문이 포함됩니다.");
    });
  }
  async function importBackup(file) {
    if (file.size > 100 * 1024 * 1024) throw error("BACKUP", "100MB보다 큰 백업은 가져올 수 없습니다.");
    const backup = JSON.parse((await file.text()).replace(/^\ufeff/, ""));
    if (backup.format !== "novel-dl-backup" || backup.schema !== 2 || backup.novelId !== novelId || backup.title !== title || !Array.isArray(backup.chapters)) throw error("BACKUP", "현재 작품과 일치하는 복구 백업이 아닙니다.");
    const entries = [], numbers = new Set();
    for (const original of backup.chapters) {
      if (numbers.has(original.number)) throw error("BACKUP", "백업에 중복 회차가 있습니다.");
      const oldURL = new URL(original.url);
      if (oldURL.origin !== backup.source || !new RegExp(`^/novel/${novelId}/\\d+/?$`).test(oldURL.pathname) || oldURL.search || oldURL.hash) throw error("BACKUP", "백업 회차 URL이 작품과 일치하지 않습니다.");
      const ep = { ...original, novelId, url: new URL(oldURL.pathname, origin).href };
      if (!await validChapter(ep)) throw error("BACKUP", `${ep.number}화 백업의 본문 해시 또는 형식이 일치하지 않습니다. 가져오지 않았습니다.`);
      if (saved.has(ep.number) && saved.get(ep.number).sha256 !== ep.sha256) throw error("BACKUP", `${ep.number}화의 기존 본문과 백업이 다릅니다. 기존 기록을 덮어쓰지 않습니다.`);
      numbers.add(ep.number); entries.push(ep);
    }
    if (!entries.length) throw error("BACKUP", "백업에 본문이 없습니다.");
    for (const ep of entries) catalog.set(ep.number, { number: ep.number, title: ep.title || ep.heading, url: ep.url });
    await checkpoint(entries); for (const ep of entries) saved.set(ep.number, ep);
    controls(); status(`${entries.length}개 본문 복구 완료. 원하는 범위로 저장하면 보관한 본문을 재사용하고 빠진 회차를 읽습니다.`);
  }
  const handle = action => async () => { try { await action(); } catch (e) { status(e.message); } controls(); };
  ui("[data-all]").onclick = () => {
    if (job && job.mode === "download" && job.state !== "complete" && !isCachedRange({ start: 1, end: fullCount() })) {
      ui("[data-start]").value = job.range.start; ui("[data-end]").value = job.range.end;
      start("download", true); return;
    }
    const total = Number(document.querySelector(".novel-episode-head")?.innerText.match(/(\d+)\s*화/)?.[1]);
    if (!Number.isSafeInteger(total) || total < 1) { status("전체 회차 수를 확인하지 못했습니다. 회차 목록을 확인하세요."); return; }
    ui("[data-start]").value = 1; ui("[data-end]").value = total;
    start("download", true);
  };
  ui("[data-run]").onclick = () => start("download");
  ui("[data-verify]").onclick = () => start("verify");
  ui("[data-continue]").onclick = () => {
    try { if (wake) { ensureReader(); const resume = wake; wake = null; resume(); controls(); } else if (job) start(job.mode, true); } catch (e) { status(e.message); }
  };
  const stop = () => { cancelled = true; if (wake) wake(); if (waitWake) waitWake(); status("일시정지 요청 중… 저장한 본문은 유지됩니다."); };
  ui("[data-stop]").onclick = stop;
  ui("[data-export]").onclick = handle(async () => exportItems(ordered(saved)));
  ui("[data-report]").onclick = handle(async () => { if (!job) throw error("EMPTY", "실행 기록이 없습니다."); jsonDownload(`${title}_실행기록.json`, job); });
  ui("[data-list]").onclick = () => execute(async () => { await restore(); const items = await collect(1, 1, true); jsonDownload(`${title}_회차목록.json`, { title, source: location.href, collectedAt: now(), count: items.length, episodes: items }); status(`회차 목록 ${items.length}개 내보내기 완료.`); });
  ui("[data-backup]").onclick = handle(backup);
  ui("[data-import]").onchange = handle(async () => {
    const file = ui("[data-import]").files[0]; if (!file || busy) return;
    busy = true; controls();
    try { await locked(async () => { await restore(); await importBackup(file); }); }
    finally { busy = false; ui("[data-import]").value = ""; }
  });
  ui("[data-reader]").onclick = () => { try { ensureReader(); reader.focus(); } catch (e) { status(e.message); } };
  ui("[data-close]").onclick = () => { panel.style.display = "none"; launcher.hidden = false; };
  window.novelDL = { version: VERSION, show, stop };
  status("저장된 진행 상태를 복원하고 있습니다…"); controls();
  (async () => {
    try {
      db = await openDB(); const invalid = await restore(); ready = true; controls();
      const allCached = fullCount() > 0 && isCachedRange({ start: 1, end: fullCount() });
      status(`${saved.size}개 본문 복원 완료.${allCached ? " ‘합본 TXT 다시 받기’로 파일을 받을 수 있습니다." : job && job.state !== "complete" ? " ‘이어서 저장’으로 중단된 범위를 재개할 수 있습니다." : " 큰 저장 버튼을 한 번 누르면 시작합니다."}${invalid ? `\n검증되지 않은 저장 기록 ${invalid}개는 재사용하지 않습니다.` : ""}`);
    } catch (e) { status(e.message); }
  })();
})();
