# Makes Viberant.lnk, next to this file.
#
# A shortcut holds the full path of the thing it points at, so it only means
# anything on the computer that made it. That is why one is made here rather
# than kept alongside the code.
#
#   Run it:   powershell -ExecutionPolicy Bypass -File make-shortcut.ps1
#
# To have Viberant start with Windows, press Win+R, type  shell:startup ,
# and drop the shortcut in the folder that opens.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$link = Join-Path $here 'Viberant.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $here 'start.bat'
$shortcut.WorkingDirectory = $here
$shortcut.Description = 'Open one project across your AI apps.'
# Minimised, because something you put in your startup folder should not take
# the screen the moment you sign in.
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host ""
Write-Host "  Made $link"
Write-Host "  Press Win+R, type  shell:startup , and drop it in that folder."
Write-Host ""
