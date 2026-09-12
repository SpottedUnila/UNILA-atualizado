(function(){
  "use strict";
  var input = document.getElementById("appSearchInput");
  var results = document.getElementById("appSearchResults");
  var clear = document.getElementById("appSearchClear");
  if (!input || !results) return;

  var aliases = {
    upa: "hospital hospitais emergência pronto atendimento saúde UPA",
    ru: "restaurante restaurantes universitário universitários alimentação comida RU",
    emergencia: "emergência polícia SAMU bombeiros telefone",
    enderecos: "endereço endereços campus localização",
    chat: "chat conversa mensagens comunidade",
    notas: "anotações notas lembretes",
    academicGoals: "meta metas acadêmica acadêmicas plano estudos",
    noticias: "notícias novidades",
    conheca: "conheça UNILA universidade",
    desapega: "achados perdidos desapega anúncios objetos"
  };

  function keyFor(button){
    if (button.dataset.searchKey) return button.dataset.searchKey;
    var match = (button.getAttribute("onclick") || "").match(/openDynamic\(['"]([^'"]+)/);
    if (match) return match[1];
    if ((button.getAttribute("onclick") || "").indexOf("chatPage") !== -1) return "chat";
    if ((button.getAttribute("onclick") || "").indexOf("notesPage") !== -1) return "notas";
    if ((button.getAttribute("onclick") || "").indexOf("AcademicGoals") !== -1) return "academicGoals";
    if ((button.getAttribute("onclick") || "").indexOf("loadNews") !== -1) return "noticias";
    if ((button.getAttribute("onclick") || "").indexOf("Conheca") !== -1) return "conheca";
    if ((button.getAttribute("onclick") || "").indexOf("desapegaPage") !== -1) return "desapega";
    return "";
  }

  function normalize(value){
    return String(value || "").toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function getEntries(){
    return Array.from(document.querySelectorAll("#home > button")).map(function(button){
      var key = keyFor(button);
      var label = button.textContent.replace(/\s+/g, " ").trim();
      return {button:button, key:key, label:label, haystack:normalize(label + " " + key + " " + (aliases[key] || ""))};
    }).filter(function(entry){ return entry.label; });
  }

  function hide(){ results.style.display = "none"; results.innerHTML = ""; }
  function render(){
    var query = normalize(input.value.trim());
    clear.style.display = query ? "block" : "none";
    if (!query) { hide(); return; }
    var found = getEntries().filter(function(entry){ return entry.haystack.indexOf(query) !== -1; }).slice(0, 12);
    results.innerHTML = "";
    if (!found.length) {
      results.innerHTML = '<div class="app-search-empty">Nenhum item encontrado.</div>';
    } else {
      found.forEach(function(entry){
        var item = document.createElement("button");
        item.type = "button";
        item.className = "app-search-result";
        item.setAttribute("role", "option");
        item.innerHTML = "<strong></strong><small>Toque para abrir</small>";
        item.querySelector("strong").textContent = entry.label;
        item.addEventListener("click", function(){
          hide();
          input.value = "";
          entry.button.click();
        });
        results.appendChild(item);
      });
    }
    results.style.display = "block";
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", function(event){
    if (event.key === "Escape") { input.value = ""; hide(); clear.style.display = "none"; }
    if (event.key === "Enter") {
      var first = results.querySelector(".app-search-result");
      if (first) first.click();
    }
  });
  clear.addEventListener("click", function(){ input.value = ""; input.focus(); hide(); clear.style.display = "none"; });
  document.addEventListener("click", function(event){ if (!event.target.closest("#appSearch")) hide(); });
})();
