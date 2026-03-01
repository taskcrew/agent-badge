// Agent Badge — popup script

const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("status-text");
const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");

// Load saved key into the input field
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
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (response?.connected) {
      statusEl.className = "status connected";
      statusTextEl.innerHTML =
        'Connected &mdash; <span class="agent-name">' +
        escapeHtml(response.agentName) +
        "</span>";
    } else {
      statusEl.className = "status disconnected";
      statusTextEl.textContent = response?.error
        ? "Error: " + response.error
        : "Disconnected";
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
