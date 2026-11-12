' Lexigraph.vbs — silent launcher (NO cmd window appears)
' Double-click this file to start Lexigraph as a Chrome app window.
'
' What it does:
'   1. Starts vite preview server completely hidden (no cmd flash)
'   2. Waits 3 seconds for server to come up
'   3. Opens Chrome --app window pointing to http://localhost:5173/
'
' If it fails silently, run Lexigraph-debug.bat instead to see the error.

Option Explicit

Dim shell, fso, scriptDir, distPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
distPath = scriptDir & "\dist\index.html"

' ---- Sanity check: dist must exist ----
If Not fso.FileExists(distPath) Then
    MsgBox "Lexigraph not built yet." & vbCrLf & vbCrLf & _
           "Please run setup.bat first to install dependencies and build." & vbCrLf & vbCrLf & _
           "Looking for: " & distPath, _
           vbCritical, "Lexigraph"
    WScript.Quit 1
End If

' ---- Start vite preview hidden in background ----
' Window style 0 = hidden, no taskbar icon, no flash
' /b runs in same window-less context
Dim cmd
cmd = "cmd /c cd /d """ & scriptDir & """ && npx vite preview --port 5173 --host 127.0.0.1"
shell.Run cmd, 0, False

' ---- Wait for server to come up ----
WScript.Sleep 3000

' ---- Find Chrome ----
Dim chromePaths, i, chromePath
chromePaths = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe" _
)

chromePath = ""
For i = 0 To UBound(chromePaths)
    If fso.FileExists(chromePaths(i)) Then
        chromePath = chromePaths(i)
        Exit For
    End If
Next

' ---- Open Chrome (--app mode if Chrome found, else default browser) ----
If chromePath <> "" Then
    shell.Run """" & chromePath & """ --app=http://localhost:5173/ --new-window", 1, False
Else
    shell.Run "http://localhost:5173/", 1, False
End If
