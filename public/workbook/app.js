(function () {
  function track(name, params, custom) {
    if (window.cuTrack) window.cuTrack(name, params, custom);
  }
  // consent.js loads after this file, so wait for the page to finish loading.
  window.addEventListener("load", function () {
    track("ViewContent", { content_name: "Read Your Own Chart workbook" });
  });
  document.getElementById("dl-digital").addEventListener("click", function () {
    track("WorkbookDownload", { edition: "digital" }, true);
  });
  document.getElementById("dl-print").addEventListener("click", function () {
    track("WorkbookDownload", { edition: "print" }, true);
  });
})();
