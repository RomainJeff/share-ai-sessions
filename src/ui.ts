import type { ProjectSummary } from "./navigation";

export type NavigationOptions = {
  active: "home" | "projects" | "sessions";
  projects: ProjectSummary[];
  breadcrumbs: { label: string; href?: string }[];
  email?: string;
  backHref?: string;
  backLabel?: string;
  currentProject?: string;
};

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

.project-card{cursor:default;overflow-wrap:anywhere}
.project-card .ttl a{text-decoration:underline;text-underline-offset:3px}
.project-settings{display:grid;gap:16px}
.project-settings form{display:grid;gap:12px}
.project-settings dd{margin:0;overflow-wrap:anywhere}
.project-settings .f{display:grid;gap:6px}
.project-settings [role=alert]{color:hsl(var(--destructive-text));overflow-wrap:anywhere}
.btn:disabled{opacity:.5;cursor:wait}

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
.hmeta{min-width:0}
.hmeta>summary{list-style:none;cursor:pointer;display:inline-flex;gap:6px;align-items:center;min-height:44px;font-size:13px;font-weight:500;color:hsl(var(--muted-foreground))}
.hmeta>summary::-webkit-details-marker{display:none}
.hmeta>summary svg{width:14px;height:14px;transition:transform .2s}
.hmeta[open]>summary svg{transform:rotate(180deg)}
.hmeta>:not(summary){margin-top:10px}
/* Mobile: the one "Détails" toggle also hides the side panels so the conversation gets the screen. */
@media(max-width:999px){.detail:has(.hmeta:not([open])) .side{display:none}}
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
  .hmeta>summary{display:none}.hmeta>summary+*{margin-top:0}
  .dhead{grid-area:head}.chat{grid-area:chat}
  .side{grid-area:side;display:flex;flex-direction:column;gap:12px;position:sticky;top:calc(76px + env(safe-area-inset-top,0px))}
  body.is-detail main{padding-bottom:48px}
  body.is-detail .toast{bottom:calc(20px + env(safe-area-inset-bottom,0px))}
  .actionbar{position:static;background:none;border:0;padding:0}
  .actionbar .in{margin:0;max-width:none}
  .actionbar .btn.primary{flex:none;padding:0 18px}
}
/* Approved navigation shell. Scoped tokens leave standalone/error pages compatible. */
body.has-navigation{
  --nav-side:#f7f7f9;--nav-soft:#f5f5f7;--nav-ink:#212126;--nav-muted:#71717c;
  --nav-line:#e9e9ee;--nav-hover:#fafafd;--nav-accent:#6e56b5;--nav-accent-soft:#f0ecfa;--nav-good:#368066;
  --foreground:240 7% 14%;--muted-foreground:240 5% 47%;--border:240 14% 92%;
  --f-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mobile-nav-height:calc(65px + env(safe-area-inset-bottom,0px));color:var(--nav-ink)
}
@media(prefers-color-scheme:dark){body.has-navigation{
  --background:240 6% 10%;--card:240 6% 10%;--foreground:240 9% 94%;--muted:240 5% 15%;
  --muted-foreground:240 6% 68%;--border:240 6% 20%;--input:240 6% 20%;
  --nav-side:#141417;--nav-soft:#252529;--nav-ink:#ededf0;--nav-muted:#aaaab5;
  --nav-line:#303036;--nav-hover:#222226;--nav-accent:#b7a1ef;--nav-accent-soft:#30283f;--nav-good:#7dbea5
}}
.has-navigation .shell{min-height:100dvh;display:grid;grid-template-columns:226px minmax(0,1fr)}
.has-navigation .sidebar{position:sticky;top:0;height:100dvh;overflow-y:auto;background:var(--nav-side);border-right:1px solid var(--nav-line);padding:25px 15px 16px;display:flex;flex-direction:column}
.has-navigation .sidebar .brand{display:flex;gap:11px;padding:0 10px;margin-bottom:30px;font-size:16px;font-weight:650;letter-spacing:-.4px}
.has-navigation .brand-icon{height:29px;width:29px;border:1px solid var(--nav-line);border-radius:9px;background:hsl(var(--background));display:grid;place-items:center}
.has-navigation .brand-icon svg{width:17px}
.has-navigation .nav{display:grid;gap:5px}
.has-navigation .nav a{padding:10px 11px;border-radius:7px;display:flex;gap:11px;align-items:center;color:var(--nav-muted);font-weight:500;font-size:13px;min-height:44px}
.has-navigation .nav a:hover{background:var(--nav-soft);color:var(--nav-ink)}
.has-navigation .nav a[aria-current=page]{background:var(--nav-accent-soft);color:var(--nav-accent)}
.has-navigation .side-section{margin-top:31px}
.has-navigation .side-label{display:flex;align-items:center;justify-content:space-between;margin:0 10px 9px;font-size:11px;color:var(--nav-muted);font-weight:550}
.has-navigation .side-label a{padding:6px 0}
.has-navigation .side-project{display:flex;align-items:center;gap:10px;border-radius:7px;padding:9px 11px;min-height:44px;font-size:13px;min-width:0}
.has-navigation .side-project:hover,.has-navigation .side-project.selected{background:var(--nav-soft)}
.has-navigation .side-project .project-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.has-navigation .side-project .count{margin-left:auto;font-size:11px}
.has-navigation .project-dot{height:8px;width:8px;border-radius:3px;flex:none;background:var(--tone,var(--nav-accent))}
.has-navigation .violet{--tone:#8470bc;--tint:#f1edf9}.has-navigation .blue{--tone:#5987aa;--tint:#edf4f9}.has-navigation .green{--tone:#518c72;--tint:#edf5f0}.has-navigation .amber{--tone:#a58c55;--tint:#f8f4eb}.has-navigation .gray{--tone:#8d8d98;--tint:#f1f1f4}
.has-navigation .sidebar-bottom{margin-top:auto;padding-top:35px}
.has-navigation .help-link{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--nav-muted);padding:10px;min-height:44px}
.has-navigation .profile{display:flex;align-items:center;gap:9px;margin-top:13px;padding:14px 9px 0;border-top:1px solid var(--nav-line);min-width:0}
.has-navigation .profile small{font-size:11px;display:block;color:var(--nav-muted);overflow-wrap:anywhere}
.has-navigation .shell-main{min-width:0}
.has-navigation .topbar{min-height:71px;padding:8px 42px;border-bottom:1px solid var(--nav-line);display:flex;align-items:center;gap:20px;position:sticky;top:0;z-index:6;background:hsl(var(--background) / .97);backdrop-filter:blur(8px)}
.has-navigation .crumb{display:flex;align-items:center;gap:9px;color:var(--nav-muted);font-size:12px;min-width:0}
.has-navigation .crumb span:last-child{color:var(--nav-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.has-navigation .crumb a{flex:none;min-height:44px;display:flex;align-items:center}
.has-navigation .crumb a:hover{color:var(--nav-accent)}
.has-navigation .crumb .i{width:12px;height:12px;transform:rotate(180deg)}
.has-navigation .global-search{margin-left:auto;display:flex;align-items:center;gap:8px;color:var(--nav-muted);min-width:220px;max-width:320px}
.has-navigation .global-search input{background:none;border:0;min-width:0;width:100%;font-size:12px;padding:10px 4px;min-height:40px}
.has-navigation .global-search button{border:0;background:none;padding:8px;display:grid;place-items:center;min-height:44px;min-width:44px}
.has-navigation .mobile-brand,.has-navigation .mobile-nav{display:none}
.has-navigation .content{width:100%;max-width:1220px;margin:0 auto;padding:39px 42px 68px;min-width:0}
.has-navigation .pagehead{display:flex;align-items:flex-start;gap:20px;margin-bottom:31px}
.has-navigation .pagehead h1{font-size:28px;font-weight:620;line-height:1.2;letter-spacing:-.85px}
.has-navigation .pagehead p{color:var(--nav-muted);font-size:13px;margin:8px 0 0}
.has-navigation .pagehead .btn{margin-left:auto}
.has-navigation .btn{min-height:36px;padding:7px 12px;font-size:12px;border-radius:7px;box-shadow:none}
.has-navigation .section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}
.has-navigation .section-head h2{font-size:15px;letter-spacing:-.25px;font-weight:600;display:flex;align-items:center;gap:9px}
.has-navigation .section-head .sub{font-size:11px;color:var(--nav-muted);font-weight:400}
.has-navigation .textlink{color:var(--nav-muted);font-size:12px;display:inline-flex;align-items:center;gap:4px;min-height:36px}
.has-navigation .textlink:hover{color:var(--nav-accent)}
.has-navigation .session-list{border:1px solid var(--nav-line);border-radius:12px;overflow:hidden}
.has-navigation .session-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 130px 86px;gap:18px;align-items:center;min-height:74px;padding:15px 19px;border-top:1px solid var(--nav-line);position:relative;transition:background .12s}
.has-navigation .session-row:first-child{border-top:0}.has-navigation .session-row:hover{background:var(--nav-hover)}
.has-navigation .session-row>div:first-child{min-width:0}
.has-navigation .session-title{font-weight:530;font-size:13px;letter-spacing:-.12px;display:block;line-height:1.4;overflow-wrap:anywhere}
.has-navigation .session-title:after{content:"";position:absolute;inset:0;z-index:1}
.has-navigation .session-title:hover{color:var(--nav-accent)}
.has-navigation .session-note{margin:5px 0 0;color:var(--nav-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65ch}
.has-navigation .project-chip{position:relative;z-index:2;justify-self:start;display:inline-flex;align-items:center;gap:6px;font-size:11px;border:1px solid var(--nav-line);border-radius:5px;padding:3px 7px;max-width:100%;background:hsl(var(--background));overflow-wrap:anywhere}
.has-navigation .project-chip:hover{border-color:var(--tone,var(--nav-accent));color:var(--nav-accent)}
.has-navigation .list-author,.has-navigation .list-author .author{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--nav-muted);min-width:0}
.has-navigation .list-author>span:last-child,.has-navigation .list-author .author>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.has-navigation .list-author .avatar{width:23px;height:23px;font-size:8px}
.has-navigation .when{font-size:11px;text-align:right;color:var(--nav-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.has-navigation .home-projects{margin-top:34px}
.has-navigation .project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
.has-navigation .project-card{padding:20px;border:1px solid var(--nav-line);border-radius:12px;position:relative;display:flex;flex-direction:column;min-height:166px;min-width:0;gap:0;box-shadow:none}
.has-navigation .project-card:hover{border-color:var(--tone,var(--nav-accent));background:var(--nav-hover)}
.has-navigation .project-settings .project-card{gap:12px;min-height:0}
.has-navigation .project-top{display:flex;align-items:center;gap:11px;min-width:0}
.has-navigation .folder-icon{width:33px;height:33px;border-radius:8px;background:var(--tint,var(--nav-accent-soft));color:var(--tone,var(--nav-accent));display:grid;place-items:center;flex:none}
.has-navigation .project-card h3{font-size:14px;letter-spacing:-.2px;font-weight:580;min-width:0;overflow-wrap:anywhere}
.has-navigation .project-card h3 a:after,.has-navigation .project-cell h3 a:after{content:"";position:absolute;inset:0;z-index:1}
.has-navigation .role{font-size:10px;color:var(--nav-muted);background:var(--nav-soft);padding:3px 7px;border-radius:4px;white-space:nowrap}
.has-navigation .project-top .role{margin-left:auto}
.has-navigation .project-description{font-size:12px;color:var(--nav-muted);margin:13px 0 0}
.has-navigation .project-card-bottom{display:flex;align-items:center;gap:15px;margin-top:auto;padding-top:20px;font-size:11px;color:var(--nav-muted)}
.has-navigation .project-card-bottom b{color:var(--nav-ink);font-weight:550}
.has-navigation .project-card-bottom .activity{margin-left:auto}
.has-navigation .last-session{padding-top:11px;border-top:1px solid var(--nav-line);margin-top:14px;display:flex;align-items:center;gap:7px;font-size:11px;color:var(--nav-muted);white-space:nowrap;overflow:hidden}
.has-navigation .last-session span{overflow:hidden;text-overflow:ellipsis}.has-navigation .last-session svg{width:13px;height:13px}
.has-navigation .footnote{font-size:11px;color:var(--nav-muted);display:flex;gap:7px;align-items:flex-start;margin-top:18px}
.has-navigation .footnote svg{width:13px;height:13px;flex:none;margin-top:2px}
.has-navigation .toolbar{display:flex;align-items:center;gap:10px;margin-bottom:19px;flex-wrap:wrap}
.has-navigation .searchbox{display:flex;align-items:center;gap:8px;background:hsl(var(--background));border:1px solid var(--nav-line);border-radius:7px;padding:0 11px;min-height:38px;max-width:330px;flex:1;min-width:170px}
.has-navigation .searchbox svg{width:15px;color:var(--nav-muted)}
.has-navigation .searchbox input{width:100%;min-width:0;border:0;background:none;font-size:12px;padding:9px 0}
.has-navigation .searchbox:focus-within{outline:2px solid var(--nav-accent);outline-offset:2px}
.has-navigation .searchbox input:focus-visible{outline:0}
.has-navigation .toolbar select{border:1px solid var(--nav-line);border-radius:7px;background:hsl(var(--background));padding:8px 27px 8px 10px;font-size:12px;min-height:38px;max-width:210px}
.has-navigation .toolbar .sort{margin-left:auto}
.has-navigation .segmented{display:flex;background:var(--nav-soft);padding:3px;border-radius:7px;gap:2px}
.has-navigation .segmented :is(button,a){font-size:11px;padding:6px 10px;min-height:32px;border:0;background:none;border-radius:5px;color:var(--nav-muted);display:flex;align-items:center}
.has-navigation .segmented .active{background:hsl(var(--background));color:var(--nav-ink);box-shadow:0 1px 3px #00000010}
.has-navigation .projects-table{border:1px solid var(--nav-line);border-radius:12px;overflow:hidden}
.has-navigation .project-table-head,.has-navigation .project-table-row{display:grid;grid-template-columns:minmax(0,1fr) 82px 88px 107px 88px;gap:18px;align-items:center;padding:14px 20px}
.has-navigation .project-table-head{font-size:10px;color:var(--nav-muted);background:var(--nav-hover)}
.has-navigation .project-table-row{position:relative;min-height:91px;border-top:1px solid var(--nav-line);font-size:12px}
.has-navigation .project-table-row:hover{background:var(--nav-hover)}
.has-navigation .project-cell{display:flex;align-items:center;gap:13px;min-width:0}
.has-navigation .project-cell h3{font-size:13px;font-weight:550;letter-spacing:-.12px;overflow-wrap:anywhere}
.has-navigation .project-cell p{font-size:11px;color:var(--nav-muted);margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px}
.has-navigation .project-cell>div:last-child{min-width:0}
.has-navigation .number{font-variant-numeric:tabular-nums}.has-navigation .mobile-count{display:none}.has-navigation .project-table-row .when{text-align:left}
.has-navigation .projecthead{margin-bottom:26px}
.has-navigation .project-title{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.has-navigation .project-title .folder-icon{width:44px;height:44px;border-radius:11px}
.has-navigation .project-title h1{font-size:30px;overflow-wrap:anywhere}
.has-navigation .project-info{display:flex;gap:17px;flex-wrap:wrap;color:var(--nav-muted);font-size:12px;margin:17px 0 0;align-items:center}
.has-navigation .project-info span{display:flex;align-items:center;gap:6px}
.has-navigation .project-tabs{display:flex;gap:27px;border-bottom:1px solid var(--nav-line);margin-bottom:24px;position:relative}
.has-navigation .project-tabs :is(button,a,summary){font-size:12px;min-height:44px;padding:0 1px;color:var(--nav-muted);position:relative;display:flex;align-items:center;gap:6px}
.has-navigation .project-tabs .active{color:var(--nav-ink);font-weight:550}
.has-navigation .project-tabs .active:after{content:"";height:2px;background:var(--nav-ink);position:absolute;bottom:-1px;left:0;right:0}
.has-navigation .project-members{position:relative}
.has-navigation .project-members>summary{cursor:pointer;list-style:none}
.has-navigation .project-members>summary::-webkit-details-marker{display:none}
.has-navigation .project-members>summary:after{content:"";width:5px;height:5px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(45deg);margin-left:3px;margin-top:-3px}
.has-navigation .project-members[open]>summary{color:var(--nav-ink)}
.has-navigation .project-members[open]>summary:after{transform:rotate(225deg);margin-top:3px}
.has-navigation .members-panel{position:absolute;top:calc(100% + 7px);left:0;width:400px;max-width:calc(100vw - 300px);z-index:9;box-shadow:var(--shadow-md);border-radius:10px;max-height:min(60vh,460px);overflow-y:auto;overscroll-behavior:contain}
.has-navigation .members-panel ul{list-style:none;margin:0;padding:6px 12px}
.has-navigation .members-panel li{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0;font-size:12px}
.has-navigation .members-panel li+li{border-top:1px solid var(--nav-line)}
.has-navigation .members-panel li>span:first-child{min-width:0;overflow-wrap:anywhere}
.has-navigation .members-panel .role{flex:none}
.has-navigation .group-title{color:var(--nav-muted);font-size:11px;font-weight:500;margin:24px 0 9px}
.has-navigation .project-sessions.in-project .session-row{grid-template-columns:minmax(0,1fr) 137px 67px 90px;min-height:86px}
.has-navigation .project-sessions .session-note{max-width:68ch}
.has-navigation .msg-count{font-size:11px;color:var(--nav-muted);text-align:right;white-space:nowrap}
.has-navigation .result-count{font-size:11px;color:var(--nav-muted);margin-bottom:8px}
.has-navigation .empty{border:1px dashed var(--nav-line);border-radius:12px;padding:55px 25px;text-align:center;display:grid;justify-items:center;gap:10px}
.has-navigation .empty h2{font-size:16px;font-weight:550;color:var(--nav-ink)}
.has-navigation .empty p{max-width:390px;font-size:12px;color:var(--nav-muted);margin:0}
.has-navigation .empty .btn{margin-top:7px}
.has-navigation .installation{margin-top:32px;border-top:1px solid var(--nav-line);padding-top:16px;color:var(--nav-muted);font-size:12px;scroll-margin-top:90px}
.has-navigation .installation .share-help{scroll-margin-top:90px;box-shadow:none;margin-bottom:0}
.has-navigation .installation summary{cursor:pointer;min-height:44px;display:flex;gap:8px;align-items:center;list-style:none}
.has-navigation .installation .pb{display:grid;justify-items:start;gap:10px;padding:12px 16px;max-width:72ch}
.has-navigation .installation p{margin:0}.has-navigation .installation code{font-family:var(--f-mono)}
.has-navigation .skip-link{position:fixed;left:16px;top:-100px;z-index:30;padding:10px 16px;background:hsl(var(--background));border:2px solid var(--nav-accent);border-radius:7px}
.has-navigation .skip-link:focus{top:12px}
.has-navigation .nav-back{display:inline-flex;align-items:center;min-height:44px;gap:5px;font-size:12px;color:var(--nav-muted);min-width:0;max-width:180px;flex:0 1 auto}
.has-navigation .nav-back span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.has-navigation.is-detail .content{padding-bottom:48px}
.has-navigation .dhead h1{font-size:27px;font-weight:620;letter-spacing:-.65px}
.has-navigation .detail .chat{border-radius:12px;box-shadow:none}
.has-navigation .detail .side{top:95px}
.has-navigation :is(a,button,input,select,summary):focus-visible{outline-color:var(--nav-accent)}
@media(min-width:1000px){.has-navigation .actionbar .in{padding-inline:0}}
@media(max-width:1150px){
  .has-navigation .shell{grid-template-columns:196px minmax(0,1fr)}
  .has-navigation .content{padding:30px 28px 60px}.has-navigation .topbar{padding-inline:28px}
  .has-navigation .session-row{grid-template-columns:minmax(0,1fr) 105px 83px;gap:12px}
  .has-navigation .recent .list-author,.has-navigation .all-projects .list-author{display:none}
  .has-navigation .project-table-head,.has-navigation .project-table-row{grid-template-columns:minmax(0,1fr) 60px 82px 88px;gap:12px}
  .has-navigation .project-table-head>:nth-child(3),.has-navigation .project-table-row>:nth-child(3){display:none}
  .has-navigation .project-sessions.in-project .session-row{grid-template-columns:minmax(0,1fr) 110px 77px;gap:12px}
  .has-navigation .project-sessions .msg-count{display:none}
  .has-navigation .project-card-bottom{gap:9px;flex-wrap:wrap}
  .has-navigation .crumb span:last-child{max-width:180px}
}
@media(min-width:760px) and (max-width:999px){
  .has-navigation.is-detail .content{padding-bottom:110px}
  .has-navigation .actionbar{left:196px}
  .has-navigation .detail .side{position:static}
}
@media(max-width:759px){
  .has-navigation .shell{display:block}.has-navigation .sidebar{display:none}
  .has-navigation .topbar{min-height:62px;padding:8px 20px;gap:10px}
  .has-navigation .mobile-brand{display:flex;align-items:center;gap:9px;font-weight:600;font-size:14px;letter-spacing:-.3px;min-height:44px;white-space:nowrap}
  .has-navigation .topbar .crumb{display:none}
  .has-navigation .global-search{min-width:0;max-width:150px;gap:0;flex:1}
  .has-navigation .global-search input{font-size:16px;padding-inline:4px;min-width:0}
  .has-navigation .global-search input::placeholder{font-size:11px}
  .has-navigation .global-search button{min-width:32px;padding-inline:6px}
  .has-navigation .global-search:focus-within{position:absolute;left:17px;right:17px;max-width:none;background:hsl(var(--background));border:1px solid var(--nav-line);border-radius:7px;padding:0 8px;z-index:7}
  .has-navigation .content{padding:27px 20px calc(32px + var(--mobile-nav-height))}
  .has-navigation .pagehead{margin-bottom:26px;gap:10px;flex-wrap:wrap}
  .has-navigation .pagehead h1{font-size:26px}.has-navigation .pagehead p{font-size:12px;max-width:38ch;line-height:1.65}
  .has-navigation .section-head h2{font-size:14px}.has-navigation .section-head .sub{display:none}
  .has-navigation .textlink{font-size:11px;min-height:44px}
  .has-navigation .session-list{border-radius:10px}
  .has-navigation .session-row{grid-template-columns:minmax(0,1fr) 63px;min-height:83px;padding:14px;gap:5px 10px}
  .has-navigation .recent .session-note{display:none}
  .has-navigation .session-title{font-size:12px;line-height:1.5}
  .has-navigation .session-row>div:first-child{grid-column:1;grid-row:1}
  .has-navigation .session-row .project-chip{grid-row:2;grid-column:1;font-size:10px;border:0;padding:0;background:none;justify-self:start;margin-top:4px}
  .has-navigation .session-row .when{grid-column:2;grid-row:1/3;font-size:10px;align-self:center}
  .has-navigation .session-row .list-author{display:none}
  .has-navigation .home-projects{margin-top:28px}.has-navigation .project-grid{grid-template-columns:1fr;gap:11px}
  .has-navigation .project-card{min-height:0;padding:17px}.has-navigation .project-card h3{font-size:13px}
  .has-navigation .last-session{display:none}.has-navigation .project-card-bottom{padding-top:15px}
  .has-navigation .mobile-nav{position:fixed;bottom:0;left:0;right:0;background:hsl(var(--background));border-top:1px solid var(--nav-line);display:flex;justify-content:space-around;height:var(--mobile-nav-height);padding:6px 6px calc(8px + env(safe-area-inset-bottom,0px));z-index:12}
  .has-navigation .mobile-nav a{display:grid;justify-items:center;gap:3px;color:var(--nav-muted);font-size:10px;padding:4px 17px;min-height:44px}
  .has-navigation .mobile-nav a[aria-current=page]{color:var(--nav-accent)}
  .has-navigation .mobile-nav svg{width:19px;height:19px}
  .has-navigation .toolbar{gap:8px;margin-bottom:16px}.has-navigation .searchbox{max-width:none;flex-basis:100%;min-height:44px}
  .has-navigation .searchbox input{font-size:16px}.has-navigation .searchbox input::placeholder{font-size:12px}
  .has-navigation .toolbar select{min-height:44px;font-size:16px;max-width:100%;flex:1;min-width:0}
  .has-navigation .toolbar .sort{margin-left:0}.has-navigation .segmented{margin-right:auto}
  .has-navigation .segmented :is(a,button){min-height:38px}
  .has-navigation .projects-table{border:0;border-radius:0;display:grid;gap:12px}
  .has-navigation .project-table-head{display:none}
  .has-navigation .project-table-row{border:1px solid var(--nav-line);border-radius:10px;padding:17px;grid-template-columns:1fr auto;gap:12px;min-height:0}
  .has-navigation .project-cell{grid-column:1/-1}.has-navigation .project-table-row>:nth-child(2){font-size:11px;color:var(--nav-muted)}
  .has-navigation .mobile-count{display:inline}.has-navigation .project-table-row>:nth-child(4){display:none}
  .has-navigation .project-table-row .when{grid-column:2;grid-row:2;text-align:right}
  .has-navigation .project-cell p{white-space:normal;font-size:11px;max-width:31ch}
  .has-navigation .project-title{gap:10px}.has-navigation .project-title h1{font-size:27px}
  .has-navigation .project-title .folder-icon{width:37px;height:37px}
  .has-navigation .project-info{gap:10px 15px;font-size:11px;margin-top:15px}
  .has-navigation .project-tabs{margin-bottom:19px}
  .has-navigation .project-members{position:static}
  .has-navigation .members-panel{left:0;right:0;width:auto;max-width:none}
  .has-navigation .project-sessions.in-project .session-row{grid-template-columns:minmax(0,1fr) 67px;gap:7px 10px;min-height:99px}
  .has-navigation .project-sessions .session-note{font-size:10px;max-width:100%}
  .has-navigation .project-sessions.in-project .list-author{display:flex;grid-row:2;grid-column:1;font-size:10px;margin-top:2px}
  .has-navigation .project-sessions.in-project .list-author .author{font-size:10px}
  .has-navigation .project-sessions.in-project .list-author .avatar{width:18px;height:18px;font-size:7px}
  .has-navigation .project-sessions .project-chip{grid-row:3;grid-column:1}
  .has-navigation .group-title{margin:20px 0 9px}
  .has-navigation .btn{min-height:44px}
  .has-navigation .footnote{font-size:10px}
  .has-navigation .nav-back{max-width:55%;font-size:12px}
  .has-navigation.is-detail .content{padding-bottom:calc(126px + var(--mobile-nav-height))}
  .has-navigation .actionbar{bottom:var(--mobile-nav-height);padding-bottom:12px}
  .has-navigation .toast{bottom:calc(16px + var(--mobile-nav-height))}
  .has-navigation.is-detail .toast{bottom:calc(100px + var(--mobile-nav-height))}
  .has-navigation .dhead h1{font-size:24px}
}
@media(prefers-color-scheme:dark){.has-navigation .folder-icon{background:var(--nav-soft)}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
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
  home: '<path d="M3 10l9-7 9 7v10H3zM9 20v-7h6v7"/>',
  users: '<path d="M3 21v-2a6 6 0 0112 0v2M17 4a4 4 0 010 8M21 21v-2a6 6 0 00-4-5"/><circle cx="9" cy="8" r="4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="M12 3l2 3 4-1 1 4 3 3-3 3-1 4-4-1-2 3-2-3-4 1-1-4-3-3 3-3 1-4 4 1z"/><circle cx="12" cy="12" r="3"/>',
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

function navigationShell(body: string, detail: boolean, options: NavigationOptions): string {
  const destinations = [
    { key: "home", href: "/", label: "Accueil", mobile: "Accueil", icon: "home" },
    { key: "projects", href: "/projects", label: "Projets", mobile: "Projets", icon: "folder" },
    { key: "sessions", href: "/sessions", label: "Toutes les sessions", mobile: "Sessions", icon: "chat" },
  ] as const;
  const links = (mobile = false) => destinations.map((item) => `<a href="${item.href}"${options.active === item.key ? ' aria-current="page"' : ""}>${icon(item.icon)}${mobile ? item.mobile : item.label}</a>`).join("");
  const breadcrumbs = options.breadcrumbs.map((crumb, index) => `${index ? icon("back") : ""}${crumb.href
    ? `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a>`
    : `<span${index === options.breadcrumbs.length - 1 ? ' aria-current="page"' : ""}>${escapeHtml(crumb.label)}</span>`}`).join("");
  const tones = ["violet", "blue", "green", "amber"];
  const projects = options.projects.filter((project) => project.last_synced_at !== null).slice(0, 4).map((project, index) => {
    const href = `/projects/${encodeURIComponent(project.slug)}`;
    const selected = options.currentProject === project.slug || options.breadcrumbs.some((crumb) => crumb.href === href) || options.backHref?.split("?")[0] === href;
    return `<a class="side-project${selected ? " selected" : ""}" href="${escapeHtml(href)}"><span class="project-dot ${tones[index]}" aria-hidden="true"></span><span class="project-name">${escapeHtml(project.name)}</span><span class="count">${escapeHtml(project.sessions)}</span></a>`;
  }).join("");
  const back = detail && options.backHref
    ? `<a class="nav-back" data-list-back href="${escapeHtml(options.backHref)}" title="${escapeHtml(options.backLabel || "Retour aux sessions")}">${icon("back")}<span>${escapeHtml(options.backLabel || "Retour aux sessions")}</span></a>`
    : "";
  return `<a class="skip-link" href="#${detail ? "view" : "home"}">Aller au contenu</a>
<div class="shell"><aside class="sidebar" aria-label="Espace partagé">
  <a class="brand" href="/"><span class="brand-icon">${icon("chat")}</span>Session Share</a>
  <nav class="nav" aria-label="Navigation principale">${links()}</nav>
  ${projects ? `<section class="side-section" aria-label="Projets récents"><div class="side-label">Projets récents <a href="/projects">Tous</a></div>${projects}</section>` : ""}
  <div class="sidebar-bottom"><a class="help-link" href="#share-help">${icon("info")}Partager une session</a>
    ${options.email ? `<div class="profile"><span class="avatar" aria-hidden="true">${escapeHtml(initials(options.email))}</span><small>${escapeHtml(options.email)}</small></div>` : ""}
  </div>
</aside><div class="shell-main"><header class="topbar">
  ${back || `<a class="mobile-brand" href="/">${icon("chat")}Session Share</a>`}
  <nav class="crumb" aria-label="Fil d’Ariane">${breadcrumbs}</nav>
  <form class="global-search" method="get" action="/sessions" role="search"><label class="sr" for="global-q">Rechercher dans toutes les sessions</label><input id="global-q" name="q" type="search" placeholder="Rechercher une session…"><button type="submit" aria-label="Rechercher dans toutes les sessions">${icon("search")}</button></form>
</header><main class="content" id="${detail ? "view" : "home"}" tabindex="-1">${body}
  <footer class="installation" aria-label="Installer le skill Session Share"><details class="panel share-help" id="share-help"><summary>${icon("info")}Partager une session<span class="tchev">${icon("chev")}</span></summary><div class="pb">
    <p>Pour partager une conversation, ajoutez le skill dans Claude (Paramètres → Capacités → Skills) ou dézippez-le dans <code>~/.claude/skills/</code>, puis lancez <code>/share-session</code>.</p>
    <a class="btn" href="/share-session.skill" download>Télécharger le skill <span class="mono">share-session.skill</span></a>
  </div></details></footer>
</main></div></div>
<nav class="mobile-nav" id="mobile-nav" aria-label="Navigation mobile">${links(true)}</nav>`;
}

export function page(title: string, body: string, status = 200, detail = false, options?: NavigationOptions): Response {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${escapeHtml(title)}</title>
<style>${styles}</style></head>
<body${options ? ` class="has-navigation${detail ? " is-detail" : ""}"` : detail ? ' class="is-detail"' : ""}>
${options ? navigationShell(body, detail, options) : `
<header class="bar gutter"><div class="wrap">
<a class="brand" href="/"><span class="dot" aria-hidden="true"></span>Session Share</a>
${detail ? `<a class="barback" href="/">${icon("back")}Sessions</a>` : ""}
<span class="spacer"></span><span class="host">Claude Session Share</span>
</div></header>
<main class="gutter"><div class="wrap" id="${detail ? "view" : "home"}">${body}</div></main>`}
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script nonce="${nonce}">
const toast=document.getElementById('toast');
let toastTimer;
function notify(message){toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},4000);}
const shareHelp=document.getElementById('share-help');
if(shareHelp){
  if(window.location?.hash==='#share-help')shareHelp.open=true;
  for(const link of document.querySelectorAll('[href="#share-help"]'))link.addEventListener('click',()=>{shareHelp.open=true;});
}
for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(button.dataset.copy);notify('Commande copiée');}
  catch{
    const command=document.getElementById('resume-command');
    if(command){command.closest('details').open=true;const range=document.createRange();range.selectNodeContents(command);const selection=window.getSelection();if(selection){selection.removeAllRanges();selection.addRange(range);}command.scrollIntoView({block:'center'});}
    notify('Copie indisponible : sélectionnez la commande et copiez-la manuellement.');
  }
});
const wide=window.matchMedia('(min-width:1000px)');
for(const info of document.querySelectorAll('[data-meta]')){info.open=wide.matches;wide.addEventListener('change',()=>{info.open=wide.matches;});}
const conversation=document.getElementById('conversation');
if(conversation){
  function sizeConversation(event){
    const atBottom=conversation.scrollHeight-conversation.clientHeight-conversation.scrollTop<24;
    const viewport=window.visualViewport?.height??window.innerHeight;
    const actionbar=document.querySelector('.actionbar');
    const mobileNav=document.getElementById('mobile-nav');
    const bottom=window.matchMedia('(min-width:1000px)').matches?24:(actionbar?actionbar.getBoundingClientRect().height:88)+(mobileNav?mobileNav.getBoundingClientRect().height:0)+16;
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
  for(const panel of document.querySelectorAll('.side details,.hmeta'))panel.addEventListener('toggle',sizeConversation);
}
const moveForm=document.querySelector('[data-session-move]');
if(moveForm){
  const button=moveForm.querySelector('button');
  const error=moveForm.querySelector('[data-move-error]');
  button.disabled=false;
  moveForm.addEventListener('submit',async event=>{
    event.preventDefault();
    button.disabled=true;
    error.hidden=true;
    try{
      const response=await fetch('/api/sessions/'+encodeURIComponent(moveForm.dataset.sessionMove)+'/project',{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:moveForm.elements.project.value})
      });
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Déplacement impossible.');}
      window.location.reload();
    }catch(reason){error.textContent=reason instanceof Error?reason.message:'Déplacement impossible. Réessayez.';error.hidden=false;}
    finally{button.disabled=false;}
  });
}
const projectSettings=document.querySelector('[data-project]');
if(projectSettings){
  const error=projectSettings.querySelector('[data-project-error]');
  async function saveMember(form,method){
    const buttons=projectSettings.querySelectorAll('button');
    for(const button of buttons)button.disabled=true;
    error.hidden=true;
    try{
      const email=form.dataset.email??form.elements.email.value.trim();
      const response=await fetch('/api/projects/'+encodeURIComponent(projectSettings.dataset.project)+'/members/'+encodeURIComponent(email),{
        method,headers:{'Content-Type':'application/json'},body:JSON.stringify(method==='PUT'?{role:form.elements.role.value}:{})
      });
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Erreur lors de la modification.');}
      window.location.reload();
    }catch(reason){error.textContent=reason instanceof Error?reason.message:'Modification impossible. Réessayez.';error.hidden=false;}
    finally{for(const button of buttons)button.disabled=false;}
  }
  for(const form of projectSettings.querySelectorAll('[data-project-member]')){
    for(const button of form.querySelectorAll('button'))button.disabled=false;
    form.addEventListener('submit',event=>{event.preventDefault();saveMember(form,'PUT');});
    form.querySelector('[data-remove]')?.addEventListener('click',()=>saveMember(form,'DELETE'));
  }
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
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
  } });
}
