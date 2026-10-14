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
    get("drag-status").textContent = "이 버튼을 마우스로 잡아 Chrome 창 위쪽의 북마크바에 놓아 주세요. 잘 안 되면 아래 ‘끌어 놓기가 안 되나요?’를 열어 주세요.";
  });
  bookmark.addEventListener("dragstart", () => {
    get("drag-status").textContent = "Chrome 주소창 아래 북마크바에 놓아 주세요. ‘소설 저장’이 나타나면 준비가 끝납니다.";
  });
  async function copy(text, status, fallback, message) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      status.textContent = message;
    } catch {
      status.textContent = "복사가 안 됐습니다. 아래 내용을 모두 선택해서 직접 복사해 주세요.";
      fallback();
    }
  }
  get("copy-bookmark").addEventListener("click", () => copy(code, get("copy-status"), () => {
    get("manual-copy").hidden = false;
    get("bookmark-text").focus();
    get("bookmark-text").select();
  }, "복사했습니다. 북마크 수정 창의 URL 칸에 붙여넣어 주세요."));
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
    }, "주소를 복사했습니다. 다른 컴퓨터에서 이 주소를 열어 주세요.");
  });
})();
