' Abre o Mano sem nenhuma janela de terminal: de dois cliques aqui, ou crie um atalho dele
' na Area de Trabalho ou em shell:startup (para abrir no logon).
' O backend fica em segundo plano; o log fica em data\logs\mano.log.
' Para fechar o Mano: scripts\start.ps1 -Stop (ou a tarefa "Mano: fechar" no VS Code).
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\start.ps1"""
CreateObject("WScript.Shell").Run cmd, 0, False
