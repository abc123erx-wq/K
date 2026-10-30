// ═══════════════════════════════════════════════════════════════
// GAME EXPORTER — Download entire game as a single offline HTML file
// ═══════════════════════════════════════════════════════════════

export async function downloadGameHtmlFile() {
  try {
    // Attempt to download the current HTML document
    const html = document.documentElement.outerHTML;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Day_of_the_Undead.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("Failed to export game file:", err);
    return false;
  }
}
