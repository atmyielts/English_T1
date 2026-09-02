# Generates original synthetic-voice practice audio. Run once on Windows; checked-in WAVs ship with Platform.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$guideRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$guideAudioDirectory = [IO.Path]::GetFullPath((Join-Path $guideRoot 'apps/platform/public/guide-audio'))
if (-not $guideAudioDirectory.StartsWith($guideRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Audio path is outside the worktree' }
New-Item -ItemType Directory -Path $guideAudioDirectory -Force | Out-Null
$guideAudioScripts = @{
  'study-group.wav' = 'Hello. This is a message for the study group. Our meeting has moved from Wednesday to Thursday, at five thirty in the afternoon. We will use room four, not room twelve. Please bring a notebook. Printed practice materials will be provided.'
  'library-books.wav' = 'Hello. I am calling from the library about your books. The delivery was expected on Tuesday, but it will arrive a day earlier. You can collect the books after ten on Monday morning. The library opens at nine, but we need an hour to prepare the books.'
}
$guideSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $guideSpeaker.SelectVoice('Microsoft Zira Desktop')
  $guideSpeaker.Rate = -1
  foreach ($guideFilename in $guideAudioScripts.Keys) {
    $guideOutput = Join-Path $guideAudioDirectory $guideFilename
    if (Test-Path -LiteralPath $guideOutput) { throw "Refusing to overwrite existing audio: $guideFilename" }
    $guideSpeaker.SetOutputToWaveFile($guideOutput)
    $guideSpeaker.Speak($guideAudioScripts[$guideFilename])
    $guideSpeaker.SetOutputToNull()
  }
} finally { $guideSpeaker.Dispose() }
