param(
  [int]$WarmGames=192,[int]$Rounds=3,[int]$SelfplayGames=128,[int]$Workers=2,
  [string]$Output='output/training/2026-10-06/run1',[switch]$Resume,
  [string]$HumanLink='data/training-link.json',[string]$HumanData='data/human-training',
  [string]$TorchPython=$env:TANGWU_TORCH_PYTHON
)
$ErrorActionPreference='Stop'
if(!$TorchPython) {
  $taskRuntime='D:\Comfy\Qwen-Standalone\ComfyUI\.venv\Scripts\python.exe'
  $TorchPython=if(Test-Path -LiteralPath $taskRuntime){$taskRuntime}else{'python'}
}
Push-Location $PSScriptRoot
try {
  $taskArgs=@('scripts/train-ai.py','--out',$Output,'--warm-games',$WarmGames,'--rounds',$Rounds,'--selfplay-games',$SelfplayGames,'--workers',$Workers)
  $taskArgs+=@('--human-link',$HumanLink,'--human-data',$HumanData)
  if($Resume){$taskArgs+='--resume'}
  & $TorchPython @taskArgs
  if($LASTEXITCODE -ne 0){throw 'TangWu training failed; see the training output.'}
} finally {Pop-Location}
