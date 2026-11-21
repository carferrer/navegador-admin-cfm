import fs from 'node:fs';
const file='/opt/noVNC/index.html';
const html=fs.readFileSync(file,'utf8');
if(html.split('UI.start();').length!==2) throw Error('Unexpected noVNC entry point');
fs.writeFileSync(file,html.replace('UI.start();', 'UI.start();\n        import {installMobileZoom} from "./app/cfm-zoom.js";\n        installMobileZoom(UI);'));
