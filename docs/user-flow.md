# User flow

From a changed dbt model to a ship-or-fix decision, one CTE at a time. Each column is who does the step: you, CTE Diff in VS Code, or dbt on your warehouse. [Use it](usage.md) covers each step in detail.

<figure class="uf" markdown="0">
<svg viewBox="0 0 760 1200" role="img" aria-labelledby="uf-t uf-d">
  <title id="uf-t">CTE Diff user flow</title>
  <desc id="uf-d">You open two versions of a dbt model in a diff. CTE Diff marks each CTE. You pick one and preview or compare it. CTE Diff builds the query and dbt runs it on your warehouse. The panel shows the result. If the change isn't what you meant, you fix the SQL and pick the CTE again; otherwise you check the next CTE or ship.</desc>
  <defs>
    <marker id="uf-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="uf-head" d="M0 0 L10 5 L0 10 z"/></marker>
  </defs>
  <rect class="uf-pool" x="10" y="10" width="740" height="1180" rx="8"/>
  <path class="uf-lane-head" d="M18 10 H742 a8 8 0 0 1 8 8 V50 H10 V18 a8 8 0 0 1 8 -8 z"/>
  <line class="uf-rule" x1="10" y1="50" x2="750" y2="50"/>
  <line class="uf-rule" x1="330" y1="10" x2="330" y2="1190"/>
  <line class="uf-rule" x1="560" y1="10" x2="560" y2="1190"/>
  <text class="uf-lane c" x="170" y="31">You</text>
  <text class="uf-lane c" x="445" y="31">CTE Diff (VS Code)</text>
  <text class="uf-lane c" x="655" y="31">dbt + warehouse</text>
  <path class="uf-flow" d="M220 106 V132"/>
  <path class="uf-flow" d="M220 188 V250 H355"/>
  <path class="uf-flow" d="M445 285 V340 H295"/>
  <path class="uf-flow" d="M220 368 V396"/>
  <path class="uf-flow" d="M260 430 H445 V490"/>
  <path class="uf-flow" d="M220 464 V610 H355"/>
  <path class="uf-flow" d="M535 520 H655 V670"/>
  <path class="uf-flow" d="M535 610 H615 V670"/>
  <path class="uf-flow" d="M655 730 V790 H535"/>
  <path class="uf-flow" d="M355 790 H220 V852"/>
  <path class="uf-flow" d="M220 908 V936"/>
  <path class="uf-flow" d="M220 1004 V1036"/>
  <path class="uf-flow" d="M180 970 H130"/>
  <path class="uf-flow" d="M80 945 V340 H145"/>
  <path class="uf-join" d="M180 1070 H24 V340 H80"/>
  <path class="uf-flow" d="M220 1104 V1144"/>
  <text class="uf-small" x="270" y="422">Preview</text>
  <text class="uf-small" x="228" y="540">Compare</text>
  <text class="uf-small" x="228" y="1024">Yes</text>
  <text class="uf-small c" x="155" y="962">No</text>
  <text class="uf-small c" x="150" y="1062">Yes</text>
  <text class="uf-small" x="228" y="1128">No</text>
  <circle class="uf-start" cx="220" cy="90" r="16"/>
  <text x="246" y="94">Model changed</text>
  <rect class="uf-task" x="145" y="132" width="150" height="56" rx="8"/>
  <text class="c" x="220" y="152">Open the old and new</text>
  <text class="c" x="220" y="168">version in a diff</text>
  <rect class="uf-task" x="145" y="312" width="150" height="56" rx="8"/>
  <text class="c" x="220" y="340">Pick a CTE</text>
  <polygon class="uf-gw" points="220,396 260,430 220,464 180,430"/>
  <text class="uf-small" x="172" y="424" text-anchor="end">Preview or</text>
  <text class="uf-small" x="172" y="440" text-anchor="end">compare?</text>
  <rect class="uf-task" x="30" y="945" width="100" height="50" rx="8"/>
  <text class="c" x="80" y="970">Fix the SQL</text>
  <rect class="uf-task" x="145" y="852" width="150" height="56" rx="8"/>
  <text class="c" x="220" y="880">Read the result</text>
  <polygon class="uf-gw" points="220,936 260,970 220,1004 180,970"/>
  <text class="uf-small" x="270" y="974">As intended?</text>
  <polygon class="uf-gw" points="220,1036 260,1070 220,1104 180,1070"/>
  <text class="uf-small" x="270" y="1074">More CTEs to check?</text>
  <circle class="uf-end" cx="220" cy="1160" r="16"/>
  <text x="246" y="1164">Ship it</text>
  <rect class="uf-task" x="355" y="215" width="180" height="70" rx="8"/>
  <text class="c" x="445" y="234">Mark each CTE: changed,</text>
  <text class="c" x="445" y="250">new, removed, or reads</text>
  <text class="c" x="445" y="266">a changed CTE</text>
  <rect class="uf-task" x="355" y="490" width="180" height="60" rx="8"/>
  <text class="c" x="445" y="504">Build a preview query:</text>
  <text class="c" x="445" y="520">the CTE and the CTEs</text>
  <text class="c" x="445" y="536">it reads, one side</text>
  <rect class="uf-task" x="355" y="580" width="180" height="60" rx="8"/>
  <text class="c" x="445" y="602">Build a compare query:</text>
  <text class="c" x="445" y="618">both sides in one query</text>
  <rect class="uf-task" x="355" y="755" width="180" height="70" rx="8"/>
  <text class="c" x="445" y="774">Show the result: rows,</text>
  <text class="c" x="445" y="790">or the rows only one</text>
  <text class="c" x="445" y="806">side returns, with counts</text>
  <path class="uf-assoc" d="M535 815 L575 830"/>
  <path class="uf-bracket" d="M587 808 H575 V880 H587"/>
  <text class="uf-small" x="585" y="824">If dbt fails, the run is</text>
  <text class="uf-small" x="585" y="840">cancelled, or the warehouse</text>
  <text class="uf-small" x="585" y="856">can't compare, the panel</text>
  <text class="uf-small" x="585" y="872">says why instead.</text>
  <rect class="uf-task" x="575" y="670" width="160" height="60" rx="8"/>
  <text class="c" x="655" y="692">Run dbt show --inline</text>
  <text class="c" x="655" y="708">with your profile</text>
</svg>
<figcaption>Notation: BPMN, simplified. A circle starts or ends the flow, a box is a step, a diamond is a decision.</figcaption>
</figure>

Each click runs one query on your warehouse, and the rows go only from the warehouse to VS Code.
