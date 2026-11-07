# Settings

| Setting | Default | |
|---|---|---|
| `cteDiff.dbtPath` | empty | Path to `dbt`. Empty: the project's `.venv`, `~/.local/bin`, Homebrew, else `PATH`. |
| `cteDiff.projectDir` | empty | The dbt project to run in. Empty: the project holding the file, else the one in the workspace. |
| `cteDiff.target` | empty | The dbt target (`--target`). |
| `cteDiff.limit` | `100` | The most rows a preview fetches, and the most differing rows a comparison lists. |

## Buttons above a CTE in a diff

**▶ Preview** and **⇄ Compare sides** sit above each CTE. They are VS Code CodeLens, and a diff editor hides CodeLens unless your settings include:

```json
"diffEditor.codeLens": true
```

That line only shows those buttons. Hover a CTE in the **CTE Diff** sidebar, or use **⇄ Compare a CTE…** in the editor's title bar. Both work in any diff.
