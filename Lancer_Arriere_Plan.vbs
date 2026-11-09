' =====================================================================
'  Evaluation PE et PO - Lanceur Windows en arriere-plan (sans console)
'  - Verifie la presence de Node.js
'  - Installe les composants au premier lancement (journal_installation.txt)
'  - Compile si necessaire (journal_compilation.txt)
'  - Empeche un second lancement pendant l'installation ou la compilation
' =====================================================================
Option Explicit

Const TITRE = "Evaluation PE et PO"
Const LOCK_MAX_MINUTES = 30

Dim WshShell, fso, scriptPath, lockPath, markerPath
Dim needsInstall, needsBuild, installExit, buildExit, answer
Dim maxAttempts, attempt, serverReady, exitCode

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
lockPath = scriptPath & "\lancement_en_cours.lock"
markerPath = scriptPath & "\node_modules\.installation_terminee"

' Supprime le verrou puis quitte
Sub Fin(code)
    On Error Resume Next
    If fso.FileExists(lockPath) Then fso.DeleteFile lockPath, True
    On Error GoTo 0
    WScript.Quit code
End Sub

' 0. Empecher un double lancement pendant une installation ou une compilation
If fso.FileExists(lockPath) Then
    If DateDiff("n", fso.GetFile(lockPath).DateLastModified, Now) < LOCK_MAX_MINUTES Then
        MsgBox "L'application est deja en cours d'installation ou de demarrage." & vbCrLf & vbCrLf & _
               "Patientez : votre navigateur s'ouvrira automatiquement a la fin." & vbCrLf & _
               "Inutile de relancer ce fichier.", vbInformation, TITRE
        WScript.Quit 0
    End If
    ' Verrou trop ancien (lancement precedent interrompu) : on l'ignore
    On Error Resume Next
    fso.DeleteFile lockPath, True
    On Error GoTo 0
End If

' 1. Verifier que Node.js est installe
If WshShell.Run("cmd.exe /c where node >nul 2>nul", 0, True) <> 0 Then
    answer = MsgBox("Node.js n'est pas installe sur cet ordinateur (ou pas encore reconnu)." & vbCrLf & vbCrLf & _
                    "1. Installez la version LTS de Node.js depuis https://nodejs.org/" & vbCrLf & _
                    "2. Redemarrez l'ordinateur si ce message reapparait apres l'installation." & vbCrLf & _
                    "3. Relancez ce fichier." & vbCrLf & vbCrLf & _
                    "Ouvrir la page de telechargement de Node.js maintenant ?", _
                    vbYesNo + vbExclamation, TITRE)
    If answer = vbYes Then WshShell.Run "https://nodejs.org/", 1, False
    WScript.Quit 1
End If

' 2. Determiner ce qui doit etre fait
needsInstall = Not fso.FileExists(markerPath)
needsBuild = WshShell.Run("cmd.exe /c cd /d """ & scriptPath & """ && powershell -NoProfile -Command ""$b='.next/BUILD_ID'; if (-not (Test-Path $b)) { exit 1 }; $bt=(Get-Item $b).LastWriteTime; $srcs=@('src','package.json','next.config.ts') | Where-Object { Test-Path $_ }; $newer = Get-ChildItem -Path $srcs -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $bt } | Select-Object -First 1; if ($newer) { exit 1 } else { exit 0 }""", 0, True) <> 0

' Poser le verrou
fso.CreateTextFile(lockPath, True).Close

' Prevenir l'utilisateur (fenetre qui se ferme seule apres 20 secondes)
If needsInstall Then
    WshShell.Popup "Premier lancement : l'application telecharge ses composants puis se compile." & vbCrLf & vbCrLf & _
                   "Cela peut prendre plusieurs minutes selon votre connexion Internet." & vbCrLf & _
                   "Aucune fenetre ne s'affiche pendant ce temps : votre navigateur" & vbCrLf & _
                   "s'ouvrira automatiquement a la fin." & vbCrLf & vbCrLf & _
                   "Ne relancez pas ce fichier en attendant.", 20, TITRE, vbInformation
ElseIf needsBuild Then
    WshShell.Popup "Compilation de l'application en cours (une a quelques minutes)." & vbCrLf & vbCrLf & _
                   "Votre navigateur s'ouvrira automatiquement a la fin." & vbCrLf & _
                   "Ne relancez pas ce fichier en attendant.", 20, TITRE, vbInformation
End If

' 3. Installer les composants si necessaire
If needsInstall Then
    installExit = WshShell.Run("cmd.exe /c cd /d """ & scriptPath & """ && npm.cmd install > journal_installation.txt 2>&1", 0, True)
    If installExit <> 0 Then
        MsgBox "L'installation des composants a echoue." & vbCrLf & vbCrLf & _
               "Verifiez votre connexion Internet, puis relancez ce fichier." & vbCrLf & vbCrLf & _
               "Pour voir le detail de l'erreur : ouvrez le fichier 'journal_installation.txt'" & vbCrLf & _
               "ou lancez 'Lancer_Correcteur_Ameliore.bat' (dossier de l'application).", vbCritical, TITRE
        Fin 1
    End If
    fso.CreateTextFile(markerPath, True).Close
End If

' 4. Liberer le port 3000
WshShell.Run "powershell -NoProfile -Command ""& { Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }""", 0, True

' 5. Compiler si necessaire (mode production)
If needsBuild Then
    buildExit = WshShell.Run("cmd.exe /c cd /d """ & scriptPath & """ && npm.cmd run build > journal_compilation.txt 2>&1", 0, True)
    If buildExit <> 0 Then
        MsgBox "Erreur lors de la compilation de l'application." & vbCrLf & vbCrLf & _
               "Pour voir le detail de l'erreur : ouvrez le fichier 'journal_compilation.txt'" & vbCrLf & _
               "ou lancez 'Lancer_Correcteur_Ameliore.bat' (dossier de l'application).", vbCritical, TITRE
        Fin 1
    End If
End If

' 6. Lancer le serveur de production en arriere-plan invisible
WshShell.Run "cmd.exe /c cd /d """ & scriptPath & """ && npm.cmd run start", 0, False

' 7. Attendre le demarrage (test du port 3000 sur 127.0.0.1)
maxAttempts = 30
attempt = 0
serverReady = False
Do While attempt < maxAttempts And Not serverReady
    WScript.Sleep 1000
    attempt = attempt + 1
    exitCode = WshShell.Run("powershell -NoProfile -Command ""& { $tcp = New-Object System.Net.Sockets.TcpClient; $connect = $tcp.BeginConnect('127.0.0.1', 3000, $null, $null); $wait = $connect.AsyncWaitHandle.WaitOne(200); if ($tcp.Connected) { $tcp.Close(); exit 0 } else { exit 1 } }""", 0, True)
    If exitCode = 0 Then serverReady = True
Loop

' 8. Ouvrir le navigateur par defaut puis liberer le verrou
WshShell.Run "cmd.exe /c start http://127.0.0.1:3000", 0, False
Fin 0
