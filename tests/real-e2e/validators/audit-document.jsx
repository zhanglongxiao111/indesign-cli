(function () {
  function esc(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }

  function arr(values) {
    var out = [];
    for (var i = 0; i < values.length; i++) {
      out.push('"' + esc(values[i]) + '"');
    }
    return '[' + out.join(',') + ']';
  }

  try {
    if (app.documents.length === 0) {
      return '{"ok":false,"error":"NO_DOCUMENT"}';
    }
    var doc = app.activeDocument;
    var labels = [];
    var pageItems = doc.pageItems.everyItem().getElements();
    for (var i = 0; i < pageItems.length; i++) {
      if (pageItems[i].label) {
        labels.push(pageItems[i].label);
      }
    }
    var layers = [];
    for (var l = 0; l < doc.layers.length; l++) {
      layers.push(doc.layers[l].name);
    }
    var masters = [];
    for (var m = 0; m < doc.masterSpreads.length; m++) {
      masters.push(doc.masterSpreads[m].name);
    }
    return '{' +
      '"ok":true,' +
      '"document":{"name":"' + esc(doc.name) + '","pages":' + doc.pages.length + ',"spreads":' + doc.spreads.length + '},' +
      '"labels":{"count":' + labels.length + ',"items":' + arr(labels) + '},' +
      '"layers":' + arr(layers) + ',' +
      '"masters":' + arr(masters) + ',' +
      '"graphics":{"links":' + doc.links.length + '},' +
      '"styles":{"paragraph":' + doc.paragraphStyles.length + ',"character":' + doc.characterStyles.length + ',"object":' + doc.objectStyles.length + '}' +
      '}';
  } catch (e) {
    return '{"ok":false,"error":"' + esc(e.message) + '"}';
  }
})();
