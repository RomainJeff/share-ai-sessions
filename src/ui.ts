import type { ProjectSummary, SidebarSession } from "./navigation";

export type NavigationOptions = {
  active: "home" | "projects" | "sessions";
  projects: ProjectSummary[];
  breadcrumbs: { label: string; href?: string }[];
  email?: string;
  backHref?: string;
  backLabel?: string;
  currentProject?: string;
  /** In-progress sessions listed in the sidebar; omitted on pages that do not load them. */
  sidebar?: SidebarSession[];
  currentSession?: string;
  /** Detail page: title shown in the compact mobile bar once the header scrolls away; also adds the ⋯ options button. */
  compactTitle?: string;
};

/** All transcript and metadata values enter HTML through this text/attribute escape. */
export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const styles = `
/* shadcn/ui language, zinc theme. Mobile first: list = full-width cards; detail = messaging-style conversation, sticky action bar at the bottom. */
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
  /* Deliberately subtle code highlighting */
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
.btn[data-expired]{cursor:not-allowed}
svg.st{width:16px;height:16px;flex:none;color:var(--nav-accent,hsl(var(--foreground)))}
svg.st.is-done{color:var(--nav-good,hsl(var(--success)))}
svg.st .st-check{stroke:hsl(var(--background))}
.status-pill{align-self:flex-start;min-height:32px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);background:color-mix(in srgb,currentColor 9%,hsl(var(--background)));color:var(--nav-accent,hsl(var(--foreground)));border-radius:999px;padding:0 12px 0 8px;font:inherit;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:7px}
.status-pill.is-done{color:var(--nav-good,hsl(var(--success)))}
.status-pill .act{text-decoration:underline;text-underline-offset:3px}
.status-pill .act:before{content:"·";display:inline-block;margin-right:7px;opacity:.5;text-decoration:none}
button.status-pill{cursor:pointer}
button.status-pill:disabled{opacity:.5;cursor:wait}
@media(pointer:coarse){.status-pill{min-height:44px}}
.dhead.is-done h1{color:var(--nav-muted,hsl(var(--muted-foreground)))}

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

/* Detail */
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
/* Mobile: the one "Details" toggle also hides the side panels so the conversation gets the screen. */
.detail:has(.hmeta:not([open])) .side{display:none}
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

/* Messaging-style conversation (shadcn chat) */
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
.bubble{border-radius:12px;padding:10px 14px;overflow-wrap:anywhere;font-size:15px;max-width:100%;background:hsl(var(--muted));color:hsl(var(--foreground))}
.bubble>.md>:last-child{margin-bottom:0}
.meta-l a{color:inherit;text-decoration:underline;text-underline-offset:2px;text-decoration-color:hsl(var(--border))}
.answer,.say{min-width:0}
.tturn{display:flex;flex-direction:column;gap:12px;min-width:0;scroll-margin-top:64px}

/* Conversation header: title, turn navigation, detail level */
.chat-head{position:sticky;top:-2px;z-index:2;background:hsl(var(--card));display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:6px 0;margin-bottom:-8px}
.chat-head .chat-title{flex:1;margin:0;white-space:nowrap}
/* Turn rail: ticks on the left, titles on hover or focus, click = jump to prompt */
.transcript>:not(.chat-head,.turnrail){width:100%;max-width:820px;margin-inline:auto}
.transcript:has(.turnrail){padding-left:20px}
.turnrail{position:sticky;top:56px;z-index:3;align-self:flex-start;width:0;height:0;margin-bottom:-20px;outline:0}
.turnrail .ticks{position:absolute;left:-18px;top:0;display:flex;flex-direction:column;width:26px;max-height:min(50vh,360px);padding:6px 0;cursor:pointer}
.turnrail .ticks i{position:relative;flex:0 1 7px;min-height:1px}
.turnrail .ticks i::before{content:"";position:absolute;left:8px;top:50%;width:10px;height:2px;margin-top:-1px;border-radius:1px;background:hsl(var(--border));transition:width .15s,background .15s}
.turnrail .ticks i.on::before{width:14px;background:hsl(var(--foreground))}
.turnrail:is(:hover,:focus-within) .ticks i::before{background:hsl(var(--muted-foreground))}
.turnrail:is(:hover,:focus-within) .ticks i.on::before{background:hsl(var(--foreground))}
.rail-list{position:absolute;left:8px;top:0;width:min(340px,calc(100vw - 72px));max-height:min(60vh,440px);overflow-y:auto;margin:0;padding:6px;list-style:none;background:hsl(var(--card));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:var(--radius);box-shadow:0 8px 24px rgb(0 0 0 / .12);opacity:0;visibility:hidden;transform:translateX(-4px);transition:opacity .12s,transform .12s,visibility 0s .15s}
.turnrail:is(:hover,:focus-within) .rail-list{opacity:1;visibility:visible;transform:none;transition:opacity .12s,transform .12s}
.rail-list a{display:flex;gap:10px;align-items:baseline;min-height:32px;padding:6px 8px;border-radius:calc(var(--radius) - 2px);font-size:13px;color:hsl(var(--muted-foreground));text-decoration:none}
.rail-list a:hover,.rail-list a:focus-visible{background:hsl(var(--accent));color:hsl(var(--foreground))}
.rail-list a[aria-current]{color:hsl(var(--foreground));font-weight:500}
.rail-list .n{min-width:2ch;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:hsl(var(--muted-foreground))}
.rail-list .tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.levels{display:flex;padding:3px;background:hsl(var(--muted));border-radius:10px;gap:2px}
.levels button{min-height:32px;padding:0 10px;border:0;border-radius:8px;background:none;font-size:12.5px;font-weight:500;color:hsl(var(--muted-foreground));cursor:pointer}
.levels button[aria-pressed="true"]{background:hsl(var(--background));color:hsl(var(--foreground));box-shadow:var(--shadow-sm)}
[data-level="conv"] details.worked,#conversation:not([data-level="full"]) :is(.raw,.context){display:none}

details.reason,details.worked{font-size:14px;min-width:0}
details:is(.reason,.worked)>summary{cursor:pointer;color:hsl(var(--muted-foreground));display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;list-style:none;font-size:13px;font-weight:500;min-height:44px;padding:0 10px 0 6px;margin-left:-6px;border-radius:calc(var(--radius) - 2px)}
details:is(.reason,.worked)>summary:hover{background:hsl(var(--accent));color:hsl(var(--foreground))}
details:is(.reason,.worked)>summary::-webkit-details-marker{display:none}
details:is(.reason,.worked)>summary>svg{width:14px;height:14px;transition:transform .2s;rotate:-90deg}
details:is(.reason,.worked)[open]>summary>svg{transform:rotate(90deg)}
.rtxt{color:hsl(var(--muted-foreground))}.rtxt .md{font-size:13.5px;line-height:1.6}.rtxt .md>:last-child{margin-bottom:0}
.pill{display:inline-flex;align-items:center;font-size:12px;font-weight:500;line-height:20px;padding:0 8px;border-radius:999px;background:hsl(var(--muted));color:hsl(var(--muted-foreground))}
.pill.bad{background:hsl(var(--destructive) / .1);color:hsl(var(--destructive-text))}

/* Steps: one line per tool on a timeline */
details.worked>div{position:relative;display:flex;flex-direction:column;gap:2px;padding:4px 0 8px;min-width:0}
details.worked>div::before{content:"";position:absolute;left:19px;top:8px;bottom:8px;width:1px;background:hsl(var(--border))}
details.worked>div>:is(.say,.reason,.raw){position:relative;padding-left:42px}
details.worked>div>.say{padding-top:6px;padding-bottom:6px}
details.worked>div>.reason>summary{margin-left:0}
details.tool{position:relative;min-width:0;width:100%}
details.tool>summary{list-style:none;cursor:pointer;min-height:40px;padding:4px 8px;display:flex;gap:8px;align-items:center;min-width:0;border-radius:var(--radius);font-size:13px}
details.tool>summary:hover{background:hsl(var(--accent) / .6)}
details.tool>summary::-webkit-details-marker{display:none}
.ticon{display:grid;place-items:center;width:24px;height:24px;border-radius:6px;border:1px solid hsl(var(--border));background:hsl(var(--background));color:hsl(var(--muted-foreground));flex:none}
.ticon svg{width:14px;height:14px}
details.tool.err>summary .ticon{border-color:hsl(var(--destructive-text) / .35);color:hsl(var(--destructive-text));background:hsl(var(--destructive) / .08)}
.tverb{font-weight:500;flex:none}
.targ{font:12.5px var(--f-mono);color:hsl(var(--muted-foreground));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.tool.prose .targ{font:13px var(--f-sans)}
.tmeta{font-size:12px;color:hsl(var(--muted-foreground));flex:none;font-variant-numeric:tabular-nums}
.tmeta .bad{color:hsl(var(--destructive-text));font-weight:500}
.add{color:hsl(var(--c-add))}.del{color:hsl(var(--c-del))}
.tchev{color:hsl(var(--muted-foreground));flex:none;display:inline-flex;transition:transform .2s}
details[open]>summary .tchev{transform:rotate(180deg)}
details.tool>summary .tchev svg{width:14px;height:14px}
.tbody{padding:4px 0 10px 40px;display:flex;flex-direction:column;gap:8px;min-width:0}
.tbody h4{margin:0;font-size:12px;color:hsl(var(--muted-foreground));font-weight:500}
.tlist{padding-left:22px;display:flex;flex-direction:column;gap:2px}
pre.code{margin:0;padding:10px 12px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 2px);font:12px/1.6 var(--f-mono);overflow:auto;white-space:pre;max-width:100%;max-height:300px;-webkit-overflow-scrolling:touch}
pre.term{margin:0;padding:10px 12px;background:#18181b;color:#e4e4e7;border-radius:var(--radius);font:12px/1.6 var(--f-mono);overflow:auto;white-space:pre;max-height:360px}
.t-dim{color:#71717a}
pre.diff{margin:0;padding:6px 0;border:1px solid hsl(var(--border));border-radius:var(--radius);font:12px/1.6 var(--f-mono);overflow:auto;white-space:pre;max-height:360px}
pre.diff>span{display:block;padding:0 12px;min-width:max-content}
.da{background:hsl(var(--c-add) / .1);color:hsl(var(--c-add))}.dd{background:hsl(var(--c-del) / .1);color:hsl(var(--c-del))}.dh{color:hsl(var(--muted-foreground))}
.cut{display:block;color:hsl(var(--muted-foreground));font-style:italic}
.term .cut{color:#71717a}
.todo{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13.5px}
.todo li{display:flex;gap:8px;align-items:flex-start}
.todo .box{width:14px;height:14px;margin-top:3px;border:1px solid hsl(var(--border));border-radius:4px;flex:none}
.todo .completed{color:hsl(var(--muted-foreground));text-decoration:line-through}
.todo .completed .box{background:hsl(var(--foreground));border-color:hsl(var(--foreground))}
.todo .in_progress .box{border-color:hsl(var(--foreground));border-width:2px}

/* Markdown for prompts and answers */
.md{font-size:15px;line-height:1.65;overflow-wrap:anywhere;min-width:0}
.md>:first-child{margin-top:0}
.md :is(p,ul,ol,blockquote,.cb,.tblw){margin:0 0 12px}
.md>:last-child{margin-bottom:0}
.md h1{font-size:20px;line-height:1.35;margin:18px 0 10px}
.md h2{font-size:17px;line-height:1.4;margin:16px 0 8px}
.md :is(h3,h4,h5,h6){font-size:15px;line-height:1.4;margin:14px 0 6px}
.md :is(h1,h2,h3,h4,h5,h6){font-weight:600}
.md :is(ul,ol){padding-left:22px}
.md li{margin:4px 0}
.md li>:is(ul,ol){margin:4px 0 0}
.md li::marker{color:hsl(var(--muted-foreground))}
.md li:has(>input[type=checkbox]){list-style:none;margin-left:-20px}
.md input[type=checkbox]{margin:0 6px 0 0;vertical-align:-2px}
.md a{text-decoration:underline;text-underline-offset:2px;color:hsl(217 91% 45%)}
.md blockquote{padding:2px 0 2px 14px;border-left:3px solid hsl(var(--border));color:hsl(var(--muted-foreground))}
.md hr{border:0;border-top:1px solid hsl(var(--border));margin:16px 0}
.md :not(pre)>code{font:13px var(--f-mono);background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:4px;padding:1px 5px}
.md-img{display:inline-flex;font-size:12px;border:1px solid hsl(var(--border));border-radius:6px;padding:2px 8px;color:hsl(var(--muted-foreground));background:hsl(var(--background))}
.cb{border:1px solid hsl(var(--border));border-radius:var(--radius);overflow:hidden;background:hsl(var(--muted) / .5)}
.cb-h{display:flex;align-items:center;justify-content:space-between;padding:0 4px 0 12px;border-bottom:1px solid hsl(var(--border));font-size:12px;color:hsl(var(--muted-foreground))}
.cb-h .mono{font:12px var(--f-mono)}
.cb .copy{min-height:32px;padding:0 8px;border:0;border-radius:6px;background:none;color:inherit;font-size:12px;cursor:pointer}
.cb .copy:hover{background:hsl(var(--accent));color:hsl(var(--foreground))}
.cb pre{padding:12px 14px;font:12.5px/1.7 var(--f-mono);overflow-x:auto;white-space:pre;overflow-wrap:normal}
.tblw{overflow-x:auto;border:1px solid hsl(var(--border));border-radius:var(--radius)}
.tblw table{border-collapse:collapse;font-size:14px;min-width:100%;overflow-wrap:normal}
.tblw th{text-align:left;font-weight:500;font-size:13px;color:hsl(var(--muted-foreground));background:hsl(var(--muted) / .5);border-bottom:1px solid hsl(var(--border));padding:8px 14px}
.tblw td{border-bottom:1px solid hsl(var(--border));padding:8px 14px;font-variant-numeric:tabular-nums}
.tblw tr:last-child td{border-bottom:0}
.hljs-keyword,.hljs-built_in,.hljs-selector-tag,.hljs-literal{color:hsl(262 83% 58%)}
.hljs-string,.hljs-attr,.hljs-template-tag{color:hsl(var(--c-str))}
.hljs-number,.hljs-variable,.hljs-type{color:hsl(173 80% 30%)}
.hljs-title,.hljs-function .hljs-title,.hljs-name,.hljs-section{color:hsl(217 91% 45%)}
.hljs-comment,.hljs-meta,.hljs-quote{color:hsl(var(--c-com))}
.hljs-addition{color:hsl(var(--c-add));background:hsl(var(--c-add) / .1)}.hljs-deletion{color:hsl(var(--c-del));background:hsl(var(--c-del) / .1)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) :is(.hljs-keyword,.hljs-built_in,.hljs-selector-tag,.hljs-literal){color:hsl(262 83% 76%)}
  :root:not([data-theme="light"]) :is(.hljs-number,.hljs-variable,.hljs-type){color:hsl(173 60% 55%)}
  :root:not([data-theme="light"]) :is(.hljs-title,.hljs-name,.hljs-section,.md a){color:hsl(213 94% 72%)}}

/* Toast (Sonner) */
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px));background:hsl(var(--background));color:hsl(var(--foreground));border:1px solid hsl(var(--border));box-shadow:var(--shadow-md);padding:12px 16px;border-radius:var(--radius);font-size:14px;font-weight:500;z-index:20;max-width:calc(100% - 32px)}
body.is-detail .toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}


/* SSR navigation and responsive filters. All user content can wrap. */
a{color:inherit;text-decoration:none}
a:hover{text-decoration:none}
a.badge:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,.ttl,.author,.facts span{overflow-wrap:anywhere}
pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 var(--f-mono);max-width:100%}
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
  .turn.me .col{max-width:min(78%,660px)}
  .chat-head{top:-20px;margin:-20px -20px -8px;padding:10px 20px;border-radius:var(--radius) var(--radius) 0 0}
}
@media(min-width:1000px){
  .field{font-size:14px}
  .panel>summary{min-height:44px}
  .detail{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "side" "chat";gap:16px 24px;align-items:start}
  .dhead{grid-area:head}.chat{grid-area:chat}
  .detail .side{grid-area:side;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:12px}
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
  --nav-tab:#ececf1;--nav-tab-on:#ffffff;--nav-av:#e2e2e8;
  --foreground:240 7% 14%;--muted-foreground:240 5% 47%;--border:240 14% 92%;
  --f-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mobile-nav-height:env(safe-area-inset-bottom,0px);color:var(--nav-ink)
}
@media(prefers-color-scheme:dark){body.has-navigation{
  --background:240 6% 10%;--card:240 6% 10%;--foreground:240 9% 94%;--muted:240 5% 15%;
  --muted-foreground:240 6% 68%;--border:240 6% 20%;--input:240 6% 20%;
  --nav-side:#141417;--nav-soft:#252529;--nav-ink:#ededf0;--nav-muted:#aaaab5;
  --nav-line:#303036;--nav-hover:#222226;--nav-accent:#b7a1ef;--nav-accent-soft:#30283f;--nav-good:#7dbea5;
  --nav-tab:#232327;--nav-tab-on:#34343a;--nav-av:#34343a
}}
.has-navigation .shell{min-height:100dvh;display:grid;grid-template-columns:288px minmax(0,1fr)}
.has-navigation .sidebar{position:sticky;top:0;height:100dvh;overflow-y:auto;background:var(--nav-side);border-right:1px solid var(--nav-line);padding:16px 12px 14px;display:flex;flex-direction:column;gap:14px}
.has-navigation .side-head{display:flex;align-items:center;gap:8px;padding-left:5px}
.has-navigation .sidebar .brand{display:flex;align-items:center;gap:10px;flex:1;min-height:36px;font-size:15px;font-weight:650;letter-spacing:-.3px}
.has-navigation .brand-icon{height:29px;width:29px;border:1px solid var(--nav-line);border-radius:9px;background:hsl(var(--background));display:grid;place-items:center}
.has-navigation .brand-icon svg{width:17px}
.has-navigation .project-dot{height:8px;width:8px;border-radius:3px;flex:none;background:var(--tone,var(--nav-accent))}
.has-navigation .violet{--tone:#8470bc;--tint:#f1edf9}.has-navigation .blue{--tone:#5987aa;--tint:#edf4f9}.has-navigation .green{--tone:#518c72;--tint:#edf5f0}.has-navigation .amber{--tone:#a58c55;--tint:#f8f4eb}.has-navigation .gray{--tone:#8d8d98;--tint:#f1f1f4}
.has-navigation .ib{display:inline-grid;place-items:center;width:36px;height:36px;border:0;border-radius:8px;background:none;color:var(--nav-muted);flex:none;cursor:pointer}
.has-navigation .ib:hover{background:var(--nav-tab);color:var(--nav-ink)}
.has-navigation .nav-toggle,.has-navigation .nav-close,.has-navigation .nav-backdrop{display:none}
.has-navigation .tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;padding:3px;background:var(--nav-tab);border-radius:10px}
.has-navigation .tabs a{display:flex;align-items:center;justify-content:center;gap:6px;min-height:36px;border-radius:7px;font-size:12px;font-weight:500;color:var(--nav-muted)}
.has-navigation .tabs a:hover{color:var(--nav-ink)}
.has-navigation .tabs a[aria-current=page]{background:var(--nav-tab-on);color:var(--nav-ink);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.has-navigation .tabs svg{width:14px;height:14px}
.has-navigation .side-sessions{display:flex;flex-direction:column;gap:2px;flex:1}
.has-navigation .side-label{padding:6px 12px;font-size:11px;font-weight:600;color:var(--nav-muted)}
.has-navigation .side-group{position:relative;margin-bottom:8px}
.has-navigation .side-group>details>summary{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 10px 0 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;list-style:none}
.has-navigation .side-group summary::-webkit-details-marker{display:none}
.has-navigation .side-group>details>summary:hover{background:var(--nav-tab)}
.has-navigation .gico{width:12px;height:12px;display:grid;place-items:center;flex:none}
.has-navigation .gname{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.has-navigation .gcount{font-size:11px;font-weight:500;color:var(--nav-muted);font-variant-numeric:tabular-nums}
.has-navigation .side-group .chev{margin-left:auto;width:14px;height:14px;color:var(--nav-muted);transition:transform .15s}
.has-navigation .side-group>details:not([open]) .chev{transform:rotate(-90deg)}
.has-navigation .gopen{position:absolute;right:30px;top:4px;width:32px;height:32px;opacity:0}
.has-navigation .gopen svg{width:14px;height:14px}
.has-navigation .side-group:hover .gopen,.has-navigation .gopen:focus-visible{opacity:1}
.has-navigation .side-session{display:flex;flex-direction:column;justify-content:center;gap:1px;min-height:52px;padding:6px 10px 6px 32px;border-radius:8px;position:relative;min-width:0}
.has-navigation .side-session:hover{background:var(--nav-tab)}
.has-navigation .side-session[aria-current=page]{background:var(--nav-accent-soft)}
.has-navigation .side-session[aria-current=page] .rt{color:var(--nav-accent)}
.has-navigation .side-session .dot{position:absolute;left:14px;top:20px;width:9px;height:9px;border-radius:50%;border:1.6px solid var(--nav-accent)}
.has-navigation .side-session .dot.live{background:var(--nav-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--nav-accent) 20%,transparent)}
.has-navigation .rl{display:flex;align-items:center;gap:6px;min-width:0}
.has-navigation .rt{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.has-navigation .rw,.has-navigation .rs{font-size:11px;color:var(--nav-muted);flex:none;font-variant-numeric:tabular-nums}
.has-navigation .rs{flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.has-navigation .rl .i{width:12px;height:12px;color:var(--nav-muted)}
.has-navigation .rl .avatar{width:16px;height:16px;font-size:8px;font-weight:600;background:var(--nav-av)}
.has-navigation .app{font-size:10px;font-weight:600;color:var(--nav-muted);border:1px solid var(--nav-line);border-radius:4px;padding:0 4px;line-height:15px;flex:none}
.has-navigation .gfoot{position:relative;min-height:32px}
.has-navigation .gfoot>.lk{position:absolute;right:6px;top:0}
.has-navigation .more>summary{padding-left:32px;list-style:none;width:max-content}
.has-navigation .more[open]>summary{display:none}
.has-navigation .lk{display:inline-flex;align-items:center;gap:4px;min-height:32px;font-size:12px;color:var(--nav-muted);cursor:pointer}
.has-navigation .lk:hover{color:var(--nav-accent)}
.has-navigation .lk .i{width:12px;height:12px}
.has-navigation .side-quiet{padding:0 12px}
.has-navigation .side-empty{padding:20px 16px;text-align:center;font-size:12px;color:var(--nav-muted)}
.has-navigation .side-empty b{display:block;font-size:13px;color:var(--nav-ink);margin-bottom:4px}
.has-navigation .profile{display:flex;align-items:center;gap:10px;padding:10px 4px 0 5px;border-top:1px solid var(--nav-line);min-width:0}
.has-navigation .profile small{flex:1;min-width:0;font-size:12px;color:var(--nav-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.has-navigation .profile .avatar{width:26px;height:26px;font-size:10px;font-weight:600;background:var(--nav-av)}
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
.has-navigation .mobile-brand{display:none}
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
.has-navigation .session-main{display:flex;gap:10px;align-items:flex-start}
.has-navigation .session-main>div{flex:1;min-width:0}
.has-navigation .session-main>.st{margin-top:2px}
.has-navigation .session-row.is-done{background:var(--nav-side)}
.has-navigation .session-row.is-done:hover{background:var(--nav-hover)}
.has-navigation .session-row.is-done .session-title:not(:hover){color:var(--nav-muted);font-weight:450}
.has-navigation .session-row.is-done .project-chip,.has-navigation .session-row.is-done .list-author{color:var(--nav-muted)}
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
.has-navigation .group-title{color:var(--nav-ink);font-size:15px;font-weight:600;letter-spacing:-.2px;margin:28px 0 10px;display:flex;align-items:center;gap:8px}
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
.has-navigation :is(.mtitle,.more-toggle,.tnav){display:none}
.has-navigation .dhead h1{font-size:27px;font-weight:620;letter-spacing:-.65px}
.has-navigation .detail .chat{border-radius:12px;box-shadow:none}
.has-navigation .detail .side{top:95px}
.has-navigation :is(a,button,input,select,summary):focus-visible{outline-color:var(--nav-accent)}
@media(min-width:1000px){.has-navigation .actionbar .in{padding-inline:0}}
@media(max-width:1150px){
  .has-navigation .shell{grid-template-columns:256px minmax(0,1fr)}
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
  .has-navigation .actionbar{left:256px}
  .has-navigation .detail .side{position:static}
}
@media(max-width:759px){
  .has-navigation .shell{display:block}
  .has-navigation .sidebar{position:fixed;inset:0 auto 0 0;z-index:20;width:min(330px,88vw);box-shadow:8px 0 24px rgba(0,0,0,.12);transform:translateX(-100%);visibility:hidden;transition:transform .2s,visibility .2s}
  .has-navigation.nav-open .sidebar{transform:none;visibility:visible}
  .has-navigation.nav-open .nav-backdrop{display:block;position:fixed;inset:0;z-index:19;background:rgba(9,9,11,.45)}
  .has-navigation.nav-open{overflow:hidden}
  .has-navigation .nav-toggle,.has-navigation .nav-close{display:inline-grid;width:44px;height:44px}
  .has-navigation .tabs a{min-height:40px;font-size:13px}
  .has-navigation .side-session{min-height:56px}
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
  .has-navigation .toolbar{gap:8px;margin-bottom:16px}.has-navigation .searchbox{max-width:none;flex-basis:100%;min-height:44px}
  .has-navigation .searchbox input{font-size:16px}.has-navigation .searchbox input::placeholder{font-size:12px}
  .has-navigation .toolbar select{min-height:44px;font-size:16px;max-width:100%;flex:1;min-width:0}
  .has-navigation .toolbar .sort{margin-left:0}
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
  .has-navigation.is-detail .content{padding-bottom:calc(88px + var(--mobile-nav-height))}
  .has-navigation .toast{bottom:calc(16px + var(--mobile-nav-height))}
  .has-navigation.is-detail .toast{bottom:calc(100px + var(--mobile-nav-height))}
  .has-navigation .dhead h1{font-size:24px}
  /* Conversation: one page scroll, compact sticky bar, secondary actions in bottom sheets. */
  .has-navigation.is-detail .topbar{min-height:52px;padding:4px;gap:0 4px;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-content:center}
  .has-navigation.is-detail .topbar .nav-toggle{grid-row:1/3}
  .has-navigation.is-detail .topbar .more-toggle{display:inline-grid;width:44px;height:44px;grid-column:3;grid-row:1/3}
  .has-navigation.is-detail .global-search{display:none}
  .has-navigation.is-detail .nav-back{grid-column:2;max-width:100%}
  .has-navigation.title-away .nav-back{min-height:0;font-size:11px}
  .has-navigation.title-away .mtitle{display:flex;grid-column:2;align-items:center;gap:6px;min-width:0;font-size:14px;font-weight:600;line-height:1.3}
  .has-navigation .mtitle span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .has-navigation .mtitle .st{width:12px;height:12px}
  .has-navigation .transcript{max-height:none;overflow:visible;padding:0}
  .has-navigation :is(.chat-head,.turnrail),.has-navigation .turn .avatar{display:none}
  .has-navigation .col{max-width:100%}
  .has-navigation .turn.me .col{max-width:86%}
  .has-navigation .turn.system{padding-left:0}
  .has-navigation .tturn{scroll-margin-top:60px}
  .has-navigation .tturn::before{content:attr(aria-label);font-size:11.5px;color:var(--nav-muted)}
  .has-navigation .tturn+.tturn{border-top:1px solid var(--nav-line);padding-top:14px}
  .has-navigation .actionbar{left:12px;right:12px;bottom:calc(12px + var(--mobile-nav-height));padding:6px;border:1px solid var(--nav-line);border-radius:16px;background:hsl(var(--background) / .94);backdrop-filter:blur(8px);box-shadow:0 8px 24px rgb(0 0 0 / .18);transition:transform .2s}
  .has-navigation.bar-away .actionbar{transform:translateY(calc(100% + 24px + var(--mobile-nav-height)))}
  .has-navigation .actionbar .in{align-items:center}
  .has-navigation .actionbar .btn:not(.primary){flex:none;width:44px;padding:0;gap:0;font-size:0}
  .has-navigation .tnav{display:flex;align-items:center;flex:none;background:var(--nav-soft);border-radius:11px}
  .has-navigation .tnav button{min-width:38px;height:44px;padding:0 4px;border:0;background:none;color:var(--nav-muted);display:grid;place-items:center;font:inherit;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}
  .has-navigation .tnav .tcount{color:var(--nav-ink);min-width:48px}
  .has-navigation .tnav .up svg{rotate:180deg}
  .has-navigation .turnpill{position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:7;max-width:calc(100% - 32px);padding:6px 12px;border-radius:999px;background:var(--nav-ink);color:hsl(var(--background));font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;box-shadow:0 4px 12px rgb(0 0 0 / .2)}
  .has-navigation .sheet{margin:auto 0 0;width:100%;max-width:none;max-height:85dvh;overflow-y:auto;border:0;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + var(--mobile-nav-height));background:hsl(var(--background));color:var(--nav-ink)}
  .has-navigation .sheet::backdrop{background:rgba(9,9,11,.45)}
  .has-navigation .sheet form{display:grid;gap:12px}
  .has-navigation .sheet h2{font-size:14px;margin:0}
  .has-navigation .sheet-stats{margin:0;font-size:12px;color:var(--nav-muted)}
  .has-navigation .sheet .levels button{flex:1;min-height:40px}
  .has-navigation .sheet .rail-list{position:static;width:auto;max-height:none;padding:0;border:0;box-shadow:none;background:none;opacity:1;visibility:visible;transform:none}
  .has-navigation .sheet .rail-list a{min-height:44px;align-items:center}
}
@media(prefers-color-scheme:dark){.has-navigation .folder-icon{background:var(--nav-soft)}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;


const icons = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  open: '<path d="M7 17L17 7M8 7h9v9"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
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
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13v1M15 13v1"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  think: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4"/>',
} as const;
export type IconName = keyof typeof icons;

/** SVG paths are static; metadata never enters SVG markup. */
export const icon = (name: IconName) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
/** Session status mark: half ring while active, filled check once done. Decorative inside a labelled control. */
export const statusIcon = (done: boolean, labelled = true) => `<svg class="st${done ? " is-done" : ""}" viewBox="0 0 16 16" ${labelled ? `role="img" aria-label="${done ? "Done" : "In progress"}"` : 'aria-hidden="true"'}>${done
  ? '<circle cx="8" cy="8" r="7" fill="currentColor"/><path class="st-check" d="M4.9 8.2l2.1 2.1 4.1-4.6" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  : '<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor"/>'}</svg>`;
/** Display name of the app hosting a relayed session. */
export const appName = (slug: unknown) => ({ t3code: "T3 Code" } as Record<string, string>)[String(slug)] ?? String(slug);
export const initials = (name: unknown) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((s) => Array.from(s)[0]).join("").toUpperCase();
export function author(name: unknown, email: unknown): string {
  return `<span class="author"><span class="avatar" aria-hidden="true">${escapeHtml(initials(name || email))}</span><span>${escapeHtml(name)}${name && email ? " · " : ""}${escapeHtml(email)}</span></span>`;
}
export function dateLabel(value: unknown, relative = false): string {
  const date = new Date(typeof value === "number" ? value : String(value));
  if (!Number.isFinite(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  const label = relative
    ? minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} d ago`
    : date.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
  return `<time datetime="${date.toISOString()}" title="${date.toISOString()}">${escapeHtml(label)}</time>`;
}

const tones = ["violet", "blue", "green", "amber", "gray"];
const LIVE_MS = 5 * 60000;
const SHOWN = 4;

/** Sidebar: in-progress sessions grouped by project, most recent sync first. Done sessions stay on project pages. */
function sidebarSessions(options: NavigationOptions): string {
  const rows = options.sidebar ?? [];
  const email = (options.email ?? "").toLowerCase();
  const groups = new Map<string, SidebarSession[]>();
  for (const s of rows) groups.set(s.project, [...(groups.get(s.project) ?? []), s]);
  const projectHref = (slug: string) => `/projects/${encodeURIComponent(slug)}`;
  const row = (s: SidebarSession) => {
    const other = s.owner_email.toLowerCase() !== email;
    return `<a class="side-session" href="/s/${encodeURIComponent(s.id)}"${options.currentSession === s.id ? ' aria-current="page"' : ""}>
      <span class="dot${s.last_synced_at > Date.now() - LIVE_MS ? " live" : ""}" aria-hidden="true"></span>
      <span class="rl"><span class="rt">${escapeHtml(s.title || s.id)}</span><span class="rw">${dateLabel(s.last_synced_at, true)}</span></span>
      <span class="rl">${other ? `<span class="avatar" title="${escapeHtml(s.owner_name || s.owner_email)}">${escapeHtml(initials(s.owner_name || s.owner_email))}</span>` : ""}${s.forked_from ? `<span title="Forked">${icon("branch")}</span>` : ""}<span class="rs mono">${escapeHtml(s.branch || s.repo || "")}</span>${s.external_app ? `<span class="app">${escapeHtml(appName(s.external_app))}</span>` : ""}</span></a>`;
  };
  const sections = [...groups].map(([slug, list]) => {
    const index = options.projects.findIndex((p) => p.slug === slug);
    const project = options.projects[index];
    const name = project?.name || slug;
    const done = project?.done ?? 0;
    const more = list.length - SHOWN;
    const foot = more > 0 || done ? `<div class="gfoot">${more > 0 ? `<details class="more"><summary class="lk">Show ${more} more</summary>${list.slice(SHOWN).map(row).join("")}</details>` : ""}${done ? `<a class="lk" href="${escapeHtml(projectHref(slug))}">${done} done${icon("next")}</a>` : ""}</div>` : "";
    // ponytail: groups always render open; persist collapse per viewer if people ask.
    return `<section class="side-group" aria-label="${escapeHtml(name)}"><details open><summary><span class="gico"><span class="project-dot ${tones[Math.max(index, 0) % tones.length]}"></span></span><span class="gname">${escapeHtml(name)}</span><span class="gcount">${list.length}</span>${icon("chev").replace('class="i"', 'class="i chev"')}</summary>
      ${list.slice(0, SHOWN).map(row).join("")}${foot}</details>
      <a class="ib gopen" href="${escapeHtml(projectHref(slug))}" aria-label="Open project ${escapeHtml(name)}">${icon("open")}</a></section>`;
  }).join("");
  const idle = options.projects.filter((p) => !groups.has(p.slug)).length;
  return `<div class="side-sessions"><div class="side-label">In progress · ${rows.length}</div>
    ${sections || `<div class="side-empty"><b>All sessions are done</b>Run <span class="mono">/share-session</span> in Claude Code to add one.<br><a class="lk" href="/sessions">Browse all sessions${icon("next")}</a></div>`}
    ${sections && idle ? `<a class="lk side-quiet" href="/projects">${idle} project${idle === 1 ? "" : "s"} with nothing in progress${icon("next")}</a>` : ""}</div>`;
}

function navigationShell(body: string, detail: boolean, options: NavigationOptions): string {
  const destinations = [
    { key: "home", href: "/", label: "Home", icon: "home" },
    { key: "projects", href: "/projects", label: "Projects", icon: "folder" },
    { key: "sessions", href: "/sessions", label: "All", icon: "chat" },
  ] as const;
  const links = destinations.map((item) => `<a href="${item.href}"${options.active === item.key ? ' aria-current="page"' : ""}>${icon(item.icon)}${item.label}</a>`).join("");
  const breadcrumbs = options.breadcrumbs.map((crumb, index) => `${index ? icon("back") : ""}${crumb.href
    ? `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a>`
    : `<span${index === options.breadcrumbs.length - 1 ? ' aria-current="page"' : ""}>${escapeHtml(crumb.label)}</span>`}`).join("");
  const back = detail && options.backHref
    ? `<a class="nav-back" data-list-back href="${escapeHtml(options.backHref)}" title="${escapeHtml(options.backLabel || "Back to sessions")}">${icon("back")}<span>${escapeHtml(options.backLabel || "Back to sessions")}</span></a>`
    : "";
  return `<a class="skip-link" href="#${detail ? "view" : "home"}">Skip to content</a>
<div class="shell"><aside class="sidebar" id="sidebar" aria-label="Shared space">
  <div class="side-head"><a class="brand" href="/"><span class="brand-icon">${icon("chat")}</span>Session Share</a><button class="ib nav-close" type="button" data-nav-toggle aria-label="Close menu">${icon("close")}</button></div>
  <nav class="tabs" aria-label="Main navigation">${links}</nav>
  ${sidebarSessions(options)}
  <div class="profile">${options.email ? `<span class="avatar" aria-hidden="true">${escapeHtml(initials(options.email))}</span><small title="${escapeHtml(options.email)}">${escapeHtml(options.email)}</small>` : "<small></small>"}<a class="ib" href="#share-help" aria-label="Share a session" title="Share a session">${icon("info")}</a></div>
</aside><div class="nav-backdrop" data-nav-toggle></div><div class="shell-main"><header class="topbar">
  <button class="ib nav-toggle" type="button" data-nav-toggle aria-controls="sidebar" aria-expanded="false" aria-label="Open menu">${icon("menu")}</button>
  ${back || `<a class="mobile-brand" href="/">${icon("chat")}Session Share</a>`}
  ${options.compactTitle ? `<span class="mtitle" aria-hidden="true">${options.compactTitle}</span><button class="ib more-toggle" type="button" data-sheet="more-sheet" aria-haspopup="dialog" aria-label="Session options">${icon("more")}</button>` : ""}
  <nav class="crumb" aria-label="Breadcrumb">${breadcrumbs}</nav>
  <form class="global-search" method="get" action="/sessions" role="search"><label class="sr" for="global-q">Search all sessions</label><input id="global-q" name="q" type="search" placeholder="Search sessions…"><button type="submit" aria-label="Search all sessions">${icon("search")}</button></form>
</header><main class="content" id="${detail ? "view" : "home"}" tabindex="-1">${body}
  <footer class="installation" aria-label="Install the Session Share skill"><details class="panel share-help" id="share-help"><summary>${icon("info")}Share a session<span class="tchev">${icon("chev")}</span></summary><div class="pb">
    <p>To share a conversation, add the skill in Claude (Settings → Capabilities → Skills) or unzip it into <code>~/.claude/skills/</code>, then run <code>/share-session</code>.</p>
    <a class="btn" href="/share-session.skill" download>Download the skill <span class="mono">share-session.skill</span></a>
  </div></details></footer>
</main></div></div>`;
}

export function page(title: string, body: string, status = 200, detail = false, options?: NavigationOptions): Response {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
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
// Mobile drawer: the sidebar slides over the page; Escape or the backdrop closes it.
const navToggles=document.querySelectorAll('[data-nav-toggle]');
const setNav=open=>{document.body.classList.toggle('nav-open',open);for(const b of navToggles)if(b.hasAttribute('aria-expanded'))b.setAttribute('aria-expanded',String(open));if(open)document.querySelector('.nav-close')?.focus();};
if(navToggles.length){
  for(const b of navToggles)b.addEventListener('click',()=>setNav(!document.body.classList.contains('nav-open')));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('nav-open')){setNav(false);document.querySelector('.nav-toggle')?.focus();}});
}
for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(button.dataset.copy);notify('Command copied');}
  catch{
    const command=document.getElementById('resume-command');
    if(command){command.closest('details').open=true;const range=document.createRange();range.selectNodeContents(command);const selection=window.getSelection();if(selection){selection.removeAllRanges();selection.addRange(range);}command.scrollIntoView({block:'center'});}
    notify('Copy unavailable: select the command and copy it manually.');
  }
});
const wide=window.matchMedia('(min-width:1000px)');
for(const info of document.querySelectorAll('[data-meta]')){info.open=wide.matches;wide.addEventListener('change',()=>{info.open=wide.matches;});}
// Bottom sheets (mobile session options and turn list): native modal dialogs, closed by Escape, a form button or a tap above.
for(const button of document.querySelectorAll('[data-sheet]'))button.addEventListener('click',()=>{
  const sheet=document.getElementById(button.dataset.sheet);sheet.showModal();sheet.querySelector('[aria-current]')?.scrollIntoView({block:'center'});
});
for(const sheet of document.querySelectorAll('dialog.sheet'))sheet.addEventListener('click',event=>{if(event.target===sheet&&event.clientY<sheet.getBoundingClientRect().top)sheet.close();});
// Mobile: the compact bar shows the title once the header has scrolled away.
const heading=document.querySelector('.dhead h1');
if(heading&&window.IntersectionObserver)new IntersectionObserver(([entry])=>document.body.classList.toggle('title-away',!entry.isIntersecting&&entry.boundingClientRect.top<0),{rootMargin:'-52px 0px 0px 0px'}).observe(heading);
const conversation=document.getElementById('conversation');
if(conversation){
  // Phones read the conversation in the page scroll; wider screens keep the bounded scroller.
  const mobile=window.matchMedia('(max-width:759px)');
  function sizeConversation(event){
    if(mobile.matches)return;
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
  // Level of detail, remembered per reader.
  const levels=document.querySelectorAll('[data-levels]');
  if(levels.length){
    let level='normal';try{level=localStorage.getItem('ss-level')||level;}catch{}
    const setLevel=value=>{conversation.dataset.level=value;for(const b of document.querySelectorAll('[data-levels] button'))b.setAttribute('aria-pressed',String(b.dataset.level===value));try{localStorage.setItem('ss-level',value);}catch{}};
    setLevel(level);
    for(const group of levels){group.hidden=false;group.addEventListener('click',event=>{const b=event.target.closest('[data-level]');if(b)setLevel(b.dataset.level);});}
  }
  for(const button of conversation.querySelectorAll('[data-copy-code]'))button.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(button.closest('.cb').querySelector('code').textContent);notify('Code copied');}catch{notify('Copy unavailable.');}
  });
  // Turn rail: ticks plus titles; the current turn follows the scroll, the page opens on the last turn.
  const turns=[...conversation.querySelectorAll('.tturn')];
  const head=conversation.querySelector('.chat-head');
  const rail=conversation.querySelector('[data-rail]');
  const topbar=document.querySelector('.topbar');
  const offset=()=>head?head.offsetHeight:0;
  // Programmatic jumps do not hide the action bar nor flash the turn pill.
  let jumpUntil=0;
  const goTo=(turn,smooth)=>{
    if(mobile.matches){jumpUntil=Date.now()+700;turn.scrollIntoView({behavior:smooth?'smooth':'auto'});return;}
    conversation.scrollTo({top:conversation.scrollTop+turn.getBoundingClientRect().top-conversation.getBoundingClientRect().top-offset(),behavior:smooth?'smooth':'auto'});
  };
  const atEnd=()=>mobile.matches?document.documentElement.scrollHeight-window.innerHeight-window.scrollY<24:conversation.scrollHeight-conversation.clientHeight-conversation.scrollTop<24;
  const readLine=()=>mobile.matches?(topbar?topbar.offsetHeight:0)+16:conversation.getBoundingClientRect().top+offset()+8;
  const currentTurn=()=>{
    if(atEnd())return turns.length-1;
    const top=readLine();
    let index=0;turns.forEach((turn,i)=>{if(turn.getBoundingClientRect().top<=top)index=i;});return index;
  };
  if(rail&&turns.length){
    // Rail (desktop) and turn sheet (mobile) list the same turns; both follow the scroll.
    const ticks=[...rail.querySelectorAll('.ticks i')],links=[...document.querySelectorAll('[data-turn-link]')];
    const count=document.querySelector('[data-turn-count]'),pill=document.querySelector('[data-turn-pill]');
    const titleOf=i=>rail.querySelector('[href="#t'+(i+1)+'"] .tt')?.textContent||'';
    let shown=-1,pillTimer;
    const update=()=>{
      const i=currentTurn();if(i===shown)return;
      ticks[shown]?.classList.remove('on');shown=i;ticks[i]?.classList.add('on');
      for(const link of links)if(link.getAttribute('href')==='#t'+(i+1))link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
      if(count)count.textContent=(i+1)+'/'+turns.length;
    };
    const place=()=>{rail.style.top=offset()+8+'px';};
    place();update();
    conversation.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',place);
    // Mobile: free page scroll; the counter and a short pill show where you are, the bar hides while reading down.
    let lastY=window.scrollY;
    window.addEventListener('scroll',()=>{
      if(!mobile.matches)return;
      update();
      const y=window.scrollY,delta=y-lastY;lastY=y;
      if(Date.now()<jumpUntil)return;
      if(delta>6&&y>80)document.body.classList.add('bar-away');
      else if(delta<-6||atEnd())document.body.classList.remove('bar-away');
      if(pill){pill.textContent=(shown+1)+'/'+turns.length+' · '+titleOf(shown);pill.hidden=false;clearTimeout(pillTimer);pillTimer=setTimeout(()=>{pill.hidden=true;},900);}
    },{passive:true});
    // ∧ first returns to the start of the current turn, then to the previous one; ∨ goes to the next.
    for(const button of document.querySelectorAll('[data-turn-step]'))button.addEventListener('click',()=>{
      const i=currentTurn(),step=Number(button.dataset.turnStep);
      const next=step<0&&turns[i].getBoundingClientRect().top<readLine()-40?i:i+step;
      if(turns[next])goTo(turns[next],true);
    });
    document.addEventListener('click',event=>{
      const link=event.target.closest('[data-turn-link]');if(!link)return;
      event.preventDefault();
      link.closest('dialog')?.close();
      const turn=document.getElementById(link.getAttribute('href').slice(1));
      if(turn)goTo(turn,true);
      history.replaceState(null,'',link.getAttribute('href'));
      link.blur();rail.blur();
    });
  }
  const target=/^#t\d+$/.test(location.hash)?document.getElementById(location.hash.slice(1)):null;
  const start=target&&conversation.contains(target)?target:turns.at(-1);
  if(start)goTo(start);else conversation.scrollTop=conversation.scrollHeight;
  if(!mobile.matches)conversation.scrollIntoView({block:'nearest'});
  window.addEventListener('resize',sizeConversation);
  window.visualViewport?.addEventListener('resize',sizeConversation);
  for(const panel of document.querySelectorAll('.side details,.hmeta'))panel.addEventListener('toggle',sizeConversation);
}
const moveForm=document.querySelector('[data-session-move]');
if(moveForm){
  // The mobile ⋯ sheet sends readers to the panel below the conversation header.
  document.querySelector('[data-move-open]')?.addEventListener('click',event=>{
    event.target.closest('dialog')?.close();
    const meta=document.querySelector('.hmeta');if(meta)meta.open=true;const panel=moveForm.closest('details');panel.open=true;panel.scrollIntoView({block:'start'});moveForm.querySelector('select')?.focus({preventScroll:true});
  });
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
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Move failed.');}
      window.location.reload();
    }catch(reason){error.textContent=reason instanceof Error?reason.message:'Move failed. Try again.';error.hidden=false;}
    finally{button.disabled=false;}
  });
}
// The status pill appears in the header and in the mobile options sheet; each reports errors next to itself.
for(const statusButton of document.querySelectorAll('[data-session-status]')){
  const error=statusButton.closest?.('dialog')?.querySelector('[data-status-error]')||document.querySelector('[data-status-error]');
  statusButton.disabled=false;
  statusButton.addEventListener('click',async()=>{
    statusButton.disabled=true;
    error.hidden=true;
    try{
      const response=await fetch('/api/sessions/'+encodeURIComponent(statusButton.dataset.sessionStatus)+'/status',{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:statusButton.dataset.status})
      });
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Update failed.');}
      window.location.reload();
    }catch(reason){error.textContent=reason instanceof Error?reason.message:'Update failed. Try again.';error.hidden=false;}
    finally{statusButton.disabled=false;}
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
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Update failed.');}
      window.location.reload();
    }catch(reason){error.textContent=reason instanceof Error?reason.message:'Update failed. Try again.';error.hidden=false;}
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
