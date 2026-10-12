(() => {
  "use strict";
  const get = id => document.getElementById(id);
  const bookmark = get("install-bookmark");
  const code = bookmark.getAttribute("href");
  get("bookmark-text").value = code;

  function setOS(os) {
    document.querySelectorAll("[data-os]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.os === os)));
    document.querySelector('[data-key="modifier"]').textContent = os === "mac" ? "⌘" : "Ctrl";
    document.querySelector('[data-key="shift"]').textContent = os === "mac" ? "⇧" : "Shift";
    document.querySelector("[data-save-shortcut]").textContent = os === "mac" ? "⌘ + D" : "Ctrl + D";
  }
  setOS(/Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : "windows");
  document.querySelectorAll("[data-os]").forEach(button => button.addEventListener("click", () => setOS(button.dataset.os)));
  bookmark.addEventListener("click", event => {
    event.preventDefault();
    get("drag-status").textContent = "버튼을 클릭하지 말고 북마크바로 끌어 놓으세요. 드래그가 어려우면 아래 복사 방법을 사용하세요.";
  });
  bookmark.addEventListener("dragstart", () => {
    get("drag-status").textContent = "Chrome 주소창 아래 북마크바에 놓으세요. 등록 후 작품 회차 목록에서 실행합니다.";
  });
  async function copy(text, status, fallback) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      status.textContent = "복사했습니다.";
    } catch {
      status.textContent = "자동 복사를 사용할 수 없습니다. 아래 내용을 직접 복사해 주세요.";
      fallback();
    }
  }
  get("copy-bookmark").addEventListener("click", () => copy(code, get("copy-status"), () => {
    get("manual-copy").hidden = false;
    get("bookmark-text").focus();
    get("bookmark-text").select();
  }));
  get("select-code").addEventListener("click", () => {
    get("bookmark-text").focus();
    get("bookmark-text").select();
  });
  get("copy-page").addEventListener("click", () => {
    const address = new URL(location.href);
    address.search = "";
    address.hash = "";
    const text = address.href;
    copy(text, get("page-status"), () => {
      get("page-copy").hidden = false;
      get("page-url").value = text;
      get("page-url").focus();
      get("page-url").select();
    });
  });
})();
