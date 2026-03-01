// Agent Badge — CR-100 Identity Reader popup script

const lcdText = document.getElementById("lcd-text");
const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const ledRed = document.getElementById("led-red");
const ledYellow = document.getElementById("led-yellow");
const ledGreen = document.getElementById("led-green");
const swipeCard = document.getElementById("swipe-card");

// Tiny click sound encoded as base64 WAV
const clickSound = new Audio(
  "data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTEAAAAA//8AAAD//w=="
);

function clearLeds() {
  ledRed.classList.remove("active");
  ledYellow.classList.remove("active", "blink");
  ledGreen.classList.remove("active");
}

function setProcessing() {
  clearLeds();
  ledYellow.classList.add("blink");
  lcdText.className = "lcd-text idle";
  lcdText.textContent = "PROCESSING...";
}

function setGranted(agentName) {
  clearLeds();
  ledGreen.classList.add("active");
  clickSound.play().catch(() => {});

  // Trigger card swipe animation
  swipeCard.classList.remove("swiping");
  // Force reflow to restart animation
  void swipeCard.offsetWidth;
  swipeCard.classList.add("swiping");

  lcdText.className = "lcd-text connected";
  lcdText.textContent = "LINKED: " + agentName.toUpperCase();
}

function setDenied(errorMsg) {
  clearLeds();
  ledRed.classList.add("active");
  lcdText.className = "lcd-text error";
  lcdText.textContent = errorMsg
    ? "ERR: " + errorMsg.toUpperCase().slice(0, 30)
    : "NO LINK";
}

// Load saved key into input
chrome.storage.local.get("agentApiKey", (result) => {
  if (result.agentApiKey) {
    apiKeyInput.value = result.agentApiKey;
  }
  checkStatus();
});

saveBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.local.set({ agentApiKey: key }, () => {
    checkStatus();
  });
});

function checkStatus() {
  setProcessing();
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (response?.connected) {
      setGranted(response.agentName || "AGENT");
    } else {
      setDenied(response?.error);
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
