/** All transcript and metadata values enter HTML through this text/attribute escape. */
export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const styles = `
/* Langage shadcn/ui, thème zinc. Mobile first : liste = cartes pleine largeur ; détail = conversation façon messagerie, barre d'action collante en bas. */
:root{
  /* Tokens shadcn (HSL sans hsl()), palette zinc quasi monochrome */
  --background:0 0% 100%; --foreground:240 10% 3.9%;
  --card:0 0% 100%; --card-foreground:240 10% 3.9%;
  --primary:240 5.9% 10%; --primary-foreground:0 0% 98%;
  --secondary:240 4.8% 95.9%; --secondary-foreground:240 5.9% 10%;
  --muted:240 4.8% 95.9%; --muted-foreground:240 3.8% 46.1%;
  --accent:240 4.8% 95.9%; --accent-foreground:240 5.9% 10%;
  --destructive:0 72.2% 50.6%; --destructive-foreground:0 0% 98%; --destructive-text:0 72.2% 50.6%;
  --border:240 5.9% 90%; --input:240 5.9% 90%; --ring:240 5.9% 10%;
  --radius:0.5rem;
  /* Statuts discrets, hors palette neutre */
  --success:142.1 70.6% 40%; --warning:32 95% 38%; --warning-bg:48 96% 92%;
  --overlay:0 0% 0% / .5; --shadow-sm:0 1px 2px 0 rgb(0 0 0 / .05); --shadow-md:0 4px 12px -2px rgb(0 0 0 / .08);
  /* Coloration de code volontairement discrète */
  --c-str:25 60% 36%; --c-kw:240 5.9% 10%; --c-num:240 5% 34%; --c-com:240 3.8% 56%; --c-add:142.1 70.6% 30%; --c-del:0 72.2% 45%;
  --f-sans:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --background:240 10% 3.9%; --foreground:0 0% 98%;
  --card:240 10% 3.9%; --card-foreground:0 0% 98%;
  --primary:0 0% 98%; --primary-foreground:240 5.9% 10%;
  --secondary:240 3.7% 15.9%; --secondary-foreground:0 0% 98%;
  --muted:240 3.7% 15.9%; --muted-foreground:240 5% 64.9%;
  --accent:240 3.7% 15.9%; --accent-foreground:0 0% 98%;
  --destructive:0 62.8% 30.6%; --destructive-foreground:0 0% 98%; --destructive-text:0 84% 67%;
  --border:240 3.7% 15.9%; --input:240 3.7% 15.9%; --ring:240 4.9% 83.9%;
  --success:142.1 70.6% 45.3%; --warning:43 96% 60%; --warning-bg:38 60% 14%;
  --overlay:0 0% 0% / .7; --shadow-sm:0 1px 2px 0 rgb(0 0 0 / .3); --shadow-md:0 4px 12px -2px rgb(0 0 0 / .5);
  --c-str:30 80% 70%; --c-kw:0 0% 98%; --c-num:240 5% 78%; --c-com:240 5% 52%; --c-add:142.1 60% 58%; --c-del:0 84% 67%;
  color-scheme:dark}}

/* Base 375 px, cibles 44 px ; 760 px = tablette, 1000 px = bureau. */
*{box-sizing:border-box;border-color:hsl(var(--border))}
html{-webkit-text-size-adjust:100%}
body{background:hsl(var(--background));color:hsl(var(--foreground));font:14px/1.5 var(--f-sans);margin:0;-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss01"}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:12;background:hsl(var(--background))}
.gutter{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:1180px;margin:0 auto;min-width:0}
button,input,select{font:inherit;color:inherit}
input,select{font-size:16px}
button{cursor:pointer;-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid hsl(var(--ring));outline-offset:2px}
.mono{font-family:var(--f-mono);font-size:12px}
h1,h2,h3{text-wrap:balance;margin:0;font-weight:600;letter-spacing:-.025em}
svg.i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Barre d'app */
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:6;background:hsl(var(--background) / .95);backdrop-filter:blur(8px);border-bottom:1px solid hsl(var(--border))}
.bar .wrap{display:flex;align-items:center;gap:8px;min-height:60px;padding-block:8px}
.brand{font-weight:600;letter-spacing:-.025em;display:flex;align-items:center;gap:8px;white-space:nowrap;background:none;border:0;padding:0;font-size:15px;min-height:44px}
.brand .dot{width:20px;height:20px;border-radius:5px;background:hsl(var(--primary));display:inline-block}
.barback{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 12px 0 6px;margin-left:-6px;border:0;background:none;color:hsl(var(--foreground));font-weight:500;font-size:14px;border-radius:calc(var(--radius) - 2px)}
.barback:hover{background:hsl(var(--accent))}
body.is-detail .brand{display:none}
.host{display:none}
.host{color:hsl(var(--muted-foreground));font-size:13px}
.spacer{flex:1}

main{padding-block:20px 40px}
body.is-detail main{padding-bottom:calc(104px + env(safe-area-inset-bottom,0px))}

/* Input / Select shadcn (h-11 mobile, h-10 bureau) */
.field{min-height:44px;width:100%;min-width:0;background:hsl(var(--background));border:1px solid hsl(var(--input));border-radius:calc(var(--radius) - 2px);padding:0 12px;box-shadow:var(--shadow-sm)}
.field::placeholder{color:hsl(var(--muted-foreground))}
.field:focus-visible{outline:2px solid hsl(var(--ring));outline-offset:2px}

/* Button shadcn : default / secondary / outline / ghost / destructive */
.btn{min-height:44px;border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));border-radius:calc(var(--radius) - 2px);padding:0 16px;font-size:14px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;box-shadow:var(--shadow-sm);transition:background .15s,color .15s}
.btn:hover{background:hsl(var(--accent));color:hsl(var(--accent-foreground))}
.btn.primary{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-color:transparent}
.btn.primary:hover{background:hsl(var(--primary) / .9)}
.btn.secondary{background:hsl(var(--secondary));color:hsl(var(--secondary-foreground));border-color:transparent;box-shadow:none}
.btn.secondary:hover{background:hsl(var(--secondary) / .8)}
.btn.ghost{background:transparent;border-color:transparent;box-shadow:none}
.btn.ghost:hover{background:hsl(var(--accent))}

/* Liste */
.list-head{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
.list-head h1{font-size:24px;line-height:1.2}
.count{color:hsl(var(--muted-foreground));font-size:14px;font-variant-numeric:tabular-nums}
.searchrow{display:flex;gap:8px;min-width:0}
.searchrow .field{flex:1}
.fbtn{flex:none}
.fbtn .n{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-radius:calc(var(--radius) - 4px);font-size:12px;font-weight:600;line-height:20px;min-width:20px;padding:0 6px;text-align:center}

/* Card shadcn */
.cards{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.card{background:hsl(var(--card));color:hsl(var(--card-foreground));border:1px solid hsl(var(--border));border-radius:var(--radius);box-shadow:var(--shadow-sm);padding:16px;display:flex;flex-direction:column;gap:12px;cursor:pointer;min-width:0;transition:background .15s,border-color .15s}
.card:hover{background:hsl(var(--accent) / .5)}
.card:active{background:hsl(var(--accent))}
.card .top{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.card .ttl{font-weight:600;font-size:16px;line-height:1.35;letter-spacing:-.015em;flex:1;min-width:0}
.card .when{font-size:12px;color:hsl(var(--muted-foreground));white-space:nowrap;font-variant-numeric:tabular-nums}
.card .sum{color:hsl(var(--muted-foreground));margin:0;overflow-wrap:anywhere;font-size:14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .facts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:hsl(var(--muted-foreground));align-items:center;min-width:0}
.card .facts>span{display:inline-flex;gap:6px;align-items:center;min-width:0;overflow-wrap:anywhere}
.card .facts svg{width:14px;height:14px}
.card .foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-top:1px solid hsl(var(--border));padding-top:12px}
.empty{padding:40px 16px;text-align:center;color:hsl(var(--muted-foreground));grid-column:1/-1;border:1px dashed hsl(var(--border));border-radius:var(--radius)}

/* Badge shadcn : secondary (tags) / outline (statuts, projet, fork) */
.chip,.badge{font-size:12px;font-weight:500;line-height:18px;padding:1px 8px;border-radius:calc(var(--radius) - 2px);display:inline-flex;gap:6px;align-items:center;max-width:100%;white-space:nowrap}
.chip{background:hsl(var(--secondary));color:hsl(var(--secondary-foreground));border:1px solid transparent}
.chip.mono{font-family:var(--f-mono);font-size:11.5px}
.badge{border:1px solid hsl(var(--border));color:hsl(var(--foreground));background:transparent;overflow-wrap:anywhere}

/* Avatar shadcn : rond, initiales sur bg-muted */
.avatar{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;font-size:11px;font-weight:500;flex:none;background:hsl(var(--muted));color:hsl(var(--foreground))}
.avatar.lg{width:32px;height:32px;font-size:12px}
.av-ai{background:hsl(var(--primary));color:hsl(var(--primary-foreground))}
.author{display:inline-flex;gap:6px;align-items:center;min-width:0;overflow-wrap:anywhere}

/* Détail */
.detail{display:flex;flex-direction:column;gap:16px;min-width:0}
.dhead{display:flex;flex-direction:column;gap:12px;min-width:0}
.dhead h1{font-size:22px;line-height:1.25}
.dhead .sum{color:hsl(var(--muted-foreground));max-width:70ch;margin:0;font-size:15px;overflow-wrap:anywhere}
.dhead .line{display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-width:0;font-size:13px}
.dhead .line>.author{margin-right:6px}
.dhead .chip,.dhead .badge{white-space:normal;overflow-wrap:anywhere}
.dhead .badge:has(a){flex-wrap:wrap}
.dhead .badge a{display:inline-flex;align-items:center;min-height:44px;min-width:0;text-decoration:underline;text-underline-offset:3px}
.dhead .chip svg,.dhead .badge svg{flex:none;width:12px;height:12px}
.ro-note{font-size:13px;color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:var(--radius);padding:12px 14px;margin:0;background:hsl(var(--muted) / .5)}

/* Collapsible / Accordion shadcn */
.side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}
.side:has(>.panel[open]){grid-template-columns:minmax(0,1fr)}
.panel{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:var(--radius);box-shadow:var(--shadow-sm);min-width:0}
.panel>summary{list-style:none;cursor:pointer;min-height:48px;padding:0 16px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:hsl(var(--foreground));border-radius:var(--radius)}
.panel>summary:hover{text-decoration:underline;text-underline-offset:4px}
.panel>summary::-webkit-details-marker{display:none}
.panel>summary .cnt{font-size:12px;font-weight:500;color:hsl(var(--secondary-foreground));background:hsl(var(--secondary));border-radius:calc(var(--radius) - 2px);padding:0 8px;line-height:20px}
.panel>summary .tchev{margin-left:auto}
.panel[open]>summary .tchev{transform:rotate(180deg)}
.panel .pb{padding:4px 16px 16px;border-top:1px solid hsl(var(--border));padding-top:12px}
dl.meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;margin:0;font-size:13px}
dl.meta dt{color:hsl(var(--muted-foreground))}
dl.meta dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}

/* Barre d'action collante en bas (pouce) */
.actionbar{position:fixed;left:0;right:0;bottom:0;z-index:8;background:hsl(var(--background));border-top:1px solid hsl(var(--border));padding-top:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}
.actionbar .in{display:flex;gap:8px;max-width:1180px;margin:0 auto}
.actionbar .btn.primary{flex:1}


.cmd{display:flex;flex-direction:column;gap:8px;min-width:0}
.cmd code{display:block;min-width:0;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 2px);padding:10px 12px;overflow-x:auto;white-space:nowrap;user-select:all;font:12px/1.6 var(--f-mono)}

.hint{font-size:13px;color:hsl(var(--muted-foreground));margin:0}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row .btn{flex:1}

/* Conversation façon messagerie (chat shadcn) */
.chat{display:flex;flex-direction:column;gap:20px;min-width:0}
.transcript{max-height:max(8rem,calc(100vh - var(--transcript-top,20rem) - var(--transcript-bottom,104px)));max-height:max(8rem,calc(var(--transcript-viewport,100dvh) - var(--transcript-top,20rem) - var(--transcript-bottom,104px)));overflow-y:auto;overscroll-behavior-y:contain;scroll-margin-top:80px;scroll-margin-bottom:var(--transcript-bottom,104px);padding:2px}
.transcript>*{flex-shrink:0}
.turn{display:flex;gap:10px;align-items:flex-start;min-width:0}
.turn.me{flex-direction:row-reverse}
.col{display:flex;flex-direction:column;gap:6px;min-width:0;max-width:calc(100% - 42px)}
.turn.ai .col{flex:1}
.turn.me .col{align-items:flex-end}
.turn.system{color:hsl(var(--muted-foreground));padding-left:42px}
.turn.system .col{flex:1;max-width:100%}
.turn.system .bubble{font-size:13px;color:inherit}
.meta-l{font-size:12px;color:hsl(var(--muted-foreground));display:flex;gap:6px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.meta-l b{color:hsl(var(--foreground));font-weight:500}
.bubble{border-radius:var(--radius);padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:15px;max-width:100%}
.turn.me .bubble{background:hsl(var(--primary));color:hsl(var(--primary-foreground))}
.turn.ai .bubble{background:hsl(var(--muted));color:hsl(var(--foreground));align-self:flex-start}

details.reason,details.worked{font-size:14px;min-width:0}
details:is(.reason,.worked)>summary{cursor:pointer;color:hsl(var(--muted-foreground));display:inline-flex;gap:6px;align-items:center;list-style:none;font-size:13px;font-weight:500;min-height:44px;padding:0 10px 0 6px;margin-left:-6px;border-radius:calc(var(--radius) - 2px)}
details:is(.reason,.worked)>summary:hover{background:hsl(var(--accent));color:hsl(var(--foreground))}
details:is(.reason,.worked)>summary::-webkit-details-marker{display:none}
details:is(.reason,.worked)>summary svg{width:14px;height:14px;transition:transform .2s}
details:is(.reason,.worked)[open]>summary svg{transform:rotate(180deg)}
details.reason .rtxt{border-left:2px solid hsl(var(--border));padding:4px 0 4px 14px;color:hsl(var(--muted-foreground));white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;line-height:1.6}

details.worked>div{display:flex;flex-direction:column;gap:20px;padding-top:12px;min-width:0}

details.tool{border:1px solid hsl(var(--border));border-radius:var(--radius);background:hsl(var(--card));min-width:0;width:100%}
details.tool>summary{list-style:none;cursor:pointer;min-height:52px;padding:8px 12px 8px 8px;display:flex;gap:10px;align-items:center;min-width:0;border-radius:var(--radius)}
details.tool>summary:hover{background:hsl(var(--accent) / .5)}
details.tool>summary::-webkit-details-marker{display:none}
.ticon{display:grid;place-items:center;width:32px;height:32px;border-radius:calc(var(--radius) - 2px);background:hsl(var(--muted));color:hsl(var(--foreground));flex:none}
.tlabel{display:flex;flex-direction:column;min-width:0;flex:1;line-height:1.35}
.tlabel b{font-weight:500;font-size:14px;overflow-wrap:anywhere}
.tlabel span{font-family:var(--f-mono);font-size:11.5px;color:hsl(var(--muted-foreground));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tstate{font-size:12px;color:hsl(var(--muted-foreground));flex:none;max-width:7em;text-align:right;line-height:1.25;font-variant-numeric:tabular-nums}
.tstate.warn{color:hsl(var(--warning))}
.tchev{color:hsl(var(--muted-foreground));flex:none;display:inline-flex;transition:transform .2s}
details.tool[open] .tchev{transform:rotate(180deg)}
.tbody{border-top:1px solid hsl(var(--border));padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.tbody h4{margin:0;font-size:12px;color:hsl(var(--muted-foreground));font-weight:500}
pre.code{margin:0;padding:10px 12px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 2px);font:12px/1.6 var(--f-mono);overflow:auto;white-space:pre;max-width:100%;max-height:300px;-webkit-overflow-scrolling:touch}

/* Toast (Sonner) */
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px));background:hsl(var(--background));color:hsl(var(--foreground));border:1px solid hsl(var(--border));box-shadow:var(--shadow-md);padding:12px 16px;border-radius:var(--radius);font-size:14px;font-weight:500;z-index:20;max-width:calc(100% - 32px)}
body.is-detail .toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}


/* SSR navigation and responsive filters. All user content can wrap. */
a{color:inherit;text-decoration:none}
a:hover{text-decoration:none}
a.badge:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,.ttl,.author,.facts span{overflow-wrap:anywhere}
pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 var(--f-mono);max-width:100%}
pre.bubble{font-family:var(--f-sans)}
.chip,.badge{white-space:normal;overflow-wrap:anywhere}
.card .when{flex:none}
.card .facts>span>span{min-width:0}
.card .foot{margin-top:auto}
.filters{position:static;width:100%;max-width:none;margin:12px 0 0;padding:0;border:0;background:none;color:inherit;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.filters[open]{display:grid}
.filters .f{display:flex;flex-direction:column;gap:8px;font-size:14px;font-weight:500;min-width:0}
.filters .sh{display:none}
.filters .row{grid-column:1/-1}
.searchrow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.searchrow .search{grid-column:1/-1;min-width:0;position:relative}
.searchrow>.primary{grid-column:1/-1}
body.has-js .searchrow>.primary{grid-column:auto}
.search .i{position:absolute;left:12px;top:14px;color:hsl(var(--muted-foreground));pointer-events:none}
.search .field{padding-left:38px}
.fbtn{display:none}
.retention{display:flex;align-items:flex-start;gap:8px;margin:16px 0;font-size:13px;color:hsl(var(--muted-foreground))}
.retention>.i{margin-top:2px}
.share-help{margin-bottom:16px}
.share-help .pb{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.share-help p{margin:0;overflow-wrap:anywhere}
.pagination{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:20px;color:hsl(var(--muted-foreground));font-size:12px}
.pagination .btn{color:hsl(var(--foreground))}
.tchev{margin-left:auto}
.raw{margin-top:4px;max-width:100%;align-self:stretch}
.raw>summary{min-height:44px}
.empty{padding:40px 16px;text-align:center;color:hsl(var(--muted-foreground));border:1px dashed hsl(var(--border));border-radius:var(--radius)}
.chat-title{font-size:16px}
.side .cmd code{white-space:pre-wrap;overflow-wrap:anywhere}
.resume-help{display:flex;flex-direction:column;gap:12px}
.toast[hidden]{display:none}
body.has-js .filters:not([open]){display:none}
@media(max-width:759px){
  body.has-js .fbtn{display:inline-flex}
  body.has-js .filters[open]{position:fixed;inset:auto 0 0;width:100%;max-height:88vh;max-height:88dvh;margin:0;border:1px solid hsl(var(--border));border-radius:12px 12px 0 0;background:hsl(var(--background));padding:16px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));box-shadow:var(--shadow-md);overflow-y:auto;overscroll-behavior:contain}
  html:has(.filters:modal){overflow:hidden}
  body.has-js .filters .sh{display:flex;align-items:center;gap:8px}
  .filters .sh h2{flex:1;font-size:18px}
  .filters::backdrop{background:hsl(var(--overlay))}
}
@media(min-width:760px){
  .host{display:inline}
  body.is-detail .brand{display:flex}
  .barback{margin-left:8px}
  .list-head{flex-direction:row;align-items:baseline;gap:12px}
  .searchrow{grid-template-columns:minmax(0,1fr) auto}
  .searchrow .search,.searchrow>.primary{grid-column:auto}
  .filters[open]{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .card{padding:20px}
  .card .top{flex-direction:row;gap:12px}
  .card .when{padding-top:3px}
  .chat{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:var(--radius);box-shadow:var(--shadow-sm);padding:20px}
  .col{max-width:min(78%,660px)}
}
@media(min-width:1000px){
  .field{font-size:14px}
  details.tool>summary{min-height:48px}
  .panel>summary{min-height:44px}
  .detail{display:grid;grid-template-columns:minmax(0,1fr) 320px;grid-template-areas:"head head" "chat side";gap:24px;align-items:start}
  .dhead{grid-area:head}.chat{grid-area:chat}
  .side{grid-area:side;display:flex;flex-direction:column;gap:12px;position:sticky;top:calc(76px + env(safe-area-inset-top,0px))}
  body.is-detail main{padding-bottom:48px}
  body.is-detail .toast{bottom:calc(20px + env(safe-area-inset-bottom,0px))}
  .actionbar{position:static;background:none;border:0;padding:0}
  .actionbar .in{margin:0;max-width:none}
  .actionbar .btn.primary{flex:none;padding:0 18px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const icons = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
} as const;

/** SVG paths are static; metadata never enters SVG markup. */
export const icon = (name: keyof typeof icons) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
export const initials = (name: unknown) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((s) => Array.from(s)[0]).join("").toUpperCase();
export function author(name: unknown, email: unknown): string {
  return `<span class="author"><span class="avatar" aria-hidden="true">${escapeHtml(initials(name || email))}</span><span>${escapeHtml(name)}${name && email ? " · " : ""}${escapeHtml(email)}</span></span>`;
}
export function dateLabel(value: unknown, relative = false): string {
  const date = new Date(typeof value === "number" ? value : String(value));
  if (!Number.isFinite(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  const label = relative
    ? minutes < 60 ? `il y a ${minutes} min` : minutes < 1440 ? `il y a ${Math.floor(minutes / 60)} h` : `il y a ${Math.floor(minutes / 1440)} j`
    : date.toLocaleString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
  return `<time datetime="${date.toISOString()}" title="${date.toISOString()}">${escapeHtml(label)}</time>`;
}

export function page(title: string, body: string, status = 200, detail = false): Response {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${escapeHtml(title)}</title>
<style>${styles}</style></head>
<body${detail ? ' class="is-detail"' : ""}>
<header class="bar gutter"><div class="wrap">
<a class="brand" href="/"><span class="dot" aria-hidden="true"></span>Session Share</a>
${detail ? `<a class="barback" href="/">${icon("back")}Sessions</a>` : ""}
<span class="spacer"></span><span class="host">Claude Session Share</span>
</div></header>
<main class="gutter"><div class="wrap" id="${detail ? "view" : "home"}">${body}</div></main>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script nonce="${nonce}">
const toast=document.getElementById('toast');
let toastTimer;
function notify(message){toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},4000);}
for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(button.dataset.copy);notify('Commande copiée');}
  catch{
    const command=document.getElementById('resume-command');
    if(command){command.closest('details').open=true;const range=document.createRange();range.selectNodeContents(command);const selection=window.getSelection();if(selection){selection.removeAllRanges();selection.addRange(range);}command.scrollIntoView({block:'center'});}
    notify('Copie indisponible : sélectionnez la commande et copiez-la manuellement.');
  }
});
const info=document.querySelector('[data-sidebar-info]');
if(info){const wide=window.matchMedia('(min-width:1000px)');info.open=wide.matches;wide.addEventListener('change',()=>{info.open=wide.matches;});}
const conversation=document.getElementById('conversation');
if(conversation){
  function sizeConversation(event){
    const atBottom=conversation.scrollHeight-conversation.clientHeight-conversation.scrollTop<24;
    const viewport=window.visualViewport?.height??window.innerHeight;
    const actionbar=document.querySelector('.actionbar');
    const bottom=window.matchMedia('(min-width:1000px)').matches?24:(actionbar?actionbar.getBoundingClientRect().height:88)+16;
    const bounds=conversation.getBoundingClientRect();
    const previousViewport=parseFloat(conversation.style.getPropertyValue('--transcript-viewport'))||viewport;
    const previousBottom=parseFloat(conversation.style.getPropertyValue('--transcript-bottom'))||bottom;
    const wasVisible=bounds.top>=0&&bounds.bottom<=previousViewport-previousBottom+1;
    // Keep a useful reading area even with a long header or expanded metadata.
    const readingSpace=Math.min(264,viewport/2);
    const top=Math.max(0,Math.min(bounds.top,viewport-bottom-readingSpace));
    conversation.style.setProperty('--transcript-viewport',viewport+'px');
    conversation.style.setProperty('--transcript-top',top+'px');
    conversation.style.setProperty('--transcript-bottom',bottom+'px');
    if(atBottom)conversation.scrollTop=conversation.scrollHeight;
    if(atBottom&&wasVisible&&event?.type==='resize')conversation.scrollIntoView({block:'nearest'});
  }
  sizeConversation();
  conversation.scrollTop=conversation.scrollHeight;
  conversation.scrollIntoView({block:'nearest'});
  window.addEventListener('resize',sizeConversation);
  window.visualViewport?.addEventListener('resize',sizeConversation);
  for(const panel of document.querySelectorAll('.side details'))panel.addEventListener('toggle',sizeConversation);
}
const filters=document.getElementById('filters');
const toggle=document.querySelector('[data-filter-toggle]');
if(filters&&toggle&&typeof filters.showModal==='function'){
  document.body.classList.add('has-js');
  const desktop=window.matchMedia('(min-width:760px)');
  function syncFilters(){filters.close();filters.open=desktop.matches;toggle.setAttribute('aria-expanded',String(filters.open));}
  syncFilters();desktop.addEventListener('change',syncFilters);
  toggle.addEventListener('click',()=>{filters.showModal();toggle.setAttribute('aria-expanded','true');});
  document.querySelector('[data-filter-close]').addEventListener('click',()=>filters.close());
  filters.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
  filters.addEventListener('click',event=>{if(event.target===filters){const r=filters.getBoundingClientRect();if(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right)filters.close();}});
}
</script></body></html>`, { status, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
  } });
}
