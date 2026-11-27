const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

s = s.replace(/<style id="sb-layout-fix">[\s\S]*?<\/style>\s*/g, '');
s = s.replace(/<script id="sb-layout-js">[\s\S]*?<\/script>\s*/g, '');

const css = `<style id="sb-layout-fix">
#sb-ob-add-wrap{grid-column:1 / -1!important;width:100%!important;display:flex!important;flex-direction:column!important;gap:8px!important;margin:6px 0!important;position:static!important;float:none!important}
#sb-ob-add-wrap input,#sb-ob-add-wrap textarea{width:100%!important;max-width:100%!important;box-sizing:border-box!important;position:static!important;float:none!important}
</style>`;

const js = `<script id="sb-layout-js">
setInterval(function(){
  const w = document.getElementById("sb-ob-add-wrap");
  const form = document.getElementById("nexaBizForm");
  if (!w || !form) return;
  const lastRow = form.lastElementChild;
  if (lastRow && w.parentElement !== form) {
    form.insertBefore(w, lastRow);
  } else if (lastRow && w.nextElementSibling !== lastRow) {
    form.insertBefore(w, lastRow);
  }
}, 400);
</script>`;

s = s.replace('</body>', css + '\n' + js + '\n</body>');
fs.writeFileSync('server.js', s, 'utf8');
console.log('FIXED_FORM_ROW_OK');