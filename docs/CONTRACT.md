# Internal application contract

Native Node server on 127.0.0.1:4310, React/Vite built UI in dist. JSON state in data/workspace.json. No cloud service or API credentials required. No social network publishing.

## State

`{schemaVersion:1, revision:string, settings:{workspaceName,postReviewDays:7}, clients:[], accounts:[], campaigns:[], strategies:[], posts:[], metrics:[], assessments:[], reminders:[], practices:[], activity:[]}`

All records have unique `id` strings. All dates are YYYY-MM-DD (local calendar day); createdAt/updatedAt optional ISO timestamps. Numbers finite; positive reviewEveryDays.

- clients: `{id,name,industry,color,notes}`
- accounts: `{id,clientId,platform,handle,name,kpis:[{id,name,unit,direction:'increase'|'decrease'}]}`
- campaigns: `{id,clientId,name,objective,startDate,endDate,status:'active'|'planned'|'completed'|'paused',reviewEveryDays:30,nextReviewDate,goals:[{id,accountId,kpiId,periodDays?:number,baseline:number,target:number}]}`
- strategies: `{id,campaignId,name,hypothesis,changes,keep,status:'testing'|'promising'|'adopted'|'paused',reviewEveryDays:7,nextReviewDate,needsDetails?:true}` (needsDetails marks a strategy created with only a name; an "Add details" reminder shows until a hypothesis is saved)
- tactics: `{id,name,category?,description?,status?:'idea'|'testing'|'promising'|'proven'|'adopted'|'paused'}` (status is optional: when absent it follows the evidence from theories and videos; "adopted" is always the user's decision, separate from "proven") (specific choices in a video: a CTA in the first 2 minutes, a thumbnail style, a tone). Workspace-wide; deleting one that posts use is rejected until it is removed from them.
- theories: `{id,tacticId,accountId,kpiId,periodDays?,statement,startedAt,status:'testing'|'proven'|'disproven'|'paused',decidedAt?,note?}` (a tactic theory being tested: videos with the tactic uploaded on/after startedAt are the tests, judged against the median of videos without it; 5 tests with 80% beating that baseline can be marked proven)
- posts: `{id,campaignId?,accountId,strategyId?:string,tacticIds?:string[],tacticsLater?:true,strategyLater?:true,title,format:'Reel'|'Video'|'Post'|'Carousel'|'Story'|'Article',date,status:'planned'|'executed'|'cancelled',readiness:'needed'|'in-progress'|'ready',notes,url,executedAt?:YYYY-MM-DD,reviewAfterDays?:number}`
- metrics: `{id,accountId,kpiId,date,value:number,periodDays?:number,campaignId?:string,strategyId?:string,postId?:string,source?:string}` (no periodDays = running total as of date; periodDays = amount gained over that many days ending on date; a goal with periodDays tracks only metrics with the same periodDays) (values are observations/snapshots, not automatically summed across dates)
- assessments: `{id,entityType:'campaign'|'strategy'|'post',entityId,date,summary,different,same,better,worse,nextTest,rating:'positive'|'mixed'|'negative'}`
- reminders: `{id,title,date?:YYYY-MM-DD,campaignId?:string,type:'date'|'progress',goalId?:string,threshold?:number,comparison?:'below'|'above',done:boolean}` (progress is normalized baseline-to-target percent; date on progress optional means evaluate only on/after date)
- tasks: `{id,title,kind:'todo'|'assess'|'strategy'|'tactics'|'weekly-analysis'|'monthly-analysis',clientId?:string,dueDate?:YYYY-MM-DD,repeat?:'weekly'|'monthly',done:boolean,completedAt?:YYYY-MM-DD,notes?}` (user to-dos shown in the Overview Tasks panel beside auto-generated reminders; finishing a repeating task creates the next one)
- competitors: `{id,clientId,name,tier:'direct'|'indirect'|'aspirational',threat:'high'|'medium'|'low',channels:[{platform,handle?}],website?,positioning?,audience?,offer?,strengths?,weaknesses?,notes?}` (per-client competitor profile)
- benchmarks: `{id,competitorId,platform,date,followers?,postsPerWeek?,engagementRate?(0-100),avgViews?,source?}` (manually recorded public snapshot, at least one number; add a new row per refresh; the client's own row is computed from its accounts/posts, never stored; values are estimates)
- intel: `{id,clientId,competitorId?,date,category:'content'|'messaging'|'campaign'|'product'|'pricing'|'other',observation,implication?,source?}` (logged competitor move and its "so what")
- practices: `{id,clientId?:string,strategyId?:string,tacticId?:string,title,evidence,explanation,nextTest,confidence:'hypothesis'|'emerging'|'validated',source:'manual'|'codex'|'demo',createdAt?:ISO}`
- activity: `{id,at,description}` appended by server.

## HTTP API

- GET /api/state -> raw state above
- GET /api/health -> `{ok:true}`
- POST /api/mutate `{revision,operations:[{op:'upsert',collection,value}|{op:'delete',collection,id}]}` -> raw updated state. Optimistic concurrency; 409 on mismatch. Atomic queued write + backup. Validate all references, numbers, intervals, dates; prevent orphaning. Marking post executed creates executedAt date if absent. New assessment updates matching strategy/campaign nextReviewDate by its interval. Any client scope references must agree. No cascade deleting user data.
- POST /api/import/preview `{filename,content:base64,sheet?:string}` -> `{sheets:string[],sheet:string,columns:string[],rows:object[],totalRows:number}`. CSV/XLSX. Return limited preview rows? For commit use original content and selected sheet.
- POST /api/import/commit `{revision,filename,content:base64,sheet?:string,mapping:{date:string,value:string},accountId,kpiId,campaignId?:string,strategyId?:string,postId?:string}` -> `{state,imported,skipped}`. Validate all rows, deduplicate same dimensions/date/value, all-or-nothing. Dates: ISO, Excel date, D/M/YYYY or M/D/YYYY (order detected from the column, day-first when every date is ambiguous; mixed orders rejected), or "21 Sep 2026". Do not run formulas.
- GET /api/export -> download full JSON.
- GET /api/brief -> human-readable JSON brief (optional if implemented)

## Shared domain module (shared/domain.mjs)

Export `today()`, `addDays(date,days)`, `goalProgress(state,campaign,goal)` -> `{current,percent,expectedPercent,onTrack,history:[{date,value}],hasData}`; filter metrics to explicit campaign or unscoped account snapshots within campaign date range, exclude post/strategy-specific observations for account goal aggregates. Direction is encoded by target-baseline. Return newest numeric snapshot, baseline if none. `notifications(state,now=today())` -> array `{id,title,detail,date,severity:'overdue'|'due'|'upcoming',entityType,entityId}` with campaign/strategy scheduled reviews, executed post follow-up using latest assessment, due planned content, manual time/progress reminders. Upcoming limited next 7 days. `strategyPerformance(state,strategy)` -> `{score:number|null,samples:number,metrics:...}` compare strategy/post attributed observations against campaign matching KPI baselines, normalize as goal progress; label descriptive association, not causality. Domain functions browser-safe.

## Ownership

Root: package.json, src/, public/, index.html, vite.config.js, initial data seed, integration.
Backend agent: server/, shared/domain.mjs, tests/server.test.mjs, tests/domain.test.mjs.
Workflow/docs agent: scripts/, README.md, AGENTS.md, docs/ other than CONTRACT.md.
