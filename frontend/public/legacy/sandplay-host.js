/** Integration seam only: never reads or forwards a scene or localStorage. */
;(() => {
  const channel = "mind-island:sandplay-v15"
  document.documentElement.classList.add(
    "animal-cursor",
    "animal-cursor--force",
  )
  const brandTitle = document.querySelector(".brand-title")
  if (brandTitle) brandTitle.textContent = "沙盒"
  document.title = "沙盒 · 心理沙盘"
  const themeTabs = document.getElementById("themeTabs")
  const settings = document.getElementById("settings")
  if (themeTabs && settings) {
    // Move the original buttons so V15 keeps its module-scoped handlers and state.
    const group = document.createElement("div")
    group.className = "host-theme-setting"
    const label = document.createElement("p")
    label.textContent = "沙盘环境"
    group.append(label, themeTabs)
    settings.insertBefore(group, settings.querySelector(".setting-line"))
  }
  let status = "loading"
  const publish = (next) => {
    if (window.parent !== window)
      window.parent.postMessage(
        { channel, version: 1, status: next },
        window.location.origin,
      )
  }
  const report = (next) => {
    if (status === next) return
    status = next
    publish(next)
  }
  const checkReady = () => {
    if (status === "error") return
    if (
      !document.getElementById("loading") &&
      document.querySelector("#assets .asset")
    )
      report("ready")
  }
  window.addEventListener("error", () => report("error"), true)
  window.addEventListener("unhandledrejection", () => report("error"))
  document
    .getElementById("view")
    ?.addEventListener("webglcontextlost", () => report("error"))
  document
    .getElementById("view")
    ?.addEventListener("webglcontextrestored", checkReady)
  // V15 hides its settings button on narrow screens; expose the same control.
  window.addEventListener("message", (event) => {
    if (
      event.source === window.parent &&
      event.origin === window.location.origin &&
      event.data?.channel === channel &&
      event.data.version === 1
    ) {
      if (event.data.action === "open-settings")
        document.getElementById("settingsOpen")?.click()
      if (event.data.action === "status" && status !== "loading")
        publish(status)
    }
  })
  const observer = new MutationObserver(checkReady)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener("pagehide", () => observer.disconnect(), {
    once: true,
  })
  checkReady()
})()
