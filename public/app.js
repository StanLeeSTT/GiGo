const dateNode = document.querySelector("#today-date");
const statusNode = document.querySelector("#api-status");

if (dateNode) {
  dateNode.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date());
}

async function checkApi() {
  if (!statusNode) return;
  try {
    const response = await fetch("/api/v1/status", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("API unavailable");
    const payload = await response.json();
    if (payload?.data?.status !== "ok") throw new Error("Unexpected API response");
    statusNode.className = "api-status online";
    statusNode.innerHTML = "<i></i> API online";
  } catch {
    statusNode.className = "api-status offline";
    statusNode.innerHTML = "<i></i> API not connected";
  }
}

checkApi();
