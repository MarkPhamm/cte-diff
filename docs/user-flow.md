---
hide:
  - toc
---

# User flow

From a changed dbt model to a ship-or-fix decision, one CTE at a time. Each lane is who does the step: you, CTE Diff in VS Code, or dbt on your warehouse. [Use it](usage.md) covers each step in detail.

<figure class="uf" markdown="0">
<svg viewBox="0 0 1360 610" role="img" aria-labelledby="uf-t uf-d">
  <title id="uf-t">CTE Diff user flow</title>
  <desc id="uf-d">You open two versions of a dbt model in a diff. CTE Diff marks each CTE. You pick one and preview or compare it. CTE Diff builds the query and dbt runs it on your warehouse. The panel shows the result. If the change isn't what you meant, you fix the SQL and pick the CTE again; otherwise you check the next CTE or ship.</desc>
  <defs>
    <marker id="uf-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="uf-head" d="M0 0 L10 5 L0 10 z"/></marker>
  </defs>
  <rect class="uf-pool" x="10" y="10" width="1340" height="590" rx="8"/>
  <path class="uf-lane-head" d="M18 10 H46 V600 H18 a8 8 0 0 1 -8 -8 V18 a8 8 0 0 1 8 -8 z"/>
  <line class="uf-rule" x1="46" y1="10" x2="46" y2="600"/>
  <line class="uf-rule" x1="10" y1="260" x2="1350" y2="260"/>
  <line class="uf-rule" x1="10" y1="470" x2="1350" y2="470"/>
  <text class="uf-lane c" transform="translate(28,135) rotate(-90)">You</text>
  <text class="uf-lane c" transform="translate(28,365) rotate(-90)">CTE Diff (VS Code)</text>
  <text class="uf-lane c" transform="translate(28,535) rotate(-90)">dbt + warehouse</text>
  <path class="uf-flow" d="M111 175 H135"/>
  <path class="uf-flow" d="M215 203 V330"/>
  <path class="uf-flow" d="M308 365 H410 V203"/>
  <path class="uf-flow" d="M475 175 H505"/>
  <path class="uf-flow" d="M575 175 H702 V280"/>
  <path class="uf-flow" d="M540 210 V410 H610"/>
  <path class="uf-flow" d="M795 310 H905 V507"/>
  <path class="uf-flow" d="M795 410 H850 V507"/>
  <path class="uf-flow" d="M990 535 H1112 V400"/>
  <path class="uf-flow" d="M1112 330 V203"/>
  <path class="uf-flow" d="M1112 147 V105"/>
  <path class="uf-flow" d="M1077 70 H940"/>
  <path class="uf-flow" d="M800 70 H410 V147"/>
  <path class="uf-flow" d="M1147 70 H1195"/>
  <path class="uf-flow" d="M1265 70 H1294"/>
  <path class="uf-join" d="M1230 35 V20 H410 V70"/>
  <text class="uf-small" x="585" y="166">Preview</text>
  <text class="uf-small" x="548" y="300">Compare</text>
  <text class="uf-small c" x="1008" y="60">No</text>
  <text class="uf-small c" x="1171" y="60">Yes</text>
  <text class="uf-small c" x="1280" y="60">No</text>
  <text class="uf-small" x="1238" y="32">Yes</text>
  <circle class="uf-start" cx="95" cy="175" r="16"/>
  <text class="c" x="95" y="214">Model changed</text>
  <rect class="uf-task" x="135" y="147" width="160" height="56" rx="8"/>
  <text class="c" x="215" y="166">Open the old and new</text>
  <text class="c" x="215" y="184">version in a diff</text>
  <rect class="uf-task" x="345" y="147" width="130" height="56" rx="8"/>
  <text class="c" x="410" y="175">Pick a CTE</text>
  <polygon class="uf-gw" points="540,140 575,175 540,210 505,175"/>
  <text class="uf-small c" x="540" y="114">Preview or</text>
  <text class="uf-small c" x="540" y="130">compare?</text>
  <rect class="uf-task" x="800" y="47" width="140" height="46" rx="8"/>
  <text class="c" x="870" y="70">Fix the SQL</text>
  <rect class="uf-task" x="1042" y="147" width="140" height="56" rx="8"/>
  <text class="c" x="1112" y="175">Read the result</text>
  <polygon class="uf-gw" points="1112,35 1147,70 1112,105 1077,70"/>
  <text class="uf-small" x="1090" y="96" text-anchor="end">As intended?</text>
  <polygon class="uf-gw" points="1230,35 1265,70 1230,105 1195,70"/>
  <text class="uf-small c" x="1230" y="124">More CTEs</text>
  <text class="uf-small c" x="1230" y="140">to check?</text>
  <circle class="uf-end" cx="1310" cy="70" r="16"/>
  <text class="c" x="1310" y="108">Ship it</text>
  <rect class="uf-task" x="122" y="330" width="186" height="70" rx="8"/>
  <text class="c" x="215" y="348">Mark each CTE: changed,</text>
  <text class="c" x="215" y="365">new, removed, or reads</text>
  <text class="c" x="215" y="382">a changed CTE</text>
  <rect class="uf-task" x="610" y="280" width="185" height="60" rx="8"/>
  <text class="c" x="702" y="293">Build a preview query:</text>
  <text class="c" x="702" y="310">the CTE and the CTEs</text>
  <text class="c" x="702" y="327">it reads, one side</text>
  <rect class="uf-task" x="610" y="382" width="185" height="56" rx="8"/>
  <text class="c" x="702" y="401">Build a compare query:</text>
  <text class="c" x="702" y="419">both sides in one query</text>
  <rect class="uf-task" x="1015" y="330" width="195" height="70" rx="8"/>
  <text class="c" x="1112" y="348">Show the result: rows,</text>
  <text class="c" x="1112" y="365">or the rows only one</text>
  <text class="c" x="1112" y="382">side returns, with counts</text>
  <rect class="uf-task" x="820" y="507" width="170" height="56" rx="8"/>
  <text class="c" x="905" y="526">Run dbt show --inline</text>
  <text class="c" x="905" y="544">with your profile</text>
</svg>
<figcaption>Notation: BPMN, simplified. A circle starts or ends the flow, a box is a step, a diamond is a decision.</figcaption>
</figure>

If dbt fails, the run is cancelled, or the warehouse can't compare, the panel says why instead of showing rows. Each click runs one query on your warehouse, and the rows go only from the warehouse to VS Code.
