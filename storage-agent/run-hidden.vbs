Set WshShell = CreateObject("WScript.Shell")
agentDir = "J:\IT STAFF\PROGRAM FILES\NKB Cloud\storage-agent"
WshShell.CurrentDirectory = agentDir
WshShell.Run "node agent-daemon.js", 0, False
