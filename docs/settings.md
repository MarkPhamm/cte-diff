# Settings

| Setting | Default | |
|---|---|---|
| `cteDiff.dbtPath` | empty | Path to `dbt`. Empty: the project's `.venv`, `~/.local/bin`, Homebrew, else `PATH`. |
| `cteDiff.projectDir` | empty | The dbt project to run in. Empty: the project holding the file, else the one in the workspace. |
| `cteDiff.target` | empty | The dbt target (`--target`). |
| `cteDiff.limit` | `100` | The most rows a preview fetches, and the most differing rows a comparison lists. |
