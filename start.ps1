$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Users\Usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "C:\Users\Usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node"
}
if (-not (Test-Path -LiteralPath $pnpm)) {
  $pnpm = "pnpm"
}
Set-Location -LiteralPath $root
$env:NODE_OPTIONS = "--use-system-ca"
if (-not (Test-Path -LiteralPath (Join-Path $root "dist\index.html"))) {
  & $pnpm build
}
& $node .\server.cjs
