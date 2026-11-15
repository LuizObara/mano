' Abre o Mano sem nenhuma janela de terminal: de dois cliques aqui, ou crie um atalho dele
' (o botao "Criar atalho na Area de Trabalho" em Ajustes faz isso).
' O backend fica em segundo plano; o log fica em data\logs\mano.log.
'   mano.vbs                 -> start.ps1: (re)inicia o Mano e abre o visor
'   mano.vbs /abrir          -> start.ps1 -Open: so abre o visor se o Mano ja estiver no ar (o atalho usa este)
'   mano.vbs /segundo-plano  -> start.ps1 -NoWindow: so o backend, sem visor (o "Iniciar com o Windows" usa este)
' Para fechar o Mano: Ajustes > Fechar o Mano, ou scripts\start.ps1 -Stop.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
extra = ""
If WScript.Arguments.Count > 0 Then
    Select Case LCase(WScript.Arguments(0))
        Case "/abrir": extra = " -Open"
        Case "/segundo-plano": extra = " -NoWindow"
    End Select
End If
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\start.ps1""" & extra
CreateObject("WScript.Shell").Run cmd, 0, False
